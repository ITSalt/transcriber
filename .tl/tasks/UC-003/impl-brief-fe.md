# UC-003 — Frontend Implementation Brief

**UC:** Delete meeting

## File plan

- `web/src/routes/uc-003.tsx` — Page-level component (route handler)
- `web/src/features/uc-003/components/` — Form & view components built on shadcn/ui
- `web/src/features/uc-003/hooks/useUC003.ts` — TanStack Query hooks consuming `api-contract.md`
- `web/src/features/uc-003/*.test.tsx` — Component tests

## Steps

1. AUTHOR clicks Delete on the meeting detail page (from UC-002).
2. System shows confirmation dialog showing the title; if a job is IN_PROGRESS, the dialog warns it will be marked FAILED.
3. AUTHOR confirms (or cancels and returns to UC-002).
4. On success, AUTHOR is redirected to catalog (UC-001) with a success toast.

## Cross-cutting

- All API calls go through `apiClient` (TECH-013); never inline `fetch`.
- All copy localized via i18next (RU + EN). Keys in `web/src/i18n/{ru,en}.json`.
- Status-driven UI gating uses the shared `MeetingStatus` enum from `@transcrib/shared`.
- Long-running state subscribes to the `meeting.status` SSE stream (TECH-012) and patches the TanStack Query cache via `setQueryData`.
- Form validation mirrors BE Zod schemas (import from `@transcrib/shared`).
