---
task: TECH-013
type: tech
status: ready_for_review
commit: 7d9914d
completed: 2026-05-18
test_run: pnpm test (vitest run)
---

# Result: TECH-013 — Web Scaffold

## Implemented

`web/` package scaffolded with Vite 5, React 19, TypeScript, shadcn/ui, Tailwind CSS v4, TanStack Query v5, and React Router 7. i18next + react-i18next configured with RU (default) and EN locales. TanStack Query `QueryClient` and `RouterProvider` wired in `App.tsx`. Global layout with navigation shell created.

## Files

- `web/src/main.tsx`
- `web/src/App.tsx`
- `web/src/router.tsx`
- `web/src/i18n.ts`
- `web/src/lib/query-client.ts`
- `web/src/App.test.tsx`
- `web/vite.config.ts`
- `web/tailwind.config.ts`

## Tests

- Test file: `web/src/App.test.tsx`
- Tests: 2 passed, 0 failed
- Notable cases: App renders without crashing, router outlet present in DOM

## Verification

441/441 tests pass. Typecheck clean. `pnpm --filter web build` exits 0. shadcn/ui component library available for all UC FE tasks.
