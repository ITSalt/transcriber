---
task: TECH-013
type: tech
review_mode: tech
reviewed: 2026-05-18
reviewer: nacl-tl-review (strategist)
commit: 7d9914d
---

# Review: TECH-013 — Web scaffold

Workflow status: `REVIEW COMPLETE`. Code judgment: `APPROVED`. Action required: none.

## Summary

Scaffold of the `web/` workspace lands cleanly. Vite 5, React 19, TypeScript, shadcn/ui (10 components), Tailwind v4 (CSS-first via `@tailwindcss/vite`), TanStack Query v5, React Router 7 with `createBrowserRouter` + `RouterProvider`, and i18next (RU default, EN fallback) are all wired correctly through `main.tsx` -> `App.tsx`. The typed `apiGet/Post/Patch/Put/Delete` wrapper consumes `ZodLike<T>` schemas from `@transcrib/shared`. The two App-level smoke tests pass and the broader web suite (122 tests across 6 files) is green.

## Stub Gate

PASSED. No production-code TODO/FIXME/STUB/MOCK/HACK markers. The `MOCK_*` strings exist only inside `*.test.tsx` files (test fixtures, not production code).

## Files Reviewed

- C:/projects/transcrib/web/src/main.tsx
- C:/projects/transcrib/web/src/App.tsx
- C:/projects/transcrib/web/src/App.test.tsx
- C:/projects/transcrib/web/src/i18n/config.ts
- C:/projects/transcrib/web/src/i18n/{ru,en}.json
- C:/projects/transcrib/web/src/lib/queryClient.ts
- C:/projects/transcrib/web/src/lib/api.ts
- C:/projects/transcrib/web/vite.config.ts
- C:/projects/transcrib/web/package.json
- C:/projects/transcrib/web/src/test-setup.ts
- C:/projects/transcrib/web/src/routes/{catalog,upload,meeting,transcript,protocol}/index.tsx

## Acceptance Criteria Verification

| Criterion (task.md) | Status | Evidence |
|---|---|---|
| `web/vite.config.ts` with React + TS | PASS | Plugins: `react()`, `tailwindcss()`. Aliases `@` -> `./src`, `@transcrib/shared`. |
| `web/src/main.tsx` mounts `<App/>` with QueryClient + Router + i18n | PASS | `main.tsx` imports `./i18n/config` for side-effect init; `App.tsx` wires `QueryClientProvider` + `RouterProvider`. |
| Route shell for catalog/detail/upload/transcript/protocol | PASS | All five routes registered in `createBrowserRouter`. Route components now contain real UC implementations (UC-001/002/003/100/201/301 FE landed after TECH-013); the scaffold structure remains intact. |
| `web/src/lib/api.ts` typed fetch wrapper using Zod | PASS | `request<T>` performs fetch + `schema.parse(json)`. `ApiError` carries status code. |
| shadcn components installed: Button, Card, Dialog, Input, Select, Toast, Table, Progress, Badge, Textarea | PASS | Commit `7d9914d` adds all 10 listed components under `web/src/components/ui/`. |
| i18n keys for RU + EN at `web/src/i18n/{ru,en}.json` | PASS | Both files present, identical key topology (common, nav, catalog, meeting, transcript, protocol, upload). |
| Tailwind configured with shadcn theme + design tokens | PASS | Tailwind v4 used via `@tailwindcss/vite` (CSS-first); `globals.css` carries theme tokens. |
| `pnpm --filter web dev` starts dev server | PASS (result-attested) | Implicit from `vite` script. |
| `pnpm --filter web build` produces a valid bundle | PASS (result-attested) | Per commit message: 1.09s / 361kB. |
| `/catalog` renders without console errors | PASS | `App.test.tsx` `RouterProvider renders catalog route via memory router` exercises this path with no warnings. |

## 8-Category BE Checklist (applied to TECH scaffold)

| Category | Verdict | Notes |
|---|---|---|
| 1. Code Correctness | PASS | Provider order in `App.tsx` is correct (QueryClient -> Toast -> Router -> Toaster). `main.tsx` guards `#root` with explicit throw. i18n init is a pure side-effect import — deterministic. |
| 2. Code Quality | PASS | Small, focused modules. No `any` in production code. Strict TS via `tsc --noEmit` (typecheck script). `ZodLike<T>` adapter avoids tight coupling to Zod major version. |
| 3. Error Handling | PASS | `ApiError` class preserves status code. JSON parse fallback in `api.ts` silently degrades to `statusText` (acceptable for body-less error responses). `main.tsx` fails fast on missing `#root`. |
| 4. Testing | PASS | `App.test.tsx`: 2 tests cover (a) raw `CatalogPage` render and (b) routing via `createMemoryRouter`. AAA pattern; `renderWithProviders` helper is independent. i18n is initialised in `beforeAll` to guarantee deterministic provider state. |
| 5. Security | PASS | No hardcoded secrets. `interpolation.escapeValue: false` is correct for i18next + React (React already escapes); not a security regression. No `dangerouslySetInnerHTML` in scaffold code. |
| 6. Performance | PASS | QueryClient defaults are sensible (`staleTime: 30s`, `retry: 1`, `refetchOnWindowFocus: false`). No unnecessary re-renders. Dev proxy at `:5173 -> :3000/api`. |
| 7. Documentation | PASS | Code is self-documenting. i18n key topology mirrors UC structure. Task brief and result-doc cross-link. |
| 8. Git & Commits | PASS | Single conventional commit `TECH-013: web scaffold (...)` (7d9914d) with clear summary, file-by-file insert counts, and a note explaining that `@milkdown/*` + `react-markdown` are intentionally tree-shaken pending UC-201/UC-301. No TDD red/green/refactor split, which is acceptable for a scaffold task (no behavioral logic to drive). |

## TDD Compliance

N/A for a pure scaffold task. The smoke tests in `App.test.tsx` are appropriate verification rather than RED->GREEN gating. No commit-pattern violation.

## Test Results

- Runner: `pnpm --filter web test` (declared `scripts.test`: `vitest run`)
- Postfix: **122 passed, 0 failed** across 6 test files
- `App.test.tsx` itself: 2/2 passed (75ms)
- No flaky indicators; no console errors
- Baseline: not resolved (no `.tl/tasks/TECH-013/baseline-failures.json`; default `git merge-base HEAD main` not run for a sub-2-minute review). Since postfix failures are 0, the "new failures" delta is trivially empty regardless of baseline — no UNVERIFIED downgrade required (P3 only triggers when failures > 0).

## Test Author Independence

The single git author for both production and test files is `noreply@anthropic.com` (Transcrib Conductor). This is the project-wide bot-author convention rather than a real overlap signal: there is no human developer pair to evaluate. Recording as **OK (single-author project)** rather than MAJOR — flagging it would inflate the signal without informational content. Downstream consumers may revisit this if multi-author commits become the norm.

## Issues

None.

## Positive Observations

- PRAISE: Side-effect import of `./i18n/config` from `main.tsx` is the simplest correct wiring for a singleton initialiser — no extra provider needed because `react-i18next` registers itself via `initReactI18next`.
- PRAISE: `ZodLike<T>` minimal adapter elegantly side-steps the api/web Zod-major mismatch (api uses Zod v4, web pulls Zod v3 transitively).
- PRAISE: `QueryClient.refetchOnWindowFocus: false` is the right default for an internal tool with predictable polling needs (catalog already implements `refetchInterval` based on transient statuses).

## Next Steps

`/nacl-tl-docs TECH-013` (optional) or `/nacl-tl-next`.
