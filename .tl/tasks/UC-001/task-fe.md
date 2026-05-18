---
id: UC-001-FE
title: View meeting catalog — frontend
type: uc-fe
uc: UC-001
module: mod-common
actor: AUTHOR
wave: 2
priority: high
depends_on: ['UC-001-BE', 'TECH-013']
blocks: []
---

# UC-001-FE — View meeting catalog

## User story

> As an Author, I want to see all my meetings with their current pipeline status, so I know which are ready and which are still processing.

## Acceptance criteria

- GIVEN at least one Meeting exists, WHEN I open the catalog, THEN I see a list of meetings sorted by updated_at descending.
- EACH row shows: title (or filename fallback), status badge (per ENUM-MeetingStatus), language, uploaded_at, duration if available.
- GIVEN a meeting in a transient state (UPLOADING / TRANSCRIBING / PROTOCOL_GENERATING), THEN its row shows a progress indicator that auto-refreshes.

## User steps

1. AUTHOR opens the meeting catalog page.
2. AUTHOR sees the list and can click 'Open' on a row to navigate to UC-002.

## Form fields

| Name | Label | Type | Required | Notes |
|------|-------|------|----------|-------|
| `title` | Title | text | no | Meeting.title (or Recording.filename when null) |
| `status` | Status | badge/select | yes | Meeting.status (enum MeetingStatus) |
| `language` | Language | text | no | Meeting.language or '—' when null |
| `uploaded_at` | Uploaded | datetime | yes | Meeting.uploaded_at |
| `duration_sec` | Duration | number | no | Recording.duration_sec (mm:ss formatted) |
| `open_button` | Open | button | no | Navigates to /meetings/:id |

## Requirements

| ID | Type | Priority | Description |
|----|------|----------|-------------|
| RQ-001 | functional | high | Meeting catalog MUST sort meetings by updated_at descending. |
| RQ-002 | functional | high | Meeting rows in transient statuses (UPLOADING, TRANSCRIBING, PROTOCOL_GENERATING) MUST auto-refresh their status without requiring a full page reload. |
| RQ-003 | functional | medium | AUTHOR sees only own meetings (BRQ-016). Enforcement deferred until auth is added (NFR-007); MVP semantically equivalent to 'all'. |
| NFR-007 | nfr/security | medium | MVP runs without authentication; single trust boundary. |

## Enumerations (UI display + filtering)

#### `MeetingStatus`
- `UPLOADING` — File upload in progress
- `TRANSCRIBING` — Transcription queued or running
- `TRANSCRIPT_READY` — Transcript persisted; protocol not yet started or running
- `PROTOCOL_GENERATING` — Protocol-gen job queued or running
- `PROTOCOL_READY` — Protocol persisted; no manual edits yet
- `EDITED` — Protocol manually edited at least once
- `FAILED` — Non-recoverable pipeline error (terminal, BRQ-009)

#### `MeetingLanguage`
- `RU` — Russian
- `EN` — English


## API consumption

Consume endpoints defined in `api-contract.md` (BE side at `UC-001-BE`).
Use the typed `apiClient` from `web/src/lib/api.ts` (TECH-013) and Zod types
from `@transcrib/shared`. Do NOT inline `fetch` calls.

## Definition of done

- [ ] Form rendered with all listed fields; labels localized via i18next (RU + EN).
- [ ] Inline validation matches BE validation (RQ-008/009 for upload, etc.).
- [ ] All `acceptance` criteria pass in E2E via `/nacl-tl-qa UC-001`.
- [ ] BE/FE sync passes (`/nacl-tl-sync UC-001`): types from `@transcrib/shared` only; no mocks.
- [ ] Status-driven gating (RQ-005 etc.) wired via TanStack Query + SSE updates.
- [ ] No raw `fetch` in components — only via `apiClient`.
