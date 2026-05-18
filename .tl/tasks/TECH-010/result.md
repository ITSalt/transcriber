---
task: TECH-010
type: tech
status: ready_for_review
commit: 34ea8a2
completed: 2026-05-18
test_run: pnpm test (vitest run)
---

# Result: TECH-010 — IAsrProvider + Deepgram Nova-3 Adapter

## Implemented

`IAsrProvider` interface defined in `shared/src/asr/types.ts` with a single `transcribe(audioPath, opts)` method returning typed `TranscriptSegment[]`. `DeepgramAdapter` in `worker/src/asr/deepgram-adapter.ts` calls Deepgram Nova-3 with diarization enabled, maps the response to the shared segment schema. API key injected via constructor for testability.

## Files

- `shared/src/asr/types.ts`
- `worker/src/asr/deepgram-adapter.ts`
- `worker/src/asr/index.ts`
- `worker/src/asr/deepgram-adapter.test.ts`

## Tests

- Test file: `worker/src/asr/deepgram-adapter.test.ts`
- Tests: 10 passed, 0 failed
- Notable cases: segments mapped with speaker labels, handles Deepgram error response, language detection forwarded

## Verification

441/441 tests pass. Typecheck clean. New ASR vendors added by implementing `IAsrProvider` — no changes to caller code required (ADR-006).
