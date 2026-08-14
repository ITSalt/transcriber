# UC-300 — Backend Test Spec

**UC:** Generate protocol pipeline  ·  **Wave:** 12  ·  **Spec version:** 1

Test framework: **Vitest** (worker workspace). The pipeline is a BullMQ worker
handler, so there is no HTTP surface and no supertest here.

Each test references an RQ ID. Add new tests when adding new RQs.

## Existing coverage (as shipped — 169 worker tests green)

| File | Covers |
|------|--------|
| `worker/src/jobs/protocol-generation.test.ts` | Happy path, section validation, status transitions |
| `worker/src/jobs/protocol-generation.regression.test.ts` | FR-001 transient re-throw without a terminal write (`verification_evidence` of record) |
| `worker/src/llm/kieai.test.ts` | DEC-001 effective-status classification, endpoint default |

## Test scenarios

### T01. RQ-021 — lifecycle `PENDING → PROCESSING → {DONE, FAILED}`
Job picked up flips `PENDING→PROCESSING` with `started_at`; success reaches
`DONE` with `finished_at`; a terminal row is never mutated again (BRQ-009).

### T02. RQ-022 — prompt template selected by `Meeting.language`
`Meeting.language = EN` → EN template and EN section headers. `RU` → RU. **`AUTO`
→ RU** (DEC-003), including when `Transcript.language = 'EN'` — the recording's
language MUST NOT change the template. There is no `AUTO → EN` fallback; a test
asserting one encodes the 2026-08-14 defect and MUST NOT be reintroduced.
Anti-regression: `AUTO` + a Russian transcript + an LLM returning valid **English**
markdown ⇒ job FAILED on missing sections and `protocol.create` NOT called. Do
**not** assert a `prompt_template_version` column — none exists (module constant only).

### T03. RQ-023 — four required sections enforced
RU headers `## Участники / ## Обсуждение / ## Решения / ## Задачи`; EN headers
`## Participants / ## Discussion / ## Decisions / ## Action Items`. Any missing
section → job `FAILED` (permanent, no retry).

### T04. RQ-024 — action items include assignee/deadline when stated
Best-effort; absence is acceptable and MUST NOT fail the job.

### T05. RQ-025 — initial Protocol shape
`version=1`, `edit_count=0`, `generated_at` set; `Meeting.status →
PROTOCOL_READY`; Protocol created exactly once for a `meetingId` (uniqueness
constraint).

### T06. RQ-026 / DEC-001 — TRANSIENT classification (effective status)
Table-driven over the transient set. Each case asserts `isTransientLlmError()`
is true AND that the handler re-throws **without** writing `FAILED`:

| Case | Delivery |
|------|----------|
| 404 | HTTP 404 + Spring whitelabel body `{timestamp,status,error,message,path}` |
| 408 | HTTP 408 |
| 429 | HTTP 429 |
| 500 / 502 / 503 | HTTP 5xx |
| in-envelope 429 | **HTTP 200** + `{code:429,msg:…}` |
| in-envelope 500 | **HTTP 200** + `{code:500,msg:…}` |
| network | DNS failure / connection reset / socket timeout (thrown, no response) |

### T07. RQ-026 / DEC-001 — PERMANENT classification
Each case asserts an immediate `FAILED` + non-null `error_msg` + `Meeting.status
= FAILED`, with no re-throw:

| Case | Delivery |
|------|----------|
| 400 / 402 / 413 | HTTP status |
| in-envelope 401 | **HTTP 200** + `{code:401,msg:'Unauthorized…'}` (the live-probe case) |
| unlisted 4xx (e.g. 418) | HTTP status — default-permanent |
| local | JSON parse failure / empty completion / missing section |

### T08. RQ-026 — retry exhaustion is terminal
A transient error on the **final** attempt (`attemptsMade` = last) writes
`FAILED`, `error_msg`, `attempt_count = attemptsMade+1`, `Meeting.status=FAILED`.

### T09. RQ-026 — idempotency guard must not see a terminal row mid-retry
After a transient re-throw, the job row is still non-terminal, so the next
attempt is NOT skipped as already-done. This is the exact bug FR-001 fixed and
DEC-001 widened.

### T10. Error message diagnosability (DEC-001)
The thrown message carries a ≤200-char body excerpt: a routing 404 surfaces its
`path`; an envelope error surfaces its `msg`. Previously the banner could not
distinguish a bad path from a bad model.

### T11. Endpoint default (regression guard for `1f025b7`)
With no override, the kie.ai endpoint is exactly
`https://api.kie.ai/claude/v1/messages`. This assertion did not exist before
DEC-001 and the `1f025b7` production outage was precisely its absence.

### T12. NFR-002 / NFR-003 / NFR-004 / NFR-006 / NFR-008
Async job-based execution (no blocking call); no SLA assertion; RU+EN covered by
T02; Markdown canonical (PDF never persisted); failures always carry a
human-readable `error_msg` and terminal rows are immutable.

## Integration tests

- Full lifecycle: enqueue → handler → `DONE` with Transcript/Protocol persisted and SSE `meeting.status` published post-commit.
- Permanent-failure path: stub provider to return an in-envelope 401 → job `FAILED` with `error_msg`, `Meeting.status=FAILED`, no re-enqueue.
- Transient-then-success: stub provider to 404 once then succeed → job reaches `DONE` on attempt 2, and no `FAILED` was ever written.
- Lock: `bullmq-job:protocol-gen:<meetingId>` — only one worker per meeting.

## Verification command

```bash
pnpm --filter worker test        # vitest run — 169 tests
pnpm --filter worker test -- protocol-generation
pnpm --filter worker test -- kieai
```
