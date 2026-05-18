# UC-100 — API Contract

**UC:** Upload meeting video  
**BE:** `UC-100-BE` · **FE:** `UC-100-FE`

> SOURCE OF TRUTH for BE/FE interface. Both agents consume this file.

## Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/uploads` | none (NFR-007) | Create TUS upload session |
| PATCH | `/api/uploads/:uploadId` | none (NFR-007) | Stream upload chunks |
| POST | `/api/uploads/:uploadId/finalize` | none (NFR-007) | Finalize upload |

## Shared types (Zod schemas in `@transcrib/shared`)

```ts
// All types live in shared/src/api/uc100.ts
// BE imports as runtime Zod; FE imports inferred TS types.
import { z } from 'zod';
import { MeetingStatus, MeetingLanguage, JobStatus, VideoMimeType } from '../enums';

// TUS metadata header (Base64 KV pairs):
//   filename   — original filename
//   filetype   — actual MIME type string (video/mp4, video/x-matroska, video/quicktime)
//   size_bytes, title?, language?
// Server reads "filetype" to validate MIME per RQ-008/009/010 at pre-create.
export const UploadFinalizeResponse = z.object({
  meeting_id: z.string().uuid(),
  status: z.literal('TRANSCRIBING'),
});
export type UploadFinalizeResponse = z.infer<typeof UploadFinalizeResponse>;

// Used as request shape for client-side validation BEFORE TUS create.
export const UploadCreateRequest = z.object({
  filename: z.string().min(1),
  size_bytes: z.number().int().positive().max(524_288_000), // RQ-008
  mime_type: VideoMimeType, // RQ-009
  title: z.string().optional(),
  language: MeetingLanguage.optional(), // omit/null -> auto-detect per RQ-012
});
export type UploadCreateRequest = z.infer<typeof UploadCreateRequest>;
```

## Endpoint details

### `POST /api/uploads`
Create TUS upload session

**Note:** TUS pre-create. Reads Upload-Metadata for filename/mime/size/title/language. Validates RQ-008+RQ-009 BEFORE accepting bytes.

**Response type:** `TusCreateResponse`

### `PATCH /api/uploads/:uploadId`
Stream upload chunks

**Note:** TUS chunk PATCH. Streams to S3 via TECH-008.

**Response type:** `TusPatchResponse`

### `POST /api/uploads/:uploadId/finalize`
Finalize upload

**Note:** On TUS on-finish hook: probeContainer (RQ-010), atomically create Meeting+Recording, transition UPLOADING->TRANSCRIBING, enqueue TranscriptionJob (RQ-011). Returns {meeting_id}.

**Response type:** `UploadFinalizeResponse`

## Errors

All errors are `AppError` (see TECH-005). Stable codes returned in body `{code, message, details?}`.

| HTTP | Code | When |
|------|------|------|
| 413 | `FILE_TOO_LARGE` | size_bytes > 524288000 (RQ-008) |
| 415 | `UNSUPPORTED_MIME` | mime_type not in {video/mp4, video/x-matroska, video/quicktime} (RQ-009) |
| 422 | `CONTAINER_INVALID` | ffprobe rejected the container (RQ-010) |
| 500 | `STORAGE_WRITE_FAILED` | S3 putObject failure |
| 500 | `INTERNAL_ERROR` | unhandled |

## Authentication

MVP runs without auth per **NFR-007**. All endpoints are open. Ownership scope (RQ-003) is semantically 'all' at MVP — to be re-enabled when auth is added.

