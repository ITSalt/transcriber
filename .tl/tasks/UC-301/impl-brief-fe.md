# UC-301 — Frontend Implementation Brief

**UC:** Review and edit protocol

## File plan

- `web/src/routes/uc-301.tsx` — Page-level component (route handler)
- `web/src/features/uc-301/components/` — Form & view components built on shadcn/ui
- `web/src/features/uc-301/hooks/useUC301.ts` — TanStack Query hooks consuming `api-contract.md`
- `web/src/features/uc-301/*.test.tsx` — Component tests

## Steps

1. AUTHOR clicks 'Review/Edit protocol' from the meeting detail page (UC-002).
2. Editor renders Markdown via Milkdown WYSIWYG with side-by-side rendered preview. Header shows version + edit_count + last_edited_at.
3. AUTHOR edits content; preview updates live.
4. AUTHOR clicks Save; success indicator shows new version.
5. If AUTHOR navigates away with unsaved changes, browser-native or in-app confirmation warns (RQ-031).
6. AUTHOR can also click 'Export PDF' (calls UC-302 endpoint) or 'Back to meeting'.

## Cross-cutting

- All API calls go through `apiClient` (TECH-013); never inline `fetch`.
- All copy localized via i18next (RU + EN). Keys in `web/src/i18n/{ru,en}.json`.
- Status-driven UI gating uses the shared `MeetingStatus` enum from `@transcrib/shared`.
- Long-running state subscribes to the `meeting.status` SSE stream (TECH-012) and patches the TanStack Query cache via `setQueryData`.
- Form validation mirrors BE Zod schemas (import from `@transcrib/shared`).
