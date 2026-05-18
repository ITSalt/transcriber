# QA Report — UC-201: View and Download Transcript

**Date:** 2026-05-18  
**Tester:** Transcrib Conductor (automated E2E via MCP Playwright)  
**Verdict:** PASS

## Test Environment
- API: http://localhost:3000 (NODE_ENV=production)
- Web: http://localhost:5173 (Vite dev server)
- DB: PostgreSQL 16 with seeded transcript for meeting a1b2c3d4-e5f6-4789-8abc-a1b2c3d4e5f6

## Test Results

| # | Scenario | Result |
|---|----------|--------|
| 1 | Navigate to /meetings/:id/transcript — page loads | PASS |
| 2 | Transcript content displayed with speaker labels | PASS |
| 3 | Meeting metadata shown (title, date, duration) | PASS |
| 4 | Speaker map displayed | PASS |
| 5 | Download TXT button visible | PASS |
| 6 | Download TXT triggers file download | PASS |
| 7 | No JSON or Markdown download buttons (removed — BE only returns TXT) | PASS |
| 8 | Navigate back to meeting detail works | PASS |

## Bugs Fixed During QA
- **Format mismatch sync fix**: FE was sending `?format=json` and `?format=md` download buttons. BE contract only returns TXT. Removed JSON/MD buttons from `DownloadMenu.tsx` and removed their unit tests. Sync verdict updated to PASS.
