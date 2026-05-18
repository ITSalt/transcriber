---
id: UC-003-FE
title: Delete meeting — frontend
type: uc-fe
uc: UC-003
module: mod-common
actor: AUTHOR
wave: 4
priority: high
depends_on: ['UC-003-BE', 'TECH-013']
blocks: []
---

# UC-003-FE — Delete meeting

## User story

> As an Author, I want to delete a meeting and all its derived artifacts, so I can clean up obsolete or sensitive recordings.

## Acceptance criteria

- GIVEN any Meeting, WHEN I confirm deletion, THEN the Meeting, its Recording (storage object removed), Transcript, Protocol, and all jobs are deleted.
- GIVEN deletion succeeds, THEN I am returned to the catalog (UC-001) with a confirmation toast.
- WHILE a job is IN_PROGRESS, deletion shows confirmation that the in-flight job will be marked FAILED.

## User steps

1. AUTHOR clicks Delete on the meeting detail page (from UC-002).
2. System shows confirmation dialog showing the title; if a job is IN_PROGRESS, the dialog warns it will be marked FAILED.
3. AUTHOR confirms (or cancels and returns to UC-002).
4. On success, AUTHOR is redirected to catalog (UC-001) with a success toast.

## Form fields

| Name | Label | Type | Required | Notes |
|------|-------|------|----------|-------|
| `header` | Delete this meeting? | header | no | Static heading |
| `title` | Meeting title | text | no | Echoes Meeting.title or filename |
| `warning` | In-flight job warning | alert | no | Shown when any job is IN_PROGRESS |
| `confirm_button` | Confirm delete | button | no | Calls DELETE /api/meetings/:id |
| `cancel_button` | Cancel | button | no | Closes dialog; no state change |

## Requirements

| ID | Type | Priority | Description |
|----|------|----------|-------------|
| RQ-003 | functional | medium | Ownership scope (deferred per NFR-007). |
| RQ-006 | functional | high | Meeting deletion MUST cascade-remove Protocol, ProtocolGenerationJob, Transcript, TranscriptionJob, Recording (incl. storage object in EXT-04), and the Meeting itself. |
| RQ-007 | functional | high | Deletion while a job is IN_PROGRESS MUST require confirmation and MUST mark the in-flight job FAILED with error_reason='deleted by user'. Already-terminal jobs preserve BRQ-009 immutability. |
| NFR-007 | nfr/security | medium | MVP no-auth. |

## Enumerations (UI display + filtering)

#### `MeetingStatus`
- `UPLOADING` — File upload in progress
- `TRANSCRIBING` — Transcription queued or running
- `TRANSCRIPT_READY` — Transcript persisted; protocol not yet started or running
- `PROTOCOL_GENERATING` — Protocol-gen job queued or running
- `PROTOCOL_READY` — Protocol persisted; no manual edits yet
- `EDITED` — Protocol manually edited at least once
- `FAILED` — Non-recoverable pipeline error (terminal, BRQ-009)

#### `JobStatus`
- `QUEUED` — Waiting for worker
- `IN_PROGRESS` — Worker running
- `COMPLETED` — Terminal success; immutable (BRQ-009)
- `FAILED` — Terminal failure; error_reason set (BRQ-010); immutable (BRQ-009)


## API consumption

Consume endpoints defined in `api-contract.md` (BE side at `UC-003-BE`).
Use the typed `apiClient` from `web/src/lib/api.ts` (TECH-013) and Zod types
from `@transcrib/shared`. Do NOT inline `fetch` calls.

## Definition of done

- [ ] Form rendered with all listed fields; labels localized via i18next (RU + EN).
- [ ] Inline validation matches BE validation (RQ-008/009 for upload, etc.).
- [ ] All `acceptance` criteria pass in E2E via `/nacl-tl-qa UC-003`.
- [ ] BE/FE sync passes (`/nacl-tl-sync UC-003`): types from `@transcrib/shared` only; no mocks.
- [ ] Status-driven gating (RQ-005 etc.) wired via TanStack Query + SSE updates.
- [ ] No raw `fetch` in components — only via `apiClient`.
