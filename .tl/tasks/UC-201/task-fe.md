---
id: UC-201-FE
title: View and download transcript — frontend
type: uc-fe
uc: UC-201
module: mod-transcription
actor: AUTHOR
wave: 4
priority: high
depends_on: ['UC-201-BE', 'TECH-013']
blocks: []
---

# UC-201-FE — View and download transcript

## User story

> As an Author, I want to view the verbatim transcript with speaker labels and download it as a text file, so I have a permanent meeting record.

## Acceptance criteria

- GIVEN Meeting.status >= TRANSCRIPT_READY, WHEN I open the transcript view, THEN I see segments with speaker labels, timestamps, and counts (segments_count, speakers_count).
- I can download the transcript as a text file with a one-click action.
- Unresolved speakers (BRQ-021) are shown as 'Speaker N'; resolved speakers show the real name.

## User steps

1. AUTHOR clicks 'View transcript' from the meeting detail page.
2. AUTHOR sees the transcript with speaker labels and timestamps; header shows segments_count, speakers_count, language, created_at.
3. AUTHOR clicks Download to save a plain-text file.
4. AUTHOR clicks 'Back to meeting' to return to UC-002.

## Form fields

| Name | Label | Type | Required | Notes |
|------|-------|------|----------|-------|
| `header` | Transcript | header | no | Static heading |
| `language` | Language | select | yes | Transcript.language |
| `segments_count` | Segments | number | yes | Transcript.segments_count |
| `speakers_count` | Speakers | number | yes | Transcript.speakers_count |
| `created_at` | Created | datetime | yes | Transcript.created_at |
| `full_text` | Transcript content | textarea (read-only) | yes | Transcript.full_text rendered with speaker labels + timestamps |
| `speaker_map` | Speaker name map | textarea | no | Transcript.speaker_map (debug visibility) |
| `download_button` | Download as text | button | no | Calls /transcript/download |
| `back_button` | Back to meeting | button | no | Navigates to UC-002 |

## Requirements

| ID | Type | Priority | Description |
|----|------|----------|-------------|
| RQ-019 | functional | high | Transcript view MUST display each segment with its speaker label (resolved from speaker_map or 'Speaker N') and minute/second timestamps. |
| RQ-020 | functional | medium | Download produces a plain-text file (.txt) with verbatim transcript + speaker labels + timestamps. Filename: '<meeting-title>-transcript.txt' (or filename fallback when title is null). |

## Enumerations (UI display + filtering)

#### `MeetingLanguage`
- `RU` — Russian
- `EN` — English


## API consumption

Consume endpoints defined in `api-contract.md` (BE side at `UC-201-BE`).
Use the typed `apiClient` from `web/src/lib/api.ts` (TECH-013) and Zod types
from `@transcrib/shared`. Do NOT inline `fetch` calls.

## Definition of done

- [ ] Form rendered with all listed fields; labels localized via i18next (RU + EN).
- [ ] Inline validation matches BE validation (RQ-008/009 for upload, etc.).
- [ ] All `acceptance` criteria pass in E2E via `/nacl-tl-qa UC-201`.
- [ ] BE/FE sync passes (`/nacl-tl-sync UC-201`): types from `@transcrib/shared` only; no mocks.
- [ ] Status-driven gating (RQ-005 etc.) wired via TanStack Query + SSE updates.
- [ ] No raw `fetch` in components — only via `apiClient`.
