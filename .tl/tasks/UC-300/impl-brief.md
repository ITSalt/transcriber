# UC-300 — Backend Implementation Brief

**UC:** Generate protocol pipeline  ·  **Spec version:** 1 (regenerated 2026-08-13)

## File plan (as shipped)

- `worker/src/jobs/protocol-generation.ts` — worker handler (job lifecycle, section validation, status transitions)
- `worker/src/llm/kieai.ts` — kie.ai adapter behind `ILlmProvider`; owns transience classification
- `worker/src/llm/prompts/{ru,en}/protocol.md` — prompt templates (copied into `dist` by the worker build)
- `worker/src/jobs/protocol-generation.test.ts` · `protocol-generation.regression.test.ts` · `worker/src/llm/kieai.test.ts` — tests

## Steps

1. Worker dequeues; `UPDATE ProtocolGenerationJob SET status='PROCESSING', started_at=now WHERE id=:id AND status='PENDING'`.
2. Load Meeting; load Transcript via `meeting_id`; read `Meeting.language` (canonical — `Transcript.language` is derived, not persisted).
3. Select the prompt template per `Meeting.language` (RU/EN). `PROTOCOL_PROMPT_TEMPLATE_VERSION` is a module constant; there is no job column to write it to.
4. Submit transcript + prompt to `ILlmProvider.generate` (TECH-011). Never call the kie.ai SDK directly from a job handler.
5. Parse the LLM response into Markdown.
6. Validate the four required sections (RQ-023). Missing → permanent-failure path.
7. `INSERT Protocol(meeting_id, markdown_content, version=1, edit_count=0, generated_at=now)` (RQ-025).
8. Transition `Meeting.status → PROTOCOL_READY` (BRQ-008).
9. Transition `ProtocolGenerationJob.status → DONE, finished_at=now` (RQ-021).
10. Publish SSE `meeting.status` post-commit.
11. ALT failure path (RQ-026 / RC-UC-300) — classify by **effective status**, then branch:
    - **TRANSIENT** (404/408/429/5xx incl. in-envelope, or network/transport) **and** attempts remain → re-throw with **no DB write**. Writing `FAILED` here would make the BRQ-009 idempotency guard treat the job as terminal and silently no-op every later attempt.
    - **PERMANENT** (400/401/402/413, other unlisted 4xx, parse failure, empty completion, missing section) **or** the final exhausted attempt → `FAILED` with descriptive `error_msg`, `finished_at=now`, `attempt_count=attemptsMade+1`; `Meeting.status → FAILED`; publish SSE; do NOT re-enqueue.

## Classification detail (owned by `kieai.ts`, not by the job handler)

`protocol-generation.ts` routes purely on `isTransientLlmError()` — keep it that
way. All provider knowledge stays in the adapter:

- `effective = body.code` when HTTP status is 200 AND the parsed body is an object with a numeric `code != 200`; otherwise `effective =` the HTTP status.
- Transient set: `404, 408, 429, 5xx` + thrown network/transport errors.
- Permanent set: `400, 401, 402, 413`, any other unlisted 4xx, and local parse/empty-completion/missing-section errors.
- Attach a ≤200-char body excerpt to every thrown message (diagnosability — a routing 404 must show its `path`).

## Cross-cutting

- All Prisma writes that touch `Meeting.status` go through a single transaction with the relevant child write (BRQ-008 mirror).
- All errors throw `AppError(code, http, message)` — never ad-hoc objects.
- Each RQ ID referenced by a code comment on the line that satisfies it.
- Handlers MUST be idempotent under BullMQ retry; check `job.status` before mutating — but note the guard MUST NOT see a terminal row mid-retry (step 11).
- Terminal-state writes (`DONE`/`FAILED`) require a `WHERE status='PROCESSING'` guard (BRQ-009).
- The failure column is `error_msg`; several RQ descriptions still word it `error_reason`.

## F-004 — CLOSED 2026-08-15

`api/src/queue.ts` now sets `defaultJobOptions: JOB_RETRY_OPTIONS` on both
producers, so the retry policy applies on the UC-100 upload path and the UC-004
retry button too. The policy and the queue names live in
`shared/src/queue/job-options.ts` so api/ and worker/ cannot drift again.

Both worker pipelines derive `isFinalAttempt` from `job.opts.attempts` rather
than a local `MAX_ATTEMPTS`, so a misconfigured producer degrades to an honest
FAILED instead of stranding the meeting. Deepgram parity is still **F-005**.
