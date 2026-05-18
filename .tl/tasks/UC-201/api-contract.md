# UC-201 — API Contract

**UC:** View and download transcript  
**BE:** `UC-201-BE` · **FE:** `UC-201-FE`

> SOURCE OF TRUTH for BE/FE interface. Both agents consume this file.

## Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/meetings/:id/transcript` | none (NFR-007) | Get transcript JSON |
| GET | `/api/meetings/:id/transcript/download` | none (NFR-007) | Download transcript text |

## Shared types (Zod schemas in `@transcrib/shared`)

```ts
// All types live in shared/src/api/uc201.ts
// BE imports as runtime Zod; FE imports inferred TS types.
import { z } from 'zod';
import { MeetingStatus, MeetingLanguage, JobStatus, VideoMimeType } from '../enums';

export const TranscriptResponse = z.object({
  id: z.string().uuid(),
  meeting_id: z.string().uuid(),
  full_text: z.string(),
  segments_count: z.number().int(),
  speakers_count: z.number().int(),
  language: MeetingLanguage,
  speaker_map: z.record(z.string(), z.string().nullable()).nullable(),
  created_at: z.string().datetime(),
});
export type TranscriptResponse = z.infer<typeof TranscriptResponse>;
```

## Endpoint details

### `GET /api/meetings/:id/transcript`
Get transcript JSON

**Note:** Returns Transcript + speaker_map for rendering.

**Response type:** `TranscriptResponse`

### `GET /api/meetings/:id/transcript/download`
Download transcript text

**Note:** Streams plain-text file with Content-Disposition: attachment; filename per RQ-020.

**Response type:** `text/plain`

## Errors

All errors are `AppError` (see TECH-005). Stable codes returned in body `{code, message, details?}`.

| HTTP | Code | When |
|------|------|------|
| 404 | `TRANSCRIPT_NOT_FOUND` | no Transcript for meeting |
| 409 | `STATUS_NOT_READY` | Meeting.status < TRANSCRIPT_READY |
| 500 | `INTERNAL_ERROR` | DB failure |

## Authentication

MVP runs without auth per **NFR-007**. All endpoints are open. Ownership scope (RQ-003) is semantically 'all' at MVP — to be re-enabled when auth is added.

