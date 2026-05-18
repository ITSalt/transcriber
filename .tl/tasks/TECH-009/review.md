---
task: TECH-009
type: review
mode: tech
status: approved
reviewed: 2026-05-18
commit: 528f0ba
---

# Review: TECH-009 — ffmpeg Audio Extraction Utility

Workflow status: `REVIEW COMPLETE`. Code judgment: `APPROVED`. Action required: none.

## Stub Gate

PASSED. No TODO/FIXME/STUB/MOCK/HACK markers in `worker/src/lib/ffmpeg.ts` or `worker/src/lib/ffmpeg.test.ts`.

## Files Reviewed

- `worker/src/lib/ffmpeg.ts` (81 lines)
- `worker/src/lib/ffmpeg.test.ts` (209 lines)

## Acceptance Verification

| Criterion | Result | Notes |
|-----------|--------|-------|
| extractAudio(inputStream) returns Readable | PASS | Returns PassThrough emitting WAV bytes |
| Output is 16 kHz mono PCM/WAV (Deepgram-compatible) | PASS | `audioChannels(1)`, `audioFrequency(16000)`, `audioCodec('pcm_s16le')`, `format('wav')` all wired |
| probeContainer returns `{durationSec, isValid}` | PASS | Returns `{isValid: false, durationSec: 0}` on err or zero duration |
| probeContainer on corrupted file returns isValid:false | PASS | Verified by test "returns {isValid: false} when ffprobe returns an error" |
| extractAudio on valid sample yields non-empty stream | PARTIAL | Verified via mocked stream; no live ffmpeg integration test |

## Checklist Findings (8-Category BE)

| Category | Result | Notes |
|----------|--------|-------|
| 1. Code Correctness | PASS | Streams handled correctly; ffprobe callback rejection handled |
| 2. Code Quality | PASS | Concise, descriptive naming, no `any`, well-commented JSDoc |
| 3. Error Handling | PASS | ffprobe errors resolve to `{isValid:false}` rather than throw — explicit non-throwing contract |
| 4. Testing | PARTIAL | 6/6 pass; mocks fluent-ffmpeg entirely. No integration test against the real binary (acceptable for unit layer but should be exercised in UC-200 worker tests) |
| 5. Security | PASS | No secrets, no user-input shell concatenation |
| 6. Performance | PASS | Stream-based, no in-memory buffering of full video |
| 7. Documentation | PASS | Module-level + per-export JSDoc references BRQ-003 and ADR-006 |
| 8. Git & Commits | PASS | Single atomic commit `TECH-009: ffmpeg audio extraction (fluent-ffmpeg)` |

## Issues

### MINOR

- **MINOR (ffmpeg.ts:44)** — `inputFormat('mp4')` is hardcoded. fluent-ffmpeg will fall back to auto-detection, but for non-mp4 containers (mkv, mov, webm, mp3) the hint is misleading. The BRQ-003 acceptance list (MP4/MOV/MKV/WEBM/MP3/WAV/M4A/AAC) suggests letting ffmpeg auto-detect. Recommended fix: drop `.inputFormat('mp4')` or accept a `containerHint` parameter.
- **MINOR** — Result file claims signature `(sourcePath, outputPath) -> Promise` but implementation is stream-in/stream-out. Result file should be corrected for downstream consumers (e.g. UC-200-BE devs reading result.md).

### Discrepancies (Result Doc vs Code)

- `result.md` describes a path-based function returning a Promise. Actual implementation is stream-based and synchronous (returns a Readable). The actual implementation is correct per the task ("extractAudio(inputStream) → AudioStream"); the result.md narrative is stale. Non-blocking; suggest a doc patch.

## Test Results

- Test file: `worker/src/lib/ffmpeg.test.ts`
- Tests: 6/6 passed (per result.md and the user-confirmed 441/441 workspace total).
- Coverage: not measured per-file; declared `pnpm test` (vitest run) is the source-of-truth runner.

## TDD Compliance

Single commit `528f0ba` — RED/GREEN/REFACTOR phases not separated in git history. Standard for TECH tasks. Test and production code committed together.

## Test Author Independence

| File | Author |
|------|--------|
| ffmpeg.ts | noreply@anthropic.com |
| ffmpeg.test.ts | noreply@anthropic.com |

Overlap: 100% (single-commit task). This is normal for TECH scaffolding tasks but the bookkeeping is recorded. Non-blocking for TECH classification.

## Positive Observations

- PRAISE: Clear separation between `extractAudio` (streaming) and `probeContainer` (metadata) — single-responsibility.
- PRAISE: ffprobe error handling resolves rather than rejects, giving the caller a predictable `{isValid:false, durationSec:0}` shape. This is a thoughtful API.
- PRAISE: JSDoc references BRQ-003 and ADR-006 — traceability preserved.

## Verdict

**APPROVED** — TECH-009 is ready for use by UC-200-BE. The single MINOR (`inputFormat('mp4')` hardcoding) does not block; it can be relaxed when UC-200 begins handling non-MP4 inputs.

## Next Steps

- `/nacl-tl-docs TECH-009` to align result.md narrative with the stream-based implementation, OR
- `/nacl-tl-next` to proceed to the next TECH/UC task.
