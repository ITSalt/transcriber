# UC-001 — Frontend Implementation Brief

**UC:** View meeting catalog

## File plan

- `web/src/routes/uc-001.tsx` — Page-level component (route handler)
- `web/src/features/uc-001/components/` — Form & view components built on shadcn/ui
- `web/src/features/uc-001/hooks/useUC001.ts` — TanStack Query hooks consuming `api-contract.md`
- `web/src/features/uc-001/*.test.tsx` — Component tests

## Steps

1. AUTHOR opens the meeting catalog page.
2. AUTHOR sees the list and can click 'Open' on a row to navigate to UC-002.

## Cross-cutting

- All API calls go through `apiClient` (TECH-013); never inline `fetch`.
- All copy localized via i18next (RU + EN). Keys in `web/src/i18n/{ru,en}.json`.
- Status-driven UI gating uses the shared `MeetingStatus` enum from `@transcrib/shared`.
- Long-running state subscribes to the `meeting.status` SSE stream (TECH-012) and patches the TanStack Query cache via `setQueryData`.
- Form validation mirrors BE Zod schemas (import from `@transcrib/shared`).
