---
task: UC-100
phase: fe
status: ready_for_review
commit: post-review-fixes
completed: 2026-05-18
test_run: pnpm test (vitest run)
---

# Result: UC-100 FE — Upload Page

## Implemented

`/upload` route provides a file picker using `tus-js-client` for resumable chunked uploads. Upload progress bar shown during transfer. On TUS completion, calls `POST /api/uploads/:uploadId/finalize` and navigates to the new meeting detail page. Accepted file types constrained to RQ-009 MIME types (video/mp4, video/x-matroska, video/quicktime). i18n strings in RU/EN.

## Files

- `web/src/routes/upload/index.tsx`
- `web/src/routes/upload/index.test.tsx`

## Fixes Applied (post-review)

- CRIT-FE-1: Removed `video/webm` and `video/x-msvideo` from `MIME_TO_ENUM`; `validateFile` now rejects those types (RQ-009).
- CRIT-FE-2: Language `onValueChange` maps `"auto"` → `""` so internal state is always `"RU" | "EN" | ""`; `language=auto` is never sent in TUS metadata (RQ-012).
- CRIT-FE-3: Removed duplicate `metadata: { filename, filetype }` option from `tus.Upload`; server receives all required fields via manual `Upload-Metadata` header only (RQ-008/009/011/012/013).

## Tests

- Test file: `web/src/routes/upload/index.test.tsx`
- Tests: 16 passed, 0 failed
- New regression tests: CRIT-FE-1 (webm rejected), CRIT-FE-2 (no language=auto in header), CRIT-FE-3 (all required metadata keys present)

## TDD

RED -> GREEN -> REFACTOR pattern followed. Regression tests added after critical defects fixed.

## Notes

Non-critical issues (MIN-1 through MIN-5) deferred to next iteration per review guidance.
