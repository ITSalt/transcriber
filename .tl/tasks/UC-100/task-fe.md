---
id: UC-100-FE
title: Upload meeting video — frontend
type: uc-fe
uc: UC-100
module: mod-ingest
actor: AUTHOR
wave: 2
priority: high
depends_on: ['UC-100-BE', 'TECH-013']
blocks: []
---

# UC-100-FE — Upload meeting video

## User story

> As an Author, I want to upload a 300-500 MB meeting video with an optional language hint, so the system starts transcription.

## Acceptance criteria

- GIVEN a valid MP4/MKV/MOV file <= 500 MB (BRQ-001, BRQ-002), WHEN I upload, THEN the system accepts, creates Meeting + Recording + TranscriptionJob, and shows status UPLOADING -> TRANSCRIBING.
- GIVEN a file > 500 MB or wrong MIME, WHEN I attempt upload, THEN the system rejects before storage with a clear error.
- GIVEN a corrupt file (BRQ-003), WHEN validation fails, THEN the system rejects with a user-facing error.
- I can choose RU or EN as the language hint; leaving it blank means auto-detect (BRQ-005).

## User steps

1. AUTHOR navigates to /upload.
2. AUTHOR selects a video file via picker (max 500 MB; MP4/MKV/MOV).
3. AUTHOR optionally sets language (RU/EN; blank = auto-detect) and title (defaults to filename).
4. AUTHOR clicks Upload; sees progress bar driven by TUS upload progress events.
5. On error, inline message appears on the form (RQ-008/009/010 failures).
6. On success, AUTHOR is redirected to /meetings/:id with success toast.

## Form fields

| Name | Label | Type | Required | Notes |
|------|-------|------|----------|-------|
| `header` | Upload meeting video | header | no | Static heading |
| `file` | Video file (MP4 / MKV / MOV, max 500 MB) | file | yes | Recording.filename + size + mime |
| `language` | Language (leave blank for auto-detect) | select | no | Meeting.language; options RU/EN/blank |
| `title` | Meeting title (defaults to filename) | text | no | Meeting.title |
| `submit_button` | Upload | button | no | Starts TUS session |
| `cancel_button` | Cancel | button | no | Abandon flow |

## Requirements

| ID | Type | Priority | Description |
|----|------|----------|-------------|
| RQ-008 | functional/validation | high | Reject size_bytes > 524,288,000 (500 MB) BEFORE any storage upload begins. |
| RQ-009 | functional/validation | high | Accept exactly {video/mp4, video/x-matroska, video/quicktime}; reject others with clear user-facing error. |
| RQ-010 | functional/validation | high | Verify container integrity at upload acceptance (probe header / short sample). Corrupt files rejected before Recording is persisted (BRQ-003). |
| RQ-011 | functional | high | On successful upload completion, atomically: (1) finalize Recording metadata; (2) transition Meeting.status UPLOADING -> TRANSCRIBING (BRQ-008); (3) create exactly one TranscriptionJob with status=QUEUED per Recording (BRQ-006). |
| RQ-012 | functional | high | Language selector accepts RU, EN, or blank. Blank -> Meeting.language stays null; ASR auto-detects per BRQ-005. |
| RQ-013 | functional | medium | Meeting.title defaults to Recording.filename (without extension) when AUTHOR leaves the field blank. |
| NFR-001 | nfr/performance | high | Upload pipeline accepts up to 500 MB via chunked transfer without timeout. |
| NFR-002 | nfr/performance | high | Transcription/protocol run asynchronously; UI surfaces job progress without blocking. |
| NFR-004 | nfr/integration | high | Support RU and EN throughout (UI, ASR hint, prompts, errors). |
| NFR-005 | nfr/infra | high | Recordings persist in durable object storage until both Transcript and Protocol are produced. |

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

#### `VideoMimeType`
- `video/mp4` — MP4 container
- `video/x-matroska` — MKV container
- `video/quicktime` — MOV container


## API consumption

Consume endpoints defined in `api-contract.md` (BE side at `UC-100-BE`).
Use the typed `apiClient` from `web/src/lib/api.ts` (TECH-013) and Zod types
from `@transcrib/shared`. Do NOT inline `fetch` calls.

## Definition of done

- [ ] Form rendered with all listed fields; labels localized via i18next (RU + EN).
- [ ] Inline validation matches BE validation (RQ-008/009 for upload, etc.).
- [ ] All `acceptance` criteria pass in E2E via `/nacl-tl-qa UC-100`.
- [ ] BE/FE sync passes (`/nacl-tl-sync UC-100`): types from `@transcrib/shared` only; no mocks.
- [ ] Status-driven gating (RQ-005 etc.) wired via TanStack Query + SSE updates.
- [ ] No raw `fetch` in components — only via `apiClient`.
