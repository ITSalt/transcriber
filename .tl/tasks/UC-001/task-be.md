---
id: UC-001-BE
title: View meeting catalog — backend
type: uc-be
uc: UC-001
module: mod-common
actor: AUTHOR
wave: 1
priority: high
depends_on: ['TECH-003', 'TECH-005']
blocks: ['UC-001-FE']
---

# UC-001-BE — View meeting catalog (API)

## User story

> As an Author, I want to see all my meetings with their current pipeline status, so I know which are ready and which are still processing.

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
| RQ-001 | functional | high | Meeting catalog MUST sort meetings by updated_at descending. |
| RQ-002 | functional | high | Meeting rows in transient statuses (UPLOADING, TRANSCRIBING, PROTOCOL_GENERATING) MUST auto-refresh their status without requiring a full page reload. |
| RQ-003 | functional | medium | AUTHOR sees only own meetings (BRQ-016). Enforcement deferred until auth is added (NFR-007); MVP semantically equivalent to 'all'. |
| NFR-007 | nfr/security | medium | MVP runs without authentication; single trust boundary. |

## API endpoints / worker contract

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/meetings` | List meetings |

See `api-contract.md` for full request/response schemas and error codes.

## System steps (main flow)

1. Load Meetings sorted by updated_at DESC; left-join Recording for duration_sec.
2. Render one row per Meeting with title (or filename fallback), status badge, language, uploaded_at, duration.
3. For rows in transient states, the client subscribes to SSE per-meeting event stream and applies status patches.

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

### Entity: Recording
_Uploaded video metadata; physical bytes in EXT-04 Object Storage (s3://)._  

| Attribute | Type | Nullable | Internal | Description |
|-----------|------|----------|----------|-------------|
| `id` | UUID | no | yes | Surrogate PK |
| `meeting_id` | Reference->Meeting | no | yes | FK to owning Meeting |
| `filename` | String | no | no | Original filename supplied at upload |
| `size_bytes` | Int | no | no | Size in bytes; MUST be <= 524288000 (500 MB) per BRQ-001 |
| `mime_type` | Enum(VideoMimeType) | no | no | Container MIME (MP4/MKV/MOV per BRQ-002) |
| `duration_sec` | Int | yes | no | Video duration; null until extracted in BP-002 |
| `storage_path` | String | no | yes | Object key in EXT-04 (s3://bucket/key) |
| `uploaded_at` | DateTime | no | yes | Upload-completed timestamp; immutable |

## Enumerations

#### `MeetingStatus`
- `CREATED` — Meeting created; upload not yet started
- `UPLOADING` — File upload in progress
- `UPLOADED` — Upload completed; transcription not yet started
- `TRANSCRIBING` — Transcription queued or running
- `TRANSCRIBED` — Transcript persisted; protocol not yet started or running
- `GENERATING_PROTOCOL` — Protocol-gen job queued or running
- `PROTOCOL_READY` — Protocol persisted; no manual edits yet
- `EDITED` — Protocol manually edited at least once
- `ERROR` — Non-recoverable pipeline error (terminal, BRQ-009)

#### `MeetingLanguage`
- `RU` — Russian
- `EN` — English


## Definition of done

- [ ] All endpoints / worker handlers implemented per `api-contract.md`.
- [ ] All listed requirements verified by tests in `test-spec.md`.
- [ ] Prisma migrations include any new indexes/constraints required.
- [ ] All thrown errors map to `AppError` with stable `code` per TECH-005 error handler.
- [ ] No external SA-doc lookups in source — all logic justified by RQ IDs in code comments.
- [ ] BE/FE sync passes (`/nacl-tl-sync UC-001`).
