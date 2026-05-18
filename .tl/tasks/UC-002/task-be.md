---
id: UC-002-BE
title: View meeting detail — backend
type: uc-be
uc: UC-002
module: mod-common
actor: AUTHOR
wave: 2
priority: high
depends_on: ['UC-001-BE']
blocks: ['UC-002-FE']
---

# UC-002-BE — View meeting detail (API)

## User story

> As an Author, I want to open a meeting and see its status, recording info, and links to transcript/protocol, so I have a single entry point per meeting.

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
| RQ-002 | functional | high | Auto-refresh status without full page reload. |
| RQ-003 | functional | medium | AUTHOR sees only own meetings (deferred per NFR-007). |
| RQ-004 | functional | high | Meeting detail MUST surface the current job's error_reason when Meeting.status=FAILED. |
| RQ-005 | functional | high | Action links gated by status: 'View transcript' enabled in {TRANSCRIPT_READY, PROTOCOL_GENERATING, PROTOCOL_READY, EDITED}; 'Review/Edit protocol' enabled in {PROTOCOL_READY, EDITED}; 'Export PDF' enabled in {PROTOCOL_READY, EDITED}. |
| NFR-007 | nfr/security | medium | MVP no-auth single trust boundary. |

## API endpoints / worker contract

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/meetings/:id` | Get meeting detail |
| GET | `/api/meetings/:id/events` | SSE event stream |

See `api-contract.md` for full request/response schemas and error codes.

## System steps (main flow)

1. Load Meeting by id with eager Recording, latest TranscriptionJob, latest ProtocolGenerationJob, and existence flags for Transcript/Protocol.
2. Compose response surfacing error_reason from the latest job when Meeting.status=FAILED.
3. Stream status patches via SSE per TECH-012.

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

### Entity: TranscriptionJob
_Async job tracking ASR+diarization for a Recording._  

| Attribute | Type | Nullable | Internal | Description |
|-----------|------|----------|----------|-------------|
| `id` | UUID | no | yes | Surrogate PK |
| `meeting_id` | Reference->Meeting | no | yes | FK to Meeting |
| `recording_id` | Reference->Recording | no | yes | FK to Recording (1:1 per BRQ-006) |
| `status` | Enum(JobStatus) | no | yes | QUEUED->IN_PROGRESS->{COMPLETED\|FAILED}; terminal immutable (BRQ-009) |
| `started_at` | DateTime | yes | yes | Worker pickup time |
| `completed_at` | DateTime | yes | yes | Terminal state time |
| `error_reason` | String | yes | yes | Non-null when status=FAILED (BRQ-010) |

### Entity: ProtocolGenerationJob
_Async job tracking LLM protocol generation. Auto-created on transcription COMPLETED (BRQ-007)._  

| Attribute | Type | Nullable | Internal | Description |
|-----------|------|----------|----------|-------------|
| `id` | UUID | no | yes | Surrogate PK |
| `meeting_id` | Reference->Meeting | no | yes | FK to Meeting |
| `transcript_id` | Reference->Transcript | no | yes | FK to source Transcript (1:1 per BRQ-007) |
| `status` | Enum(JobStatus) | no | yes | QUEUED->IN_PROGRESS->{COMPLETED\|FAILED}; terminal immutable (BRQ-009) |
| `started_at` | DateTime | yes | yes | Worker pickup time |
| `completed_at` | DateTime | yes | yes | Terminal state time |
| `prompt_template_version` | String | no | yes | LLM prompt template version used (audit) |
| `error_reason` | String | yes | yes | Non-null when status=FAILED (BRQ-010) |

## Enumerations

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


## Definition of done

- [ ] All endpoints / worker handlers implemented per `api-contract.md`.
- [ ] All listed requirements verified by tests in `test-spec.md`.
- [ ] Prisma migrations include any new indexes/constraints required.
- [ ] All thrown errors map to `AppError` with stable `code` per TECH-005 error handler.
- [ ] No external SA-doc lookups in source — all logic justified by RQ IDs in code comments.
- [ ] BE/FE sync passes (`/nacl-tl-sync UC-002`).
