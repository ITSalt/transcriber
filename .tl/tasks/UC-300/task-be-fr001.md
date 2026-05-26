---
id: UC-300-BE
title: Generate protocol pipeline — backend (FR-001 failure-path refinement)
type: uc-be
uc: UC-300
module: mod-protocol
actor: SYSTEM
wave: 12
priority: high
intake_id: FR-001
replans: UC-300-BE
depends_on: ['TECH-026', 'UC-200-BE']
blocks: ['UC-004-BE']
---

# UC-300-BE — FR-001 refinement: transient vs permanent FAILED-write timing

> Re-plan of the existing UC-300-BE task (status was verified-pending). This addendum captures ONLY
> the FR-001 delta; the original `task-be.md` remains the base spec. Source: Neo4j (RQ-026 refined,
> RC-UC-300 retry_semantics refined). Depends on TECH-026 (attempt_count migration).

## Why this re-plan

Resolves the prior contradiction where RQ-026 / task docs said "do NOT re-enqueue" while RC-UC-300
specified retry-on-429/5xx. Symmetrical to the UC-200 transcription refinement.

## Refined requirement — RQ-026 (FR-001)

> On a PERMANENT failure during protocol generation (parse error, missing required sections, or a
> non-retriable kie.ai error per RC-UC-300) OR after BullMQ retry exhaustion (final attempt),
> job.status=FAILED with non-null error_reason (BRQ-010) and Meeting.status=FAILED (BRQ-008). A
> TRANSIENT failure (kie.ai 429/5xx) with attempts remaining MUST re-throw WITHOUT writing FAILED, so
> the BRQ-009 idempotency guard does not treat the job as terminal and the next BullMQ attempt proceeds.

## Refined runtime contract — RC-UC-300 retry_semantics (FR-001)

> Max 3 attempts, exponential backoff. Retry on 429/5xx; halt on 401/400 (CONTRACT_FAILED) and 404
> (MODEL_NOT_FOUND per .tl/external-contracts/kie-anthropic.md §8). **REFINEMENT (FR-001):** the
> failure handler MUST NOT write job.status=FAILED while BullMQ attempts remain for a TRANSIENT error
> (kie.ai 429/5xx); it re-throws so BullMQ schedules the next attempt. The idempotency guard must NOT
> treat a non-final state as terminal. job.status=FAILED (and Meeting.status=FAILED) is written ONLY
> on a non-retriable/permanent error (401/400/404, parse error, missing-section) or on the final
> exhausted attempt. `attempt_count` mirrors BullMQ `attemptsMade`.

## Code changes (from FR-001 implementation notes)

- `worker/src/jobs/protocol-generation.ts` — mirror the transcription.ts change: on catch, if the
  error is TRANSIENT (kie.ai 429/5xx) and `job.attemptsMade < maxAttempts`, re-throw WITHOUT the
  FAILED transaction; write FAILED only on a permanent error (401/400/404, parse error,
  missing-section) or the final attempt. Set `attempt_count = job.attemptsMade`.
- Configure BullMQ `attempts: 3` + exponential backoff (already in RC-UC-300).
- **Drift to reconcile:** `Meeting.status='ERROR'` → spec `FAILED` on the failure path.

## Dependencies
- DEPENDS_ON TECH-026 (attempt_count column) and UC-200-BE (transcription refinement lands first,
  preserving the original UC-300 → UC-200 ordering).

## Acceptance
- [ ] Transient kie.ai 429/5xx with attempts remaining → re-throw, NO FAILED write, BullMQ retries.
- [ ] Permanent error (401/400/404, parse error, missing-section) → FAILED + Meeting.status=FAILED.
- [ ] Final exhausted attempt → FAILED + Meeting.status=FAILED.
- [ ] `attempt_count` mirrors `attemptsMade`.
- [ ] Contradiction resolved: retry-on-429/5xx now consistent between RQ-026 and RC-UC-300.
