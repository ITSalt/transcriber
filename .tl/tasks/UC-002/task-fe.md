---
id: UC-002-FE
title: View meeting detail — frontend
type: uc-fe
uc: UC-002
module: mod-common
actor: AUTHOR
wave: 3
priority: high
depends_on: ['UC-002-BE', 'TECH-013']
blocks: []
---

# UC-002-FE — View meeting detail

## User story

> As an Author, I want to open a meeting and see its status, recording info, and links to transcript/protocol, so I have a single entry point per meeting.

## Acceptance criteria

- GIVEN a Meeting, WHEN I open its detail page, THEN I see: title, language, status, recording metadata (filename, size, duration), and current job error_reason when FAILED.
- GIVEN status >= TRANSCRIPT_READY, THEN a link to view the transcript is visible (UC-201).
- GIVEN status >= PROTOCOL_READY, THEN a link to review/edit the protocol is visible (UC-301).

## User steps

1. AUTHOR navigates from catalog or via direct URL /meetings/:id.
2. AUTHOR sees detail panel; available action links depend on status (RQ-005).
3. AUTHOR clicks: View transcript (-> UC-201), Review/Edit protocol (-> UC-301), Export PDF (-> UC-302 endpoint), or Delete (-> UC-003).

## Form fields

| Name | Label | Type | Required | Notes |
|------|-------|------|----------|-------|
| `title` | Title | text | no | Meeting.title |
| `language` | Language | select | no | Meeting.language |
| `status` | Status | badge | yes | Meeting.status |
| `uploaded_at` | Uploaded at | datetime | yes | Meeting.uploaded_at |
| `updated_at` | Last update | datetime | yes | Meeting.updated_at |
| `filename` | File name | text | yes | Recording.filename |
| `size_bytes` | Size | number | yes | Recording.size_bytes (humanized) |
| `mime_type` | Format | select | yes | Recording.mime_type |
| `duration_sec` | Duration | number | no | Recording.duration_sec |
| `error_reason` | Error | textarea | no | Latest job error_reason when status=FAILED |
| `delete_button` | Delete meeting | button | no | Triggers UC-003 confirm dialog |

## Requirements

| ID | Type | Priority | Description |
|----|------|----------|-------------|
| RQ-002 | functional | high | Auto-refresh status without full page reload. |
| RQ-003 | functional | medium | AUTHOR sees only own meetings (deferred per NFR-007). |
| RQ-004 | functional | high | Meeting detail MUST surface the current job's error_reason when Meeting.status=FAILED. |
| RQ-005 | functional | high | Action links gated by status: 'View transcript' enabled in {TRANSCRIPT_READY, PROTOCOL_GENERATING, PROTOCOL_READY, EDITED}; 'Review/Edit protocol' enabled in {PROTOCOL_READY, EDITED}; 'Export PDF' enabled in {PROTOCOL_READY, EDITED}. |
| NFR-007 | nfr/security | medium | MVP no-auth single trust boundary. |

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

#### `JobStatus`
- `QUEUED` — Waiting for worker
- `IN_PROGRESS` — Worker running
- `COMPLETED` — Terminal success; immutable (BRQ-009)
- `FAILED` — Terminal failure; error_reason set (BRQ-010); immutable (BRQ-009)

#### `VideoMimeType`
- `video/mp4` — MP4 container
- `video/x-matroska` — MKV container
- `video/quicktime` — MOV container


## API consumption

Consume endpoints defined in `api-contract.md` (BE side at `UC-002-BE`).
Use the typed `apiClient` from `web/src/lib/api.ts` (TECH-013) and Zod types
from `@transcrib/shared`. Do NOT inline `fetch` calls.

## Definition of done

- [ ] Form rendered with all listed fields; labels localized via i18next (RU + EN).
- [ ] Inline validation matches BE validation (RQ-008/009 for upload, etc.).
- [ ] All `acceptance` criteria pass in E2E via `/nacl-tl-qa UC-002`.
- [ ] BE/FE sync passes (`/nacl-tl-sync UC-002`): types from `@transcrib/shared` only; no mocks.
- [ ] Status-driven gating (RQ-005 etc.) wired via TanStack Query + SSE updates.
- [ ] No raw `fetch` in components — only via `apiClient`.
