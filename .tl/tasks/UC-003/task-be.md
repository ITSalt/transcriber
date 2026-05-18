---
id: UC-003-BE
title: Delete meeting — backend
type: uc-be
uc: UC-003
module: mod-common
actor: AUTHOR
wave: 3
priority: high
depends_on: ['UC-002-BE']
blocks: ['UC-003-FE']
---

# UC-003-BE — Delete meeting (API)

## User story

> As an Author, I want to delete a meeting and all its derived artifacts, so I can clean up obsolete or sensitive recordings.

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
| RQ-003 | functional | medium | Ownership scope (deferred per NFR-007). |
| RQ-006 | functional | high | Meeting deletion MUST cascade-remove Protocol, ProtocolGenerationJob, Transcript, TranscriptionJob, Recording (incl. storage object in EXT-04), and the Meeting itself. |
| RQ-007 | functional | high | Deletion while a job is IN_PROGRESS MUST require confirmation and MUST mark the in-flight job FAILED with error_reason='deleted by user'. Already-terminal jobs preserve BRQ-009 immutability. |
| NFR-007 | nfr/security | medium | MVP no-auth. |

## API endpoints / worker contract

| Method | Path | Description |
|--------|------|-------------|
| DELETE | `/api/meetings/:id` | Delete meeting |

See `api-contract.md` for full request/response schemas and error codes.

## System steps (main flow)

1. Begin transaction.
2. Mark any IN_PROGRESS TranscriptionJob/ProtocolGenerationJob -> FAILED with error_reason='deleted by user' (RQ-007).
3. Delete Protocol, ProtocolGenerationJob, Transcript, TranscriptionJob, Recording rows in dependency order (relies on Prisma cascade from TECH-003).
4. Remove the storage object in EXT-04 via IStorage.deleteObject(Recording.storage_path).
5. Delete Meeting; commit.
6. Emit SSE 'meeting.deleted' so any open clients close the detail view.

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

### Entity: Transcript
_Verbatim speaker-attributed transcript from ASR+diarization. 1:1 with Meeting._  

| Attribute | Type | Nullable | Internal | Description |
|-----------|------|----------|----------|-------------|
| `id` | UUID | no | yes | Surrogate PK |
| `meeting_id` | Reference->Meeting | no | yes | FK to Meeting (composition; deleted with Meeting) |
| `full_text` | String | no | no | Markdown/text with per-segment speaker labels + minute:second timestamps |
| `segments_count` | Int | no | no | Total speaker-attributed segments |
| `speakers_count` | Int | no | no | Distinct speakers detected |
| `language` | Enum(MeetingLanguage) | no | no | Detected or confirmed language (RU/EN) |
| `speaker_map` | JSON | yes | no | {"Speaker 1": "Ivan", "Speaker 2": null} per BRQ-021 |
| `created_at` | DateTime | no | yes | First-persisted time |

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

#### `JobStatus`
- `QUEUED` — Waiting for worker
- `IN_PROGRESS` — Worker running
- `COMPLETED` — Terminal success; immutable (BRQ-009)
- `FAILED` — Terminal failure; error_reason set (BRQ-010); immutable (BRQ-009)


## Definition of done

- [ ] All endpoints / worker handlers implemented per `api-contract.md`.
- [ ] All listed requirements verified by tests in `test-spec.md`.
- [ ] Prisma migrations include any new indexes/constraints required.
- [ ] All thrown errors map to `AppError` with stable `code` per TECH-005 error handler.
- [ ] No external SA-doc lookups in source — all logic justified by RQ IDs in code comments.
- [ ] BE/FE sync passes (`/nacl-tl-sync UC-003`).
