# QA Report — UC-100: Upload Meeting Video

**Date:** 2026-05-18  
**Tester:** Transcrib Conductor (E2E via MCP Playwright + unit test suite)  
**Verdict:** PASS

## Test Environment
- Web: http://localhost:5173 (Vite dev server)
- Unit tests: 455 passing, 7 skipped

## E2E Results (Playwright)

| # | Scenario | Result |
|---|----------|--------|
| 1 | Navigate to /upload — page renders correctly | PASS |
| 2 | File input with correct accept MIME types visible | PASS |
| 3 | Title input field present and accepts text | PASS |
| 4 | Language select shows auto/RU/EN options | PASS |
| 5 | Language selection (RU) works correctly | PASS |
| 6 | Upload button disabled when no file selected | PASS |
| 7 | Cancel button disabled when no upload in progress (by design) | PASS |
| 8 | i18n labels in Russian rendered correctly | PASS |

## Unit Test Coverage (file validation — not testable in Playwright without real files)

| Test | Result |
|------|--------|
| RQ-008: file > 500 MB rejected with error message | PASS |
| RQ-009: unsupported MIME type rejected | PASS |
| CRIT-FE-1: video/webm rejected | PASS |
| CRIT-FE-2: auto-detect language not sent in TUS metadata | PASS |
| CRIT-FE-3: Upload-Metadata header contains all required fields | PASS |
| SYNC-UC100-1: finalize POST sends filename, size_bytes, mime_type, title | PASS |
| Navigate to /meetings/:id on successful upload | PASS |
| Error shown when finalize API fails | PASS |

## Notes
- File size and MIME validation tested via unit tests (cannot simulate real file in Playwright)
- TUS upload flow requires a real video file and running TUS server; unit tests mock tus-js-client
