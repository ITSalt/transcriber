---
task: UC-200
phase: be
verdict: approved
headline: REVIEW APPLIED — UNVERIFIED (test author overlap 100%)
commit: pending
reviewed: 2026-05-18
reviewer: nacl-tl-review (strategist)
blockers: []
prior_blockers_resolved: [M-1, M-2]
---

# Re-Review: UC-200 BE — Transcription Worker Pipeline

Workflow status: `REVIEW APPLIED — UNVERIFIED (test author overlap 100%)`. Code judgment: `APPROVED`. Prior M-1 and M-2 blockers have been resolved and verified in source + tests. Headline retains UNVERIFIED qualifier per conductor-workflow precedent because the test suite was authored by the same agent that wrote production code (informational, non-blocking).

## Stub Gate

PASS — Zero TODO/FIXME/STUB markers in worker/src/jobs/transcription.ts or transcription.test.ts.

## Test Run

`pnpm test` from C:\projects\transcrib: **457 passed, 7 skipped** (29 test files + 1 skipped Prisma smoke suite). Matches expected baseline.
- worker/src/jobs/transcription.test.ts: **21/21 passed** (70 ms) — one new test added since prior review.
- Duration: 8.55s total.

## Blocker Resolution

### M-1 — ProtocolGenerationJob now enqueued to BullMQ (RESOLVED)

**File:** worker/src/jobs/transcription.ts lines 296-316

After `prisma.protocolGenerationJob.create(...)` (line 298), the code now:
1. Instantiates the queue registry via `createQueues(redisUrl)` (line 308).
2. Builds the typed payload `{ protocol_generation_job_id: protoJob.id }` typed as `ProtocolGenerationJobPayload` from `@transcrib/shared` (line 309).
3. Calls `queues[QueueName.Protocol].add('generateProtocol', payload)` (line 311).
4. Closes the queue in a `finally` block (line 313) to release the ioredis connection.

Critically, the enqueue is **outside** the `$transaction` (which ends at line 289), so the BullMQ side effect only fires after the DB commit — correct after-commit ordering per BRQ-007 / RQ-016.

`redisUrl` is sourced from `deps?.redisUrl ?? process.env['REDIS_URL'] ?? 'redis://localhost:6379'` (line 176), preserving injectability for tests and prod env override.

**Test coverage:** `T03 (RQ-016) — enqueues ProtocolGenerationJob to BullMQ queue after DB create` (transcription.test.ts lines 378-390) asserts `mockProtocolQueue.add` is called once with `'generateProtocol'` and the correct `protocol_generation_job_id: PROTO_JOB_ID` payload. PASS.

### M-2 — IAsrProvider interface binding (RESOLVED)

**File:** worker/src/jobs/transcription.ts lines 27, 154, 236

- Line 27: `import type { IAsrProvider } from '@transcrib/shared'` — interface imported from shared package (ADR-006).
- Line 154: `asr?: IAsrProvider` in `TranscriptionDeps` — dependency is now interface-typed, no longer `InstanceType<typeof DeepgramAsrProvider>`.
- Line 30: `import { DeepgramAsrProvider } from '../asr/deepgram-adapter.js'` — concrete adapter remains imported.
- Line 236: `const asr = deps?.asr ?? new DeepgramAsrProvider()` — concrete adapter used **only as default factory** when no injected provider is supplied.

This satisfies ADR-006 (provider abstraction lives in shared/, no concrete vendor SDK calls leak into job logic) while preserving the working default for production.

## Acceptance Criteria

| Criterion | Verdict | Notes |
|-----------|---------|-------|
| Worker picks up QUEUED job → PROCESSING + startedAt | PASS | T01; optimistic updateMany WHERE status=PENDING (line 209-212) |
| ASR success → Transcript persisted, Meeting=TRANSCRIBED, job=COMPLETED, ProtocolGenerationJob created **and enqueued** | PASS | T03 + new enqueue test; DB row + BullMQ side effect both verified |
| ASR failure → job FAILED + error_reason, Meeting=ERROR, terminal immutable | PASS | T02/T09; BRQ-009 guard at line 195 + WHERE clause on line 345 |
| ProtocolGenerationJob auto-enqueue (RQ-016) | PASS | M-1 resolved; new test asserts enqueue behavior |

