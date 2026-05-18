---
id: UC-100-BE
title: Upload meeting video — backend
type: uc-be
uc: UC-100
module: mod-ingest
actor: AUTHOR
wave: 1
priority: high
depends_on: ['TECH-003', 'TECH-005', 'TECH-007', 'TECH-008']
blocks: ['UC-100-FE']
---

# UC-100-BE — Upload meeting video (API)

## User story

> As an Author, I want to upload a 300-500 MB meeting video with an optional language hint, so the system starts transcription.

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

## API endpoints / worker contract

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/uploads` | Create TUS upload session |
| PATCH | `/api/uploads/:uploadId` | Stream upload chunks |
| POST | `/api/uploads/:uploadId/finalize` | Finalize upload |

See `api-contract.md` for full request/response schemas and error codes.

## System steps (main flow)

1. On TUS pre-create: validate size <= 500 MB (RQ-008); validate mime in {video/mp4, video/x-matroska, video/quicktime} (RQ-009). Reject pre-bytes with 4xx + error code.
2. Accept chunked PATCH bytes; stream directly to S3 (TECH-007/008).
3. On TUS upload-finish: probeContainer via ffprobe (RQ-010). On failure -> delete partial object + return 422.
4. In a single DB transaction: insert Meeting(status=UPLOADING, language=hint|null, title=hint|filename-no-ext per RQ-013), insert Recording(filename, size_bytes, mime_type, storage_path), enqueue TranscriptionJob(status=QUEUED, recording_id, meeting_id), transition Meeting.status -> TRANSCRIBING (RQ-011).
5. Return {meeting_id} so client can redirect to UC-002.

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
- [ ] BE/FE sync passes (`/nacl-tl-sync UC-100`).
