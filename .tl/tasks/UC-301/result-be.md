---
task: UC-301
phase: be
status: ready_for_review
commit: 9b33e45
completed: 2026-05-18
test_run: pnpm test (vitest run)
---

# Result: UC-301 BE — Review and Edit Protocol

## Implemented

Two endpoints: `GET /api/meetings/:id/protocol` returns the `ProtocolDto` (Markdown content + metadata). `PUT /api/meetings/:id/protocol` accepts a `ProtocolUpdateDto` with new Markdown content, validates with Zod, persists the update, and returns the updated `ProtocolDto`. Returns 404 when meeting not found and 409 when protocol generation is not complete.

## Files

- `api/src/routes/uc-301.ts`
- `api/src/services/uc-301.service.ts`
- `api/src/routes/uc-301.test.ts`

## Tests

- Test file: `api/src/routes/uc-301.test.ts`
- Tests: 28 passed, 0 failed
- Notable cases: GET returns protocol content and metadata, PUT persists updated markdown and returns new version, 409 when protocol not yet generated, empty content rejected by Zod validation

## TDD

RED -> GREEN -> REFACTOR pattern followed. Tests written before implementation.

## Notes

None.
