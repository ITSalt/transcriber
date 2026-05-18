---
task: UC-301
phase: fe
status: ready_for_review
commit: fa61c6e
completed: 2026-05-18
test_run: pnpm test (vitest run)
---

# Result: UC-301 FE — Protocol View/Edit Page

## Implemented

`/meetings/:id/protocol` route renders the protocol in two modes: read mode uses `react-markdown` for rich rendering; edit mode switches to Milkdown WYSIWYG editor. Save button issues `PUT /api/meetings/:id/protocol`. Pending/failed protocol generation states shown with appropriate messaging and a retry affordance. i18n strings in RU/EN.

## Files

- `web/src/routes/protocol/index.tsx`
- `web/src/routes/protocol/ProtocolEditor.tsx`
- `web/src/hooks/useProtocol.ts`
- `web/src/routes/protocol/index.test.tsx`

## Tests

- Test file: `web/src/routes/protocol/index.test.tsx`
- Tests: 25 passed, 0 failed
- Notable cases: read mode renders markdown, edit mode activates Milkdown editor, save triggers PUT and shows success toast, pending generation shows spinner

## TDD

RED -> GREEN -> REFACTOR pattern followed. Tests written before implementation.

## Notes

Follow-up commit `77f4c73` dropped a conflicting `StorageError.cause` override in the web `tsconfig.json` that caused a type error when importing from `shared/`. No logic change.
