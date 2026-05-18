---
id: UC-301-BE
title: Review and edit protocol — backend
type: uc-be
uc: UC-301
module: mod-protocol
actor: AUTHOR
wave: 4
priority: high
depends_on: ['UC-300-BE']
blocks: ['UC-301-FE']
---

# UC-301-BE — Review and edit protocol (API)

## User story

> As an Author, I want to review the generated protocol and edit it in a Markdown editor, so I can correct LLM mistakes before sharing.

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
| RQ-027 | functional | high | Each save increments version by exactly 1 (BRQ-014); monotonic. |
| RQ-028 | functional | high | Each save increments edit_count by exactly 1 (BRQ-015); equals manual-save count since generation. |
| RQ-029 | functional | high | First save: Meeting.status PROTOCOL_READY -> EDITED (BRQ-008). Subsequent saves keep status=EDITED. last_edited_at updated every save. |
| RQ-030 | functional | high | Edits operate on canonical Markdown (BRQ-018); preview is a derivation, never persisted. |
| RQ-031 | functional | medium | Editor warns AUTHOR before navigating away with unsaved changes. |

## API endpoints / worker contract

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/meetings/:id/protocol` | Get protocol Markdown |
| PUT | `/api/meetings/:id/protocol` | Save protocol edits |

See `api-contract.md` for full request/response schemas and error codes.

## System steps (main flow)

1. GET: load Protocol by meeting_id; gate on Meeting.status in {PROTOCOL_READY, EDITED} (RQ-029).
2. PUT (save): in a transaction -> UPDATE Protocol SET markdown_content=:m, version=version+1, edit_count=edit_count+1, last_edited_at=now WHERE meeting_id=:id (RQ-027/028).
3. Transition Meeting.status to EDITED if not already (RQ-029).
4. Return updated metadata in response.
5. Reject save if Meeting.status NOT in {PROTOCOL_READY, EDITED} (409).

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
- [ ] BE/FE sync passes (`/nacl-tl-sync UC-301`).
