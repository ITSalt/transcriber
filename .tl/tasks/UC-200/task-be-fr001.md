---
id: UC-200-BE
title: Process transcription pipeline — backend (FR-001 failure-path refinement)
type: uc-be
uc: UC-200
module: mod-transcription
actor: SYSTEM
wave: 12
priority: high
intake_id: FR-001
replans: UC-200-BE
depends_on: ['TECH-026']
blocks: ['UC-004-BE']
---

# UC-200-BE — FR-001 refinement: transient vs permanent FAILED-write timing

> Re-plan of the existing UC-200-BE task (status was verified-pending). This addendum captures ONLY
> the FR-001 delta; the original `task-be.md` remains the base spec. Source: Neo4j (RQ-015 refined,
> RC-UC-200 retry_semantics refined). Depends on TECH-026 (attempt_count migration).

## Why this re-plan

Today a transient ASR failure permanently bricks a meeting: the failure handler writes
`status=FAILED` first, so the BRQ-009 idempotency guard (`status===FAILED → return`) no-ops any
re-attempt, and BullMQ runs with `attempts=1`. This refinement makes bounded auto retry-with-backoff
actually work.

## Refined requirement — RQ-015 (FR-001)

> On a PERMANENT failure during transcription (storage-not-found, audio-extraction error, or a
> non-retriable ASR error per RC-UC-200) OR after BullMQ retry exhaustion (final attempt),
> job.status MUST become FAILED with non-null human-readable error_reason (BRQ-010) and
> Meeting.status MUST transition to FAILED (BRQ-008). A TRANSIENT failure (Deepgram 429/5xx) with
> attempts remaining MUST re-throw WITHOUT writing FAILED, so the BRQ-009 idempotency guard does not
> treat the job as terminal and the next BullMQ attempt proceeds.

## Refined runtime contract — RC-UC-200 retry_semantics (FR-001)

> BullMQ retry: max 3 attempts, exponential backoff (initial 5s, multiplier 2). On 429/5xx from
> Deepgram, BullMQ retries; on 401/400/402/413 the worker throws a non-retriable DeepgramAsrError and
> the job goes to FAILED. **REFINEMENT (FR-001):** the failure handler MUST NOT write
> job.status=FAILED while BullMQ attempts remain for a TRANSIENT error (Deepgram 429/5xx); it
> re-throws so BullMQ schedules the next attempt. The idempotency guard must NOT treat a non-final
> state as terminal. job.status=FAILED (and Meeting.status=FAILED) is written ONLY on a non-retriable
> error (401/400/402/413) or on the final exhausted attempt. `attempt_count` mirrors BullMQ
> `attemptsMade`.

## Code changes (from FR-001 implementation notes)

- `worker/src/jobs/transcription.ts`:
  - **Guard (~lines 185-188):** stop treating a non-final FAILED as terminal.
  - **Failure handler (~lines 332-343):** on catch, if the error is TRANSIENT and
    `job.attemptsMade < maxAttempts`, re-throw WITHOUT the FAILED transaction; write FAILED only on a
    permanent error or the final attempt. Set `attempt_count = job.attemptsMade`.
- Configure BullMQ `attempts: 3` + exponential backoff (already specified in RC-UC-200).
- **Drift to reconcile:** worker uses `Meeting.status='ERROR'`; spec enum is `FAILED` (order 7).
  Read/write the spec value on the failure path (or raise a separate L1 fix).
- A regression test already exists at `worker/src/jobs/transcription.regression.test.ts` (uncommitted)
  — wire it to the new behaviour.

## Dependency
- DEPENDS_ON TECH-026 (the `attempt_count` column must exist before this lands).

## Acceptance
- [ ] Transient Deepgram 429/5xx with attempts remaining → re-throw, NO FAILED write, BullMQ retries.
- [ ] Permanent error (401/400/402/413, storage-not-found, audio-extraction) → FAILED + Meeting.status=FAILED.
- [ ] Final exhausted attempt → FAILED + Meeting.status=FAILED.
- [ ] `attempt_count` mirrors `attemptsMade`.
- [ ] Idempotency guard no longer treats a non-final state as terminal.
