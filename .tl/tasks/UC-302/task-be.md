---
id: UC-302-BE
title: Export protocol to PDF — backend
type: uc-be
uc: UC-302
module: mod-protocol
actor: AUTHOR
wave: 5
priority: high
depends_on: ['UC-301-BE', 'TECH-014']
blocks: []
---

# UC-302-BE — Export protocol to PDF (API)

## User story

> As an Author, I want to export the protocol as a PDF, so I can distribute it as a polished document. Triggered as an action from UC-002 detail and UC-301 editor; no dedicated screen.

## Actor

**AUTHOR** — End-user who uploads a recording and owns derived artifacts. Sole active human role at MVP.

Permissions (AUTHOR is the only human role; SYSTEM owns job lifecycles):

| Entity | CRUD | Scope |
|--------|------|-------|
| `Meeting` | CRUD | own |
| `Recording` | CRD | own; update is system-only |
| `Transcript` | RD | own; content produced by SYSTEM |
| `Protocol` | RUD | own; initial generation by SYSTEM |
| `TranscriptionJob` | R | own |
| `ProtocolGenerationJob` | R | own |

## Functional requirements

| ID | Type | Priority | Description |
|----|------|----------|-------------|
| RQ-032 | functional | high | PDF export is transient: rendered PDF MUST NOT be persisted (BRQ-017); each export re-renders from canonical Markdown (BRQ-018). |
| RQ-033 | functional | high | Exported PDF MUST include the four required sections (BRQ-011). On render failure, no file delivered and no state change persisted. |

## API endpoints / worker contract

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/meetings/:id/protocol/pdf` | Export protocol PDF |

See `api-contract.md` for full request/response schemas and error codes.

## System steps (main flow)

1. Gate on Meeting.status in {PROTOCOL_READY, EDITED} (RQ-032 - return 409 otherwise).
2. Load Protocol.markdown_content (canonical per BRQ-018).
3. Invoke renderPdf(markdown, {title, version}) from TECH-014.
4. Stream Buffer as application/pdf with Content-Disposition attachment filename '<title>-protocol-v<version>.pdf'.
5. Do NOT persist the rendered buffer (RQ-032).
6. ALT: on render failure -> return 500 with stable error code 'PDF_RENDER_FAILED'; no state change (RQ-033).

## Domain context (embedded — do NOT requery Neo4j)

### Entity: Meeting
_Root aggregate per meeting. Owns Recording/Transcript/Protocol refs and tracks overall pipeline status._  

| Attribute | Type | Nullable | Internal | Description |
|-----------|------|----------|----------|-------------|
| `id` | UUID | no | yes | Surrogate PK |
| `title` | String | yes | no | Optional user-readable title; defaults to filename |
| `language` | Enum(MeetingLanguage) | yes | no | RU/EN or null pending auto-detect (BRQ-005) |
| `status` | Enum(MeetingStatus) | no | no | Pipeline-mirror status (BRQ-008); drives UI gating |
| `uploaded_at` | DateTime | no | yes | Upload init timestamp; immutable |
| `updated_at` | DateTime | no | yes | Last status transition or protocol edit; used for catalog sort |

### Entity: Protocol
_Persisted Markdown protocol with four required sections (BRQ-011). 1:1 with Meeting._  

| Attribute | Type | Nullable | Internal | Description |
|-----------|------|----------|----------|-------------|
| `id` | UUID | no | yes | Surrogate PK |
| `meeting_id` | Reference->Meeting | no | yes | FK to Meeting (composition) |
| `markdown_content` | String | no | no | Canonical Markdown (BRQ-018); MUST contain Participants/Discussion Topics/Decisions/Action Items (BRQ-011) |
| `version` | Int | no | no | Monotonic; starts at 1; +1 each save (BRQ-014) |
| `edit_count` | Int | no | no | Manual saves since generation; starts 0 (BRQ-015) |
| `generated_at` | DateTime | no | yes | First-generation time; immutable |
| `last_edited_at` | DateTime | yes | yes | Last manual save; null until first edit |

## Enumerations

#### `MeetingStatus`
- `UPLOADING` — File upload in progress
- `TRANSCRIBING` — Transcription queued or running
- `TRANSCRIPT_READY` — Transcript persisted; protocol not yet started or running
- `PROTOCOL_GENERATING` — Protocol-gen job queued or running
- `PROTOCOL_READY` — Protocol persisted; no manual edits yet
- `EDITED` — Protocol manually edited at least once
- `FAILED` — Non-recoverable pipeline error (terminal, BRQ-009)


## Definition of done

- [ ] All endpoints / worker handlers implemented per `api-contract.md`.
- [ ] All listed requirements verified by tests in `test-spec.md`.
- [ ] Prisma migrations include any new indexes/constraints required.
- [ ] All thrown errors map to `AppError` with stable `code` per TECH-005 error handler.
- [ ] No external SA-doc lookups in source — all logic justified by RQ IDs in code comments.
- [ ] Worker job lifecycle verified end-to-end with a sample fixture.
