---
task: UC-201
phase: be
status: ready_for_review
commit: 473000a
completed: 2026-05-18
test_run: pnpm test (vitest run)
---

# Result: UC-201 BE — View and Download Transcript

## Implemented

Two endpoints added: `GET /api/meetings/:id/transcript` returns the structured `TranscriptDto` with speaker-labelled segments from JSONB. `GET /api/meetings/:id/transcript/download` returns a plain-text `.txt` file with speaker labels formatted for download (`Content-Disposition: attachment`). Both return 404 when meeting not found and 409 when transcription is not yet complete.

## Files

- `api/src/routes/uc-201.ts`
- `api/src/services/uc-201.service.ts`
- `api/src/routes/uc-201.test.ts`

## Tests

- Test file: `api/src/routes/uc-201.test.ts`
- Tests: 21 passed, 0 failed
- Notable cases: returns segments with speaker labels, download sets Content-Disposition header, 409 returned when job status is not DONE

## TDD

RED -> GREEN -> REFACTOR pattern followed. Tests written before implementation.

## Notes

None.
