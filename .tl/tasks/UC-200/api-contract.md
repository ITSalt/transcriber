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
_Worker UC — failures are written to TranscriptionJob.error_msg DB column (RQ-015), not HTTP. SSE event payload uses the legacy `error_reason` field name (DTO contract, shared/src/api/uc002.ts) — that is the wire-level name and remains stable; the rename only affects the persisted column. See system steps ALT path._

## Authentication

**Access (FR-003, WP-BACKEND-01; supersedes NFR-007).** Every endpoint needs a session (cookie `transcrib_session`) when `AUTH_REQUIRED=true`; with the default `false` a request without a session is served by the legacy principal, restricted to the workspace «Роман» (D-20). Meeting-scoped endpoints check workspace membership before validation and the handler: someone else's and a nonexistent meeting answer the same `404 {code: NOT_FOUND, message: «Не найдено»}` (RQ-044). See `api/README.md` and `shared/src/api/{auth,workspace,errors}.ts`.

