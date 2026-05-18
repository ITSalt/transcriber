---
task: UC-003
phase: be
status: ready_for_review
commit: 12d0b06
completed: 2026-05-18
test_run: pnpm test (vitest run)
---

# Result: UC-003 BE — Delete Meeting

## Implemented

`DELETE /api/meetings/:id` endpoint soft-deletes (or hard-deletes per BRQ) the meeting and cascades to associated jobs and stored S3 objects. Returns 204 on success, 404 when meeting not found, 409 when meeting is in a non-deletable terminal state per BRQ-009. Service enforces the job-state-machine invariant before deletion.

## Files

- `api/src/routes/uc-003.ts`
- `api/src/services/uc-003.service.ts`
- `api/src/routes/uc-003.test.ts`

## Tests

- Test file: `api/src/routes/uc-003.test.ts`
- Tests: 10 passed, 0 failed
- Notable cases: returns 204 on successful delete, returns 404 for unknown ID, S3 cleanup called for stored files

## TDD

RED -> GREEN -> REFACTOR pattern followed. Tests written before implementation.

## Notes

None.
