---
task: UC-200
phase: be
status: ready_for_review
commit: 9d7fda1
completed: 2026-05-18
test_run: pnpm test (vitest run)
---

# Result: UC-200 BE — Transcription Worker Pipeline

## Implemented

BullMQ job handler `worker/src/jobs/transcription.ts` orchestrates the full transcription pipeline: download video from S3, extract audio via ffmpeg, call `IAsrProvider` (Deepgram Nova-3), persist `TranscriptSegment[]` to the Meeting record as JSONB, update job status to `DONE`, and publish SSE events at each stage. Error states update job to `FAILED` with error message stored.

## Fixes Applied (code review M-1 + M-2)

**M-1 (RQ-016 — ProtocolGenerationJob not enqueued to BullMQ):** After the Prisma `$transaction` completes, `prisma.protocolGenerationJob.create` now captures the returned row's `id`. A `createQueues(redisUrl)` call then adds a `'generateProtocol'` job to the `protocolGenerationJob` BullMQ queue with payload `{ protocol_generation_job_id }`. The enqueue is outside the transaction (after-commit side effect). Queue is closed in a `finally` block.

**M-2 (ADR-006 — concrete DeepgramAsrProvider type in deps):** `TranscriptionDeps.asr` is now typed as `IAsrProvider` (from `@transcrib/shared`). `DeepgramAsrProvider` is still used as the default factory (`deps?.asr ?? new DeepgramAsrProvider()`), but the interface governs the type annotation.

## Files

- `worker/src/jobs/transcription.ts`
- `worker/src/jobs/transcription.test.ts`

## Tests

- Test file: `worker/src/jobs/transcription.test.ts`
- Tests: 21 passed, 0 failed
- Notable cases: full pipeline happy path persists segments, ffmpeg failure sets job to FAILED, SSE event published on status transitions, BullMQ protocol queue `add` called with correct job ID after successful transcription (new T03 enqueue assertion)

## TDD

RED -> GREEN -> REFACTOR pattern followed. Tests written before implementation.

## Notes

Follow-up commit `8e92405` aligned protocol field writes introduced by UC-300 with the UC-301 schema rename — no behavioral change to the transcription pipeline itself.
