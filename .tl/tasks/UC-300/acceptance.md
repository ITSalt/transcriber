# UC-300 — Acceptance Criteria

**UC:** Generate protocol pipeline
**Spec version:** 1 (regenerated 2026-08-13 after DEC-001)

> Status vocabulary below follows Prisma (`PENDING/PROCESSING/DONE/FAILED`), not
> the older `QUEUED/IN_PROGRESS/COMPLETED` wording still carried by some RQ
> descriptions in the graph — see "Spec divergences" in `task-be.md`.

## Criteria

- [ ] GIVEN a Transcript is persisted, THEN a ProtocolGenerationJob is auto-created per BRQ-007 with `status=PENDING`.
- [ ] GIVEN a worker runs the job, THEN it loads the transcript, selects the prompt template by `Meeting.language` (BRQ-013), calls the LLM, parses the response, and validates the four required sections (BRQ-011).
- [ ] GIVEN the LLM succeeds AND all required sections are present, THEN Protocol is persisted (markdown, `version=1`, `edit_count=0`), `Meeting.status → PROTOCOL_READY`, `job.status → DONE`.
- [ ] GIVEN a **PERMANENT** failure (effective status 400/401/402/413 or any other unlisted 4xx, JSON parse error, empty/unparseable completion, missing required section), THEN `job.status → FAILED` with non-null `error_msg` and `Meeting.status → FAILED`, on the spot.
- [ ] GIVEN a **TRANSIENT** failure (effective status 404/408/429/5xx, including a code delivered inside an HTTP 200 `{code,msg}` envelope, or a network/transport failure) AND BullMQ attempts remain, THEN the handler re-throws and writes **nothing** — the job stays non-terminal and the next attempt proceeds with exponential backoff.
- [ ] GIVEN a TRANSIENT failure on the **final** exhausted attempt, THEN `job.status → FAILED` with `error_msg` and `Meeting.status → FAILED`.
- [ ] GIVEN an error, THEN its message carries a ≤200-char body excerpt, so a routing 404 shows its `path` and an envelope error shows its `msg`.
- [ ] GIVEN the default configuration, THEN the kie.ai endpoint is exactly `https://api.kie.ai/claude/v1/messages` (the `1f025b7` outage was a regression of this and nothing covered it).

## Tied to requirements

- **RQ-021** — ProtocolGenerationJob lifecycle: `PENDING → PROCESSING → {DONE, FAILED}`. Terminal immutable (BRQ-009).
- **RQ-022** — LLM prompt template selected by `Meeting.language` (BRQ-013); resulting protocol language MUST match transcript language. Template version is a module constant at MVP, not a job column.
- **RQ-023** — Persisted Protocol MUST contain Participants, Discussion Topics, Decisions, Action Items (BRQ-011). Missing section → job FAILED (permanent).
- **RQ-024** — Action items SHOULD include assignee/deadline when stated (BRQ-012). Best-effort by LLM.
- **RQ-025** — Initial Protocol on success: `version=1`, `edit_count=0`, `generated_at=now`. `Meeting.status → PROTOCOL_READY` (BRQ-008/014/015).
- **RQ-026** — Failure classification by **effective status** (`body.code` when an HTTP 200 body carries a numeric `code != 200`, else the HTTP status). PERMANENT or final-exhausted-attempt → `FAILED` + `error_msg` + `Meeting.status=FAILED` (BRQ-008/010). TRANSIENT with attempts remaining → re-throw without writing, so the BRQ-009 idempotency guard does not see a terminal row. (FR-001; revised by DEC-001, 2026-08-13.)
- **NFR-002** — Async; non-blocking UI.
- **NFR-003** — No SLA at MVP.
- **NFR-004** — RU + EN.
- **NFR-006** — Markdown canonical; PDF transient (re-rendered).
- **NFR-008** — Failures surfaced; terminal immutable.

## Applicability limit (F-004)

The retry criteria above are observable **only** on the worker-enqueued path
(`worker/src/queues.ts`, `attempts=3`). `api/src/queue.ts` enqueues without
`defaultJobOptions`, so on the UC-100 upload path and the UC-004 retry button
BullMQ's default `attempts=1` applies and a transient error fails on the first
attempt. Do not write an acceptance test that asserts retry on those paths until
F-004 lands.

## Sign-off

- [ ] BE tests in `test-spec.md` all pass.
- [ ] `/nacl-tl-review UC-300 --be` APPROVED. (No FE task exists — `UC-300.has_ui = false`, actor SYSTEM.)
