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
| RQ-021 | functional | high | ProtocolGenerationJob lifecycle: PENDING -> PROCESSING -> {DONE, FAILED}. Terminal immutable (BRQ-009). |
| RQ-022 | functional | high | LLM prompt template selected by Meeting.language (Transcript.language is derived from this); resulting protocol language MUST match transcript language. Template version NOT persisted on job at MVP (single hard-coded template). |
| RQ-023 | functional/validation | high | Persisted Protocol MUST contain Participants, Discussion Topics, Decisions, Action Items (BRQ-011). Missing section -> job FAILED. |
| RQ-024 | functional | medium | Action items SHOULD include assignee/deadline when stated (BRQ-012). Best-effort by LLM. |
| RQ-025 | functional | high | Initial Protocol on success: version=1, edit_count=0, generated_at=now. Meeting.status -> PROTOCOL_READY (BRQ-008/014/015). |
| RQ-026 | functional | high | PERMANENT failure (parse error, empty/unparseable completion, missing required sections, or a non-retriable kie.ai error per RC-UC-300 — effective status 400/401/402/413 or any other unlisted 4xx) OR the final exhausted BullMQ attempt -> job FAILED with error_msg; Meeting.status -> FAILED (BRQ-008/010). TRANSIENT failure (effective status 404/408/429/5xx — including a code delivered inside an HTTP 200 `{code,msg}` envelope — or a network/transport failure) with attempts remaining -> re-throw WITHOUT writing FAILED so BullMQ retries (BRQ-009 guard must not see a terminal row). Effective status = `body.code` when an HTTP 200 body carries a numeric `code` != 200, else the HTTP status. (FR-001; DEC-001 2026-08-13) |
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

1. Worker dequeues; UPDATE ProtocolGenerationJob SET status='PROCESSING', started_at=now WHERE id=:id AND status='PENDING'.
2. Load Meeting; load Transcript via meeting_id; read Meeting.language for prompt template selection.
3. Select prompt template per Meeting.language (RU/EN); MVP uses a single hard-coded template version (not persisted on job).
4. Submit transcript + selected prompt to ILlmProvider.generate (TECH-011).
5. Parse LLM response into Markdown.
6. Validate four required sections are present: Participants, Discussion Topics, Decisions, Action Items (RQ-023). Missing -> FAILED path.
7. Insert Protocol(meeting_id, markdown_content, version=1, edit_count=0, generated_at=now) (RQ-025).
8. Transition Meeting.status -> PROTOCOL_READY (BRQ-008).
9. Transition ProtocolGenerationJob.status -> DONE, finished_at=now (RQ-021).
10. Publish SSE 'meeting.status' event.
11. ALT failure path (RQ-026 / RC-UC-300): classify the error by **effective status** (`body.code` when an HTTP 200 body carries a numeric `code` != 200, else the HTTP status — see `.tl/external-contracts/kie-anthropic.md` §5.1).
    - TRANSIENT (404/408/429/5xx, or a network/transport failure) **and** BullMQ attempts remain -> re-throw WITHOUT any DB write, so BullMQ schedules the next attempt with exponential backoff. Do NOT write FAILED (the BRQ-009 idempotency guard would otherwise make the re-attempt a no-op).
    - PERMANENT (400/401/402/413, any other unlisted 4xx, JSON-parse failure, empty/unparseable completion, missing section) **or** the final exhausted attempt -> mark job FAILED with descriptive error_msg, finished_at=now, attempt_count=attemptsMade+1; Meeting.status -> FAILED; publish SSE; do NOT re-enqueue.

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

| Attribute | Type | Nullable | Internal | Derived | Description |
|-----------|------|----------|----------|---------|-------------|
| `id` | UUID | no | yes | no | Surrogate PK |
| `meeting_id` | Reference->Meeting | no | yes | no | FK to Meeting (composition; deleted with Meeting) |
| `raw_text` | String | yes | no | no | Markdown/text with per-segment speaker labels + minute:second timestamps. Schema-nullable; always populated by worker. |
| `segments_blob` | JSON | no | no | no | JSONB array of Deepgram word/utterance segments. Default `[]`. |
| `speaker_map` | JSON | yes | no | no | {"Speaker 1": "Ivan", "Speaker 2": null} per BRQ-021. Default `{}`. |
| `segments_count` | Int | yes | no | **yes** | DERIVED: length(segments_blob). Not persisted. |
| `speakers_count` | Int | yes | no | **yes** | DERIVED: distinct speaker count in segments_blob. Not persisted. |
| `language` | Enum(MeetingLanguage) | yes | no | **yes** | DERIVED: canonical value lives on Meeting.language. Not persisted on Transcript. |
| `created_at` | DateTime | no | yes | no | First-persisted time |
| `updated_at` | DateTime | no | yes | no | Last write timestamp |

### Entity: ProtocolGenerationJob
_Async job tracking LLM protocol generation. Auto-created on transcription DONE (BRQ-007). 1:1 with Meeting; Transcript reached via meeting_id._  

| Attribute | Type | Nullable | Internal | Description |
|-----------|------|----------|----------|-------------|
| `id` | UUID | no | yes | Surrogate PK |
| `meeting_id` | Reference->Meeting | no | yes | FK to Meeting (unique; 1:1 per BRQ-007) |
| `status` | Enum(JobStatus) | no | yes | PENDING->PROCESSING->{DONE\|FAILED}; terminal immutable (BRQ-009) |
| `started_at` | DateTime | yes | yes | Worker pickup time |
| `finished_at` | DateTime | yes | yes | Terminal state time (DONE or FAILED) |
| `error_msg` | String | yes | yes | Non-null when status=FAILED (BRQ-010) |

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
- `CREATED` — Meeting row exists; upload not yet started
- `UPLOADING` — File upload in progress
- `UPLOADED` — Upload finalized; TranscriptionJob not yet enqueued
- `TRANSCRIBING` — Transcription queued or running
- `TRANSCRIBED` — Transcript persisted; protocol not yet started or running
- `GENERATING_PROTOCOL` — Protocol-gen job queued or running
- `PROTOCOL_READY` — Protocol persisted; no manual edits yet
- `EDITED` — Protocol manually edited at least once
- `FAILED` — Non-recoverable pipeline error (terminal, BRQ-009)

#### `MeetingLanguage`
- `RU` — Russian
- `EN` — English
- `AUTO` — Auto-detect at ASR time

#### `JobStatus`
- `PENDING` — Waiting for worker
- `PROCESSING` — Worker running
- `DONE` — Terminal success; immutable (BRQ-009)
- `FAILED` — Terminal failure; error_msg set (BRQ-010); immutable (BRQ-009)


## Definition of done

- [ ] All endpoints / worker handlers implemented per `api-contract.md`.
- [ ] All listed requirements verified by tests in `test-spec.md`.
- [ ] Prisma migrations include any new indexes/constraints required.
- [ ] All thrown errors map to `AppError` with stable `code` per TECH-005 error handler.
- [ ] No external SA-doc lookups in source — all logic justified by RQ IDs in code comments.
- [ ] Worker job lifecycle verified end-to-end with a sample fixture.
