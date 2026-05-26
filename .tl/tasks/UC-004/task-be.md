---
id: UC-004-BE
title: Retry failed meeting processing — backend
type: uc-be
uc: UC-004
module: mod-common
actor: AUTHOR
wave: 13
priority: high
intake_id: FR-001
depends_on: ['UC-200-BE', 'UC-300-BE']
blocks: ['UC-004-FE']
---

# UC-004-BE — Retry failed meeting processing (API)

> Source: Neo4j SA layer (UC-004, RC-UC-004, RQ-034/035/036). FeatureRequest FR-001.

## User story

> As an AUTHOR, when my Meeting is stuck in FAILED after a transient ASR/LLM error, I trigger
> "Retry processing" so the System re-enqueues the failed stage and the meeting resumes.

## Actor & Authorization

**AUTHOR** (SR-01), scope `own`.

| Entity | CRUD | Scope |
|--------|------|-------|
| `TranscriptionJob` (ent-003) | RU | own |
| `ProtocolGenerationJob` (ent-005) | RU | own |
| `Meeting` | RU | own (status transition) |

## Functional requirements

| ID | Type | Priority | Description |
|----|------|----------|-------------|
| RQ-034 | functional | high | AUTHOR MAY trigger retry on a Meeting with status=FAILED. System identifies the most recent FAILED job (TranscriptionJob or ProtocolGenerationJob), re-enqueues that stage as a new attempt (status=QUEUED, attempt_count=0, error_msg cleared), and transitions Meeting.status FAILED → TRANSCRIBING (transcription failure) or PROTOCOL_GENERATING (protocol failure). Per BRQ-008. |
| RQ-035 | functional | high | Retry MUST be idempotent: if a re-enqueued job for meeting+stage is already QUEUED or IN_PROGRESS, re-triggering MUST NOT create a duplicate job. Idempotency key = meetingId + stage. |
| RQ-036 | functional | high | Retry offered ONLY when Meeting.status=FAILED; any other status → API rejects with 409-class (conflict), no state change. |

## Main flow (system steps, from UC-004-AS03..AS06)

1. (AS03) Identify the most recent FAILED job for the meeting (TranscriptionJob or ProtocolGenerationJob) to determine which stage to retry (RQ-034).
2. (AS04) In ONE Prisma transaction: reset that job (`status=QUEUED`, `attempt_count=0`, `error_msg=null`) and transition `Meeting.status` FAILED → TRANSCRIBING | PROTOCOL_GENERATING per failed stage (RQ-034, BRQ-008).
3. (AS05) After commit: enqueue the job to BullMQ (idempotent on meetingId+stage; no duplicate if already queued) and publish SSE `meeting.status` (RQ-035).
4. (AS06) ALT: if the Meeting is not in FAILED status, reject with a 409-class error and make NO changes (RQ-036).

## Runtime contract (RC-UC-004)

- **Transaction boundaries:** single Prisma transaction resets the failed Job AND transitions Meeting.status; enqueue is an after-commit side effect (mirrors RQ-016 pattern in UC-200).
- **Event lifecycle:** SSE `meeting.status` published to Redis channel `meeting:<id>` AFTER the re-enqueue transaction commits.
- **Idempotency key strategy:** meetingId + failed stage. If a job for that meeting+stage is already QUEUED/IN_PROGRESS, retry is a no-op.
- **Durable state machine:** Meeting.status FAILED → {TRANSCRIBING | PROTOCOL_GENERATING} chosen by the most recent FAILED job's stage. Only a FAILED meeting is a valid entry state (RQ-036).
- **Cancel/race resolution:** if the worker is already mid-processing the same meeting+stage (lock held), retry no-ops via the idempotency guard rather than racing.
- **Retry semantics:** user-triggered (not BullMQ-driven). The re-enqueued worker job is then subject to its own BullMQ retry policy (RC-UC-200 / RC-UC-300).

## API endpoint to implement

See `api-contract.md`. `POST /api/meetings/:id/retry` (no body) → 200 updated meeting; 409 when not FAILED.

## Implementation notes (FR-001)

- **Spec value is `FAILED`,** not `ERROR`. Worker/API code currently uses `Meeting.status='ERROR'`; reconcile to the spec enum `MeetingStatus.FAILED` (order 7) on this path (or raise a separate L1 fix). Read/write the spec value.
- `attempt_count` column is added by **TECH-026** (depends_on). This task assumes the migration has landed.
- Depends on UC-200-BE and UC-300-BE refinements (FR-001) so the re-enqueued jobs honour transient-vs-permanent FAILED-write semantics.

## Out of scope

UI (CMP-RetryProcessing, confirm dialog) → UC-004-FE.
