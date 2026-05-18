# UC-201 FE — Code Review

**Reviewer:** strategist
**Date:** 2026-05-18
**Commit:** f96c4e5
**Verdict:** APPROVED

## Summary

`/meetings/:id/transcript` route renders the transcript header (language,
segments_count, speakers_count, created_at), the full text with speaker
labels, and a download bar. Navigation back to the meeting detail page is
wired. RU/EN i18n keys land where expected. All 10 review categories pass
with no blockers or major substantive issues. One MAJOR informational flag:
100% test author overlap.

## Test results

- `pnpm test` from project root: **457 passed, 7 skipped** (matches expected).
- FE transcript suite: 29 cases in `web/src/routes/transcript/index.test.tsx`
  (CT01-CT06 plus download, navigation, and acceptance metadata).

## 10-category review

### 1. Spec / acceptance conformance — PASS

- Acceptance criterion 1 (header shows segments_count, speakers_count, language, created_at) covered by the dedicated acceptance test and explicit testid assertions.
- Acceptance criterion 2 (one-click download) covered by `DownloadMenu` buttons triggering `window.location.href` navigation to the download endpoint — a browser-native file save.
- Acceptance criterion 3 (BRQ-021 unresolved speakers shown as "Speaker N", resolved shown with real name): `SpeakerLabel.tsx` implements the fallback via `speakerMap?.[id] ?? t("transcript.speakerLabel", {n})`. Note: the page currently delegates rendering to `SegmentList` which uses `ReactMarkdown` on the BE-generated `full_text` (which already contains resolved labels per RQ-019). `SpeakerLabel` is present but not consumed by the page in this implementation. Acceptable since the BE owns label resolution (the test fixture `[00:00] Speaker 1: Hello everyone.` demonstrates this).
- RQ-019 (segments with speaker labels + timestamps): rendered via BE full_text — acceptable per contract.
- RQ-020 (download as .txt): wired to `GET /api/meetings/:id/transcript/download`.

### 2. Status-driven gating (RQ-005) — PASS

- "View transcript" entry point in `StatusSection.tsx` is gated on `transcriptExists && status in {TRANSCRIBED, GENERATING_PROTOCOL, PROTOCOL_READY, EDITED}` — matches BRQ-008 and BE service gating.
- The transcript page itself does not re-gate by status; it relies on a 409 from the BE, surfaced as the generic error state. Acceptable for MVP (see Issues M1).

### 3. Architecture and conventions — PASS

- Page split: `index.tsx` route component, `components/` for presentational pieces (`SegmentList`, `DownloadMenu`, `SpeakerLabel`), data hook `useTranscript` co-located in `index.tsx`.
- All API calls via `apiGet` from `web/src/lib/api.ts` (TECH-013) with shared Zod schema `TranscriptResponse`. No inline fetch.
- No mocks in production code; mocks confined to test file.
- shadcn/ui Card, Badge, Button used consistently.

### 4. Type safety — PASS

- `TranscriptResponse` imported from `@transcrib/shared` (Zod-validated at the network boundary by `apiGet`).
- `useParams<{ id: string }>()` typed; meetingId normalised via `id ?? ""` with `enabled: Boolean(meetingId)` guard.

### 5. i18n (RU / EN) — PASS

- All visible strings go through `t(...)`. Keys exist in both `en.json` and `ru.json`:
  - `transcript.title`, `transcript.backToMeeting`, `transcript.language`, `transcript.segments`, `transcript.speakers`, `transcript.created`, `transcript.transcriptContent`, `transcript.speakerMap`, `transcript.downloadTxt/Json/Md`, `transcript.speakerLabel`, `transcript.loading`, `transcript.error`, `transcript.languageRU/EN/AUTO`.
- Tests exercise the RU branch for each labelled field (CT01-CT06).

### 6. State management / data flow — PASS

- TanStack Query `useQuery(['transcript', meetingId], ...)` is single source of truth.
- Error state exposes a Retry button via `refetch()`.
- No setState anti-patterns; no derived-state-in-effect.

### 7. Accessibility — PASS (minor)

- Buttons use accessible shadcn `<Button>` with visible labels.
- `data-testid` does not substitute for semantic markup; `CardTitle` used for headings.
- Minor: speaker_map debug `<pre>` lacks explicit `aria-label`; not blocking (debug-only block, gated on data.speaker_map presence).

### 8. Tests — PASS (with MAJOR informational flag)

- 29 cases cover:
  - Page container render.
  - Loading and error states.
  - CT01-CT06: each field renders + i18n label in RU and EN.
  - Download buttons present (txt / json / md).
  - Back-to-meeting navigates to /meetings/:id (memory router target hit).
  - Acceptance assertion on all 4 header metadata testids.
- Network calls mocked via `vi.spyOn(globalThis, "fetch")`; the mock returns the `TranscriptResponse` shape that Zod accepts at the apiGet boundary.
- **MAJOR (informational):** 100% test author overlap — commit f96c4e5 "Transcrib Conductor" authored both implementation and tests. Per UC-200 / UC-201-BE precedent, this is NOT a blocker; flagged for QA gate.

### 9. Documentation — PASS

- `result-fe.md` lists files, test counts, and TDD pattern accurately.
- Inline JSDoc on `SpeakerLabel` and `DownloadMenu` cites BRQ-021 and RQ-020.
- `StatusSection.tsx` documents the RQ-005 gating contract in a header comment.

### 10. Definition of done — PASS

- [x] Form rendered with all listed fields (header, language, segments, speakers, created, full_text, optional speaker_map debug, download buttons, back button).
- [x] Labels localised RU + EN.
- [x] Status-driven gating wired via `StatusSection`.
- [x] No raw fetch in components — apiGet used.
- [x] Types from `@transcrib/shared` only.
- [ ] BE/FE sync (`/nacl-tl-sync UC-201`) — deferred to post-review phase.
- [ ] `/nacl-tl-qa UC-201` E2E — separate gate.

## Issues

- 0 blocker
- 0 critical
- 0 major (substantive)
- 1 major (informational): 100% test author overlap — operator-override precedent applied
- 2 minor:
  - M1 (UX): the transcript page does not show a status-specific message when the BE returns 409 STATUS_NOT_READY — it surfaces the generic `transcript.error` text. Acceptable for MVP; suggest a follow-up to branch the error UI on status code.
  - M2 (consistency): `SpeakerLabel` component is present but unused by the page (BE owns label resolution in `full_text`). Either wire it into a structured segment renderer in a follow-up, or remove to reduce surface.

## Files reviewed

- web/src/routes/transcript/index.tsx
- web/src/routes/transcript/index.test.tsx
- web/src/routes/transcript/components/SegmentList.tsx
- web/src/routes/transcript/components/DownloadMenu.tsx
- web/src/routes/transcript/components/SpeakerLabel.tsx
- web/src/routes/meeting/components/StatusSection.tsx
- shared/src/api/uc201.ts
- web/src/i18n/en.json
- web/src/i18n/ru.json

## Recommendation

APPROVED. Proceed to `/nacl-tl-sync UC-201` and then `/nacl-tl-qa UC-201` for end-to-end verification.
