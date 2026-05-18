# QA Report — UC-302: Export Protocol to PDF

**Date:** 2026-05-18  
**Tester:** Transcrib Conductor (automated E2E via curl + Playwright)  
**Verdict:** PASS

## Test Environment
- API: http://localhost:3000 (NODE_ENV=production)
- Puppeteer Chrome: win64-148.0.7778.167 (installed during QA)
- DB: PostgreSQL 16 with seeded protocol

## Test Results

| # | Scenario | Result |
|---|----------|--------|
| 1 | Click "Export PDF" button on meeting detail page | PASS |
| 2 | GET /api/meetings/:id/protocol/pdf returns 200 | PASS |
| 3 | Response Content-Type is application/pdf | PASS |
| 4 | Response body starts with `%PDF-` magic bytes | PASS |
| 5 | PDF file size reasonable (27,924 bytes) | PASS |
| 6 | Content-Disposition header sets filename | PASS |
| 7 | Gate on PROTOCOL_READY/EDITED status (meeting in PROTOCOL_READY) | PASS |

## Bugs Fixed During QA
- **template.html not in dist**: `tsc --build` only compiles `.ts` files — `api/src/lib/pdf/template.html` was not copied to `api/dist/lib/pdf/`. Fixed by:
  1. Manually copying for immediate test
  2. Adding copy step to `api/package.json` build script
- **Puppeteer Chrome version mismatch**: Puppeteer v25 requires Chrome 148.0.7778.167, but only 131 and 145 were cached. Fixed by running `pnpm exec puppeteer browsers install chrome`.
