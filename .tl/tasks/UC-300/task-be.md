---
id: UC-300-BE
title: Generate protocol pipeline — backend
type: uc-be
uc: UC-300
module: mod-protocol
actor: SYSTEM
wave: 3
priority: high
depends_on: ['UC-200-BE', 'TECH-011']
blocks: []
---

# UC-300-BE — Generate protocol pipeline (worker)

## User story

> As the SYSTEM, when a transcript becomes ready I auto-trigger LLM-based protocol generation and persist the Markdown result with status updates.

## Actor

**SYSTEM** — Pipeline machinery. Owns job lifecycles; writes Meeting.status per BRQ-008.

Permissions (AUTHOR is the only human role; SYSTEM owns job lifecycles):

| Entity | CRUD | Scope |
|--------|------|-------|
| `Recording` | R | all |
| `Transcript` | C | all |
| `Protocol` | C | all (initial creation) |
| `TranscriptionJob` | CRUD | all |
| `ProtocolGenerationJob` | CRUD | all |
| `Meeting` | RU | all (status mirror per BRQ-008) |

## Functional requirements

| ID | Type | Priority | Description |
|----|------|----------|-------------|
| RQ-021 | functional | high | ProtocolGenerationJob lifecycle: QUEUED -> IN_PROGRESS -> {COMPLETED, FAILED}. Terminal immutable (BRQ-009). |
| RQ-022 | functional | high | LLM prompt template selected by Transcript.language (BRQ-013); resulting protocol language MUST match transcript language. Template version recorded on job. |
| RQ-023 | functional/validation | high | Persisted Protocol MUST contain Participants, Discussion Topics, Decisions, Action Items (BRQ-011). Missing section -> job FAILED. |
| RQ-024 | functional | medium | Action items SHOULD include assignee/deadline when stated (BRQ-012). Best-effort by LLM. |
| RQ-025 | functional | high | Initial Protocol on success: version=1, edit_count=0, generated_at=now. Meeting.status -> PROTOCOL_READY (BRQ-008/014/015). |
| RQ-026 | functional | high | On ANY failure (LLM error, parse error, missing required sections) -> job FAILED with error_reason; Meeting FAILED (BRQ-008/010). |
| NFR-002 | nfr/performance | high | Async; non-blocking UI. |
| NFR-003 | nfr/performance | medium | No SLA at MVP. |
| NFR-004 | nfr/integration | high | RU + EN. |
| NFR-006 | nfr/integration | high | Markdown canonical; PDF transient (re-rendered). |
| NFR-008 | nfr/infra | high | Failures surfaced; terminal immutable. |

## API endpoints / worker contract

| Method | Path | Description |
|--------|------|-------------|
| WORKER | `queue:protocolGenerationJob` | Process ProtocolGenerationJob |

See `api-contract.md` for full request/response schemas and error codes.

## System steps (main flow)

1. Worker dequeues; UPDATE ProtocolGenerationJob SET status='IN_PROGRESS', started_at=now WHERE id=:id AND status='QUEUED'.
2. Load Transcript via transcript_id; read language.
3. Select prompt template per Transcript.language (RU/EN); record prompt_template_version on job (RQ-022).
4. Submit transcript + selected prompt to ILlmProvider.generate (TECH-011).
5. Parse LLM response into Markdown.
6. Validate four required sections are present: Participants, Discussion Topics, Decisions, Action Items (RQ-023). Missing -> FAILED path.
7. Insert Protocol(meeting_id, markdown_content, version=1, edit_count=0, generated_at=now) (RQ-025).
8. Transition Meeting.status -> PROTOCOL_READY (BRQ-008).
9. Transition ProtocolGenerationJob.status -> COMPLETED, completed_at=now (RQ-021).
10. Publish SSE 'meeting.status' event.
11. ALT failure path: catch any thrown error or section-missing -> mark job FAILED with descriptive error_reason; Meeting.status -> FAILED; publish SSE; do NOT re-enqueue (RQ-026).

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

#### `MeetingLanguage`
- `RU` — Russian
- `EN` — English

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
- [ ] Worker job lifecycle verified end-to-end with a sample fixture.
