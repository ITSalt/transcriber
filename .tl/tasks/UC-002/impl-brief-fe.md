# UC-002 — Frontend Implementation Brief

**UC:** View meeting detail

## File plan

- `web/src/routes/uc-002.tsx` — Page-level component (route handler)
- `web/src/features/uc-002/components/` — Form & view components built on shadcn/ui
- `web/src/features/uc-002/hooks/useUC002.ts` — TanStack Query hooks consuming `api-contract.md`
- `web/src/features/uc-002/*.test.tsx` — Component tests

## Steps

1. AUTHOR navigates from catalog or via direct URL /meetings/:id.
2. AUTHOR sees detail panel; available action links depend on status (RQ-005).
3. AUTHOR clicks: View transcript (-> UC-201), Review/Edit protocol (-> UC-301), Export PDF (-> UC-302 endpoint), or Delete (-> UC-003).

## Cross-cutting

- All API calls go through `apiClient` (TECH-013); never inline `fetch`.
- All copy localized via i18next (RU + EN). Keys in `web/src/i18n/{ru,en}.json`.
- Status-driven UI gating uses the shared `MeetingStatus` enum from `@transcrib/shared`.
- Long-running state subscribes to the `meeting.status` SSE stream (TECH-012) and patches the TanStack Query cache via `setQueryData`.
- Form validation mirrors BE Zod schemas (import from `@transcrib/shared`).
