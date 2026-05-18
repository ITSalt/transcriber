# UC-002 — API Contract

**UC:** View meeting detail  
**BE:** `UC-002-BE` · **FE:** `UC-002-FE`

> SOURCE OF TRUTH for BE/FE interface. Both agents consume this file.

## Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/meetings/:id` | none (NFR-007) | Get meeting detail |
| GET | `/api/meetings/:id/events` | none (NFR-007) | SSE event stream |

## Shared types (Zod schemas in `@transcrib/shared`)

```ts
// All types live in shared/src/api/uc002.ts
// BE imports as runtime Zod; FE imports inferred TS types.
import { z } from 'zod';
import { MeetingStatus, MeetingLanguage, JobStatus, VideoMimeType } from '../enums';

export const MeetingDetailResponse = z.object({
  meeting: z.object({
    id: z.string().uuid(),
    title: z.string().nullable(),
    language: MeetingLanguage.nullable(),
    status: MeetingStatus,
    uploaded_at: z.string().datetime(),
    updated_at: z.string().datetime(),
  }),
  recording: z.object({
    filename: z.string(),
    size_bytes: z.number().int(),
    mime_type: VideoMimeType,
    duration_sec: z.number().int().nullable(),
  }),
  latest_transcription_job: z.object({
    status: JobStatus,
    started_at: z.string().datetime().nullable(),
    completed_at: z.string().datetime().nullable(),
    error_reason: z.string().nullable(),
  }).nullable(),
  latest_protocol_job: z.object({
    status: JobStatus,
    started_at: z.string().datetime().nullable(),
    completed_at: z.string().datetime().nullable(),
    error_reason: z.string().nullable(),
  }).nullable(),
  transcript_exists: z.boolean(),
  protocol_exists: z.boolean(),
});
export type MeetingDetailResponse = z.infer<typeof MeetingDetailResponse>;

// SSE event payload (consumed by FE, emitted by BE via TECH-012)
export const MeetingStatusEvent = z.object({
  type: z.literal('meeting.status'),
  meeting_id: z.string().uuid(),
  status: MeetingStatus,
  error_reason: z.string().nullable().optional(),
});
export type MeetingStatusEvent = z.infer<typeof MeetingStatusEvent>;
```

## Endpoint details

### `GET /api/meetings/:id`
Get meeting detail

**Note:** Returns Meeting + Recording + most-recent TranscriptionJob + most-recent ProtocolGenerationJob + flags transcriptExists/protocolExists.

**Response type:** `MeetingDetailResponse`

### `GET /api/meetings/:id/events`
SSE event stream

**Note:** Implemented by TECH-012; consumed for status auto-refresh.

**Response type:** `EventStream`

## Errors

All errors are `AppError` (see TECH-005). Stable codes returned in body `{code, message, details?}`.

| HTTP | Code | When |
|------|------|------|
| 404 | `MEETING_NOT_FOUND` | id does not exist |
| 500 | `INTERNAL_ERROR` | DB failure |

## Authentication

MVP runs without auth per **NFR-007**. All endpoints are open. Ownership scope (RQ-003) is semantically 'all' at MVP — to be re-enabled when auth is added.

