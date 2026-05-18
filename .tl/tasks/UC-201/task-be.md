---
id: UC-201-BE
title: View and download transcript — backend
type: uc-be
uc: UC-201
module: mod-transcription
actor: AUTHOR
wave: 3
priority: high
depends_on: ['UC-200-BE']
blocks: ['UC-201-FE']
---

# UC-201-BE — View and download transcript (API)

## User story

> As an Author, I want to view the verbatim transcript with speaker labels and download it as a text file, so I have a permanent meeting record.

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
| RQ-019 | functional | high | Transcript view MUST display each segment with its speaker label (resolved from speaker_map or 'Speaker N') and minute/second timestamps. |
| RQ-020 | functional | medium | Download produces a plain-text file (.txt) with verbatim transcript + speaker labels + timestamps. Filename: '<meeting-title>-transcript.txt' (or filename fallback when title is null). |

## API endpoints / worker contract

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/meetings/:id/transcript` | Get transcript JSON |
| GET | `/api/meetings/:id/transcript/download` | Download transcript text |

See `api-contract.md` for full request/response schemas and error codes.

## System steps (main flow)

1. Load Transcript by meeting_id; gate on Meeting.status >= TRANSCRIPT_READY (return 409 otherwise).
2. For JSON endpoint: return Transcript shape with full_text + speaker_map.
3. For download endpoint: stream full_text as text/plain with Content-Disposition attachment filename '<title or filename>-transcript.txt' (RQ-020).

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

## Enumerations

#### `MeetingLanguage`
- `RU` — Russian
- `EN` — English


## Definition of done

- [ ] All endpoints / worker handlers implemented per `api-contract.md`.
- [ ] All listed requirements verified by tests in `test-spec.md`.
- [ ] Prisma migrations include any new indexes/constraints required.
- [ ] All thrown errors map to `AppError` with stable `code` per TECH-005 error handler.
- [ ] No external SA-doc lookups in source — all logic justified by RQ IDs in code comments.
- [ ] BE/FE sync passes (`/nacl-tl-sync UC-201`).
