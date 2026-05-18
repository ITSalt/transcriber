# UC-200 — API Contract

**UC:** Process transcription pipeline  
**BE:** `UC-200-BE` · **FE:** `UC-200-FE`

> SOURCE OF TRUTH for BE/FE interface. Both agents consume this file.

## Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| WORKER | `queue:transcriptionJob` | n/a | Process TranscriptionJob |

## Shared types (Zod schemas in `@transcrib/shared`)

```ts
// All types live in shared/src/api/uc200.ts
// BE imports as runtime Zod; FE imports inferred TS types.
import { z } from 'zod';
import { MeetingStatus, MeetingLanguage, JobStatus, VideoMimeType } from '../enums';

// BullMQ queue: 'transcriptionJob'
export const TranscriptionJobPayload = z.object({
  transcription_job_id: z.string().uuid(),
});
export type TranscriptionJobPayload = z.infer<typeof TranscriptionJobPayload>;

// Internal worker result (not exposed via HTTP)
export const TranscriptionResult = z.object({
  transcript_id: z.string().uuid(),
  segments_count: z.number().int(),
  speakers_count: z.number().int(),
  language: MeetingLanguage,
  speaker_map: z.record(z.string(), z.string().nullable()).nullable(),
});
export type TranscriptionResult = z.infer<typeof TranscriptionResult>;
```

## Endpoint details

### `WORKER queue:transcriptionJob`
Process TranscriptionJob

**Note:** BullMQ worker handler. No HTTP surface. Payload: {transcription_job_id}.

**Response type:** `n/a`

## Errors

All errors are `AppError` (see TECH-005). Stable codes returned in body `{code, message, details?}`.

| HTTP | Code | When |
|------|------|------|
_Worker UC — failures are written to TranscriptionJob.error_reason (RQ-015), not HTTP. See system steps ALT path._

## Authentication

MVP runs without auth per **NFR-007**. All endpoints are open. Ownership scope (RQ-003) is semantically 'all' at MVP — to be re-enabled when auth is added.