## 8-Category BE Checklist

| Category | Verdict | Notes |
|----------|---------|-------|
| Spec alignment | PASS | Step 10 ("create AND enqueue") now satisfied; full pipeline matches task-be.md system steps |
| Error handling | PASS | All paths funnel into catch; ALT transaction guarded against terminal writes; queue close in finally prevents redis leak even on enqueue throw |
| Concurrency / idempotency | PASS | Optimistic concurrency (line 209-218) + terminal-state guard at entry (line 195) |
| Transactional integrity | PASS | Single `$transaction` (line 256-289) wraps all SoR writes; BullMQ enqueue correctly placed AFTER commit (after-commit side effect) |
| Provider abstraction (ADR-006) | PASS | `deps.asr: IAsrProvider`; `DeepgramAsrProvider` is default factory only |
| Logging | PASS | Pino structured logs on every transition incl. new "enqueued to BullMQ" log at line 316 |
| Testing | PASS | 21 tests; covers happy path, two failure paths, speaker resolution (RU+EN), language hint matrix, BullMQ enqueue assertion |
| Type safety | PASS | Prisma types throughout; `ProtocolGenerationJobPayload` Zod-inferred from `@transcrib/shared`; `IAsrProvider` interface-typed |

## Critical Issues

None. Prior M-1 (BullMQ enqueue) and M-2 (IAsrProvider binding) both fully resolved with verifying test.

## Minor Issues (carried forward, non-blocking)

- **m-1:** Spec vocabulary drift (task-be.md uses QUEUED/IN_PROGRESS/COMPLETED/FAILED vs actual PENDING/PROCESSING/DONE + TRANSCRIBED/ERROR) — pre-existing, route to `/nacl-tl-reconcile`. Not a BE-code issue.
- **m-2:** Speaker-resolution regex on line 64 — `/I(?:'m|'m| am)/` has visually duplicate apostrophe alternative. Functionally correct (both ASCII `'` and curly `'` would need handling, but currently both branches are ASCII). Cosmetic redundancy only.
- **m-3:** Redundant `findUnique` in failure transaction at line 350 — `meetingId` is already in outer-scope `meeting.id` (line 200) when the failure happens after meeting load. Minor; defensive read is harmless in the error path.
- **m-4:** `prompt_template_version` not yet in Prisma schema for `ProtocolGenerationJob` — gap for UC-301 to address; UC-200 only creates the row with `meetingId + status: 'PENDING'`, consistent with current schema.
- **m-5:** Queue is freshly constructed + closed on every job processed (line 308 + 313). Acceptable for MVP (NFR-003: no SLA), but a single long-lived queue instance shared with the worker process would reduce ioredis churn. Optimization candidate, not a defect.

## TDD Compliance

Fix delivered as a follow-up commit (commit reference pending status.json update). TDD phase commits not auditable in single-commit fix. Non-blocking per conductor-workflow precedent.

## Test Author Independence

100% overlap — MAJOR flag. Same agent authored production fix and the new `T03 enqueues ProtocolGenerationJob to BullMQ` test. Non-blocking per conductor precedent (TECH-009 / TECH-010 / prior UC-200 review). The headline retains `UNVERIFIED (test author overlap 100%)` per the conductor-workflow precedent. Recommend `/nacl-tl-regression-test --retroactive UC-200` to add an independent regression layer before QA.

## Verdict

**APPROVED.** Both M-1 and M-2 are correctly fixed in source, the new test directly proves the BullMQ enqueue behavior, and the full suite passes at 457/464 (7 expected Prisma smoke skips). Pipeline is ready for QA.

## Next Steps

1. Set UC-200 phases.be = "approved" and phases.review-be = "approved" in `.tl/status.json`. (this re-review writes the change)
2. Run `/nacl-tl-regression-test --retroactive UC-200` to mitigate the test-author overlap flag before promotion to QA.
3. Optionally route minor m-1 (vocabulary drift in task-be.md) to `/nacl-tl-reconcile` as a follow-up doc-sync.
4. Proceed to UC-200 QA (`/nacl-tl-qa UC-200`) — UC-201 BE and UC-300 BE are no longer blocked at the pipeline-correctness level.
