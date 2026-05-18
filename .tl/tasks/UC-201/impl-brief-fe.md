# UC-201 — Frontend Implementation Brief

**UC:** View and download transcript

## File plan

- `web/src/routes/uc-201.tsx` — Page-level component (route handler)
- `web/src/features/uc-201/components/` — Form & view components built on shadcn/ui
- `web/src/features/uc-201/hooks/useUC201.ts` — TanStack Query hooks consuming `api-contract.md`
- `web/src/features/uc-201/*.test.tsx` — Component tests

## Steps

1. AUTHOR clicks 'View transcript' from the meeting detail page.
2. AUTHOR sees the transcript with speaker labels and timestamps; header shows segments_count, speakers_count, language, created_at.
3. AUTHOR clicks Download to save a plain-text file.
4. AUTHOR clicks 'Back to meeting' to return to UC-002.

## Cross-cutting

- All API calls go through `apiClient` (TECH-013); never inline `fetch`.
- All copy localized via i18next (RU + EN). Keys in `web/src/i18n/{ru,en}.json`.
- Status-driven UI gating uses the shared `MeetingStatus` enum from `@transcrib/shared`.
- Long-running state subscribes to the `meeting.status` SSE stream (TECH-012) and patches the TanStack Query cache via `setQueryData`.
- Form validation mirrors BE Zod schemas (import from `@transcrib/shared`).
