# UC-100 — Frontend Implementation Brief

**UC:** Upload meeting video

## File plan

- `web/src/routes/uc-100.tsx` — Page-level component (route handler)
- `web/src/features/uc-100/components/` — Form & view components built on shadcn/ui
- `web/src/features/uc-100/hooks/useUC100.ts` — TanStack Query hooks consuming `api-contract.md`
- `web/src/features/uc-100/*.test.tsx` — Component tests

## Steps

1. AUTHOR navigates to /upload.
2. AUTHOR selects a video file via picker (max 500 MB; MP4/MKV/MOV).
3. AUTHOR optionally sets language (RU/EN; blank = auto-detect) and title (defaults to filename).
4. AUTHOR clicks Upload; sees progress bar driven by TUS upload progress events.
5. On error, inline message appears on the form (RQ-008/009/010 failures).
6. On success, AUTHOR is redirected to /meetings/:id with success toast.

## Cross-cutting

- All API calls go through `apiClient` (TECH-013); never inline `fetch`.
- All copy localized via i18next (RU + EN). Keys in `web/src/i18n/{ru,en}.json`.
- Status-driven UI gating uses the shared `MeetingStatus` enum from `@transcrib/shared`.
- Long-running state subscribes to the `meeting.status` SSE stream (TECH-012) and patches the TanStack Query cache via `setQueryData`.
- Form validation mirrors BE Zod schemas (import from `@transcrib/shared`).
