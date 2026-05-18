# QA Report — UC-301: Review and Edit Protocol

**Date:** 2026-05-18  
**Tester:** Transcrib Conductor (automated E2E via MCP Playwright)  
**Verdict:** PASS

## Test Environment
- API: http://localhost:3000 (NODE_ENV=production)
- Web: http://localhost:5173 (Vite dev server)
- DB: PostgreSQL 16 with seeded protocol (version 1, markdownContent present)

## Test Results

| # | Scenario | Result |
|---|----------|--------|
| 1 | Navigate to /meetings/:id/protocol — page loads | PASS |
| 2 | Protocol content rendered as formatted Markdown | PASS |
| 3 | Meeting title and metadata displayed | PASS |
| 4 | Version indicator shown (v1) | PASS |
| 5 | "Edit" button visible and clickable | PASS |
| 6 | Clicking Edit enters Milkdown WYSIWYG edit mode | PASS |
| 7 | Save changes triggers PUT /api/meetings/:id/protocol | PASS |
| 8 | After save: version increments 1 → 2 | PASS |
| 9 | After save: edit_count increments 0 → 1 | PASS |
| 10 | Meeting status transitions to EDITED after save | PASS |
| 11 | Navigate back to meeting detail works | PASS |

## Known Limitation (Non-blocking)
- Milkdown `onChange` → `isDirty` wiring incomplete (RQ-031 unsaved-changes guard). The "unsaved changes" warning before navigation is not implemented. Deferred per conductor decision.
