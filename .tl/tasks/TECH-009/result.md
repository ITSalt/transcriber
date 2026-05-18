---
task: TECH-009
type: tech
status: ready_for_review
commit: 528f0ba
completed: 2026-05-18
test_run: pnpm test (vitest run)
---

# Result: TECH-009 — ffmpeg Audio Extraction

## Implemented

`worker/src/lib/ffmpeg.ts` wraps `fluent-ffmpeg` to extract audio from video files as 16 kHz mono WAV, suitable for ASR input. Function accepts a source path and output path, returns a Promise. Codec, sample-rate, and channel flags hardcoded to Deepgram-optimal defaults.

## Files

- `worker/src/lib/ffmpeg.ts`
- `worker/src/lib/ffmpeg.test.ts`

## Tests

- Test file: `worker/src/lib/ffmpeg.test.ts`
- Tests: 6 passed, 0 failed
- Notable cases: spawns ffmpeg with correct audio flags, rejects on non-zero exit code, cleans up temp file on error

## Verification

441/441 tests pass. Typecheck clean. ffmpeg binary assumed present in Docker image (`ffmpeg` package installed in `worker` Dockerfile).
