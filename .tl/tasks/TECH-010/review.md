---
task: TECH-010
type: review
mode: tech
status: approved
reviewed: 2026-05-18
commit: 34ea8a2
---

# Review: TECH-010 — IAsrProvider + Deepgram Nova-3 Adapter

Workflow status: `REVIEW COMPLETE`. Code judgment: `APPROVED`. Action required: none.

## Stub Gate

PASSED. No TODO/FIXME/STUB/MOCK/HACK in production or shared interface code.

## Files Reviewed

- `shared/src/asr/IAsrProvider.ts` (interface, 80 lines)
- `shared/src/asr/index.ts` (re-export)
- `worker/src/asr/deepgram-adapter.ts` (163 lines)
- `worker/src/asr/deepgram-adapter.test.ts` (305 lines)

## Acceptance Verification

| Criterion | Result | Notes |
|-----------|--------|-------|
| IAsrProvider abstraction in `shared/` (ADR-006) | PASS | Defined as `IAsrProvider` interface exporting `transcribe(input) → Promise<AsrResult>` |
| `transcribe({audio, languageHint})` returns AsrResult{segments, detectedLanguage, speakers} | PASS | Plus `durationSec`, a useful addition |
| Provider reads DEEPGRAM_API_KEY from env | PASS | Constructor falls back to `process.env['DEEPGRAM_API_KEY']`, throws DeepgramAsrError otherwise |
| Auto language detection when languageHint=null (BRQ-005) | PASS | `resolveLanguage(null)` emits `detect_language: true`; covered by test `sends detect_language=true to Deepgram when languageHint is null` |
| Speaker diarization on EN sample | PASS | Test verifies `SPEAKER_0`/`SPEAKER_1` labels from 3-utterance fixture |
| Detected language set from response when hint=null | PASS | Verified by RU detection test |

## Checklist Findings (8-Category BE)

| Category | Result | Notes |
|----------|--------|-------|
| 1. Code Correctness | PASS | Async iterable → Buffer collector correct; utterance filtering removes empty transcripts |
| 2. Code Quality | PASS | Named helpers (`resolveLanguage`, `toBuffer`, `mapResponse`) keep `transcribe()` short; no `any` outside well-justified casts |
| 3. Error Handling | PASS | `DeepgramAsrError` carries `reason` for debugging; constructor throws on missing key |
| 4. Testing | PASS | 10 tests cover constructor, model params, language modes, empty transcripts, async-iterable stream, accepted async response. Good coverage of mapping invariants. |
| 5. Security | PASS | API key never logged; no key leaks in error message body |
| 6. Performance | PARTIAL | `toBuffer()` collects the entire async-iterable in memory before posting. Acceptable for MVP per BRQ-001 (<= 5GB video → audio is much smaller after 16kHz mono PCM extract), but worth noting for future streaming-upload path |
| 7. Documentation | PASS | Module + interface JSDoc references ADR-006 and BRQ-005 |
| 8. Git & Commits | PASS | Single atomic commit `34ea8a2` |

## Issues

### MINOR

- **MINOR (IAsrProvider.ts:28)** — Comment says "IETF language tag (e.g. 'ru', 'en-US')", but `LANGUAGE_MAP` (deepgram-adapter.ts:37) keys include uppercase `'RU'` and `'EN'`. The map handles both, but the interface contract is ambiguous. Recommend documenting that the adapter is case-insensitive for ISO-639-1 codes.
- **MINOR (IAsrProvider.ts:47)** — `AsrSegment.language` is declared optional but `mapResponse()` (deepgram-adapter.ts:152) never populates it. Either drop the field or populate from `u.language` when Deepgram returns it.
- **MINOR** — `result.md` lists files `shared/src/asr/types.ts` and `worker/src/asr/index.ts` that do not exist. Actual files are `shared/src/asr/IAsrProvider.ts` (no `types.ts`) and the worker has no `asr/index.ts`. Result narrative is stale.

## Test Results

- Test file: `worker/src/asr/deepgram-adapter.test.ts`
- Tests: 10/10 passed (per result.md; corroborated by 441/441 workspace total).
- Notable assertions: model=nova-3, diarize=true, smart_format=true; language routing; empty-transcript filtering; speaker dedup + sort.

## TDD Compliance

Single commit `34ea8a2` — RED/GREEN/REFACTOR not separated. Standard for TECH-class work.

## Test Author Independence

| File | Author |
|------|--------|
| deepgram-adapter.ts | noreply@anthropic.com |
| deepgram-adapter.test.ts | noreply@anthropic.com |

Overlap: 100%. Single-author single-commit TECH task — non-blocking. Recorded for transparency.

## Positive Observations

- PRAISE: Provider-neutral `AsrSegment` shape with explicit `SPEAKER_N` normalization isolates downstream code from Deepgram-specific speaker numbering.
- PRAISE: Handles both Buffer/Uint8Array AND async-iterable audio inputs, enabling both pre-loaded files and stream piping from TECH-009.
- PRAISE: Defensive against Deepgram async-callback (accepted) responses that omit `results` — returns empty segments rather than throwing.

## Verdict

**APPROVED** — TECH-010 is ready for use by UC-200-BE. The interface boundary is clean and the adapter is testable.

## Next Steps

- `/nacl-tl-docs TECH-010` to correct file paths in result.md, OR
- `/nacl-tl-next` to proceed.
