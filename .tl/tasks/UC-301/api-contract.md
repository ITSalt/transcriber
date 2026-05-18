# UC-301 — API Contract

**UC:** Review and edit protocol  
**BE:** `UC-301-BE` · **FE:** `UC-301-FE`

> SOURCE OF TRUTH for BE/FE interface. Both agents consume this file.

## Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/meetings/:id/protocol` | none (NFR-007) | Get protocol Markdown |
| PUT | `/api/meetings/:id/protocol` | none (NFR-007) | Save protocol edits |

## Shared types (Zod schemas in `@transcrib/shared`)

```ts
// All types live in shared/src/api/uc301.ts
// BE imports as runtime Zod; FE imports inferred TS types.
import { z } from 'zod';
import { MeetingStatus, MeetingLanguage, JobStatus, VideoMimeType } from '../enums';

export const ProtocolResponse = z.object({
  id: z.string().uuid(),
  meeting_id: z.string().uuid(),
  markdown_content: z.string(),
  version: z.number().int().min(1),
  edit_count: z.number().int().min(0),
  generated_at: z.string().datetime(),
  last_edited_at: z.string().datetime().nullable(),
});
export type ProtocolResponse = z.infer<typeof ProtocolResponse>;

export const ProtocolSaveRequest = z.object({
  markdown_content: z.string().min(1), // canonical Markdown per BRQ-018
});
export type ProtocolSaveRequest = z.infer<typeof ProtocolSaveRequest>;

export const ProtocolSaveResponse = z.object({
  version: z.number().int().min(2), // initial = 1, first save = 2
  edit_count: z.number().int().min(1),
  last_edited_at: z.string().datetime(),
  meeting_status: z.literal('EDITED'),
});
export type ProtocolSaveResponse = z.infer<typeof ProtocolSaveResponse>;
```

## Endpoint details

### `GET /api/meetings/:id/protocol`
Get protocol Markdown

**Note:** Returns {markdown_content, version, edit_count, generated_at, last_edited_at}.

**Response type:** `ProtocolResponse`

### `PUT /api/meetings/:id/protocol`
Save protocol edits

**Note:** Body: {markdown_content}. Atomically: markdown_content=new, version+=1, edit_count+=1, last_edited_at=now; Meeting.status -> EDITED (if not already). Returns updated {version, edit_count, last_edited_at}.

**Response type:** `ProtocolSaveResponse`

## Errors

All errors are `AppError` (see TECH-005). Stable codes returned in body `{code, message, details?}`.

| HTTP | Code | When |
|------|------|------|
| 404 | `PROTOCOL_NOT_FOUND` | no Protocol for meeting |
| 409 | `STATUS_NOT_READY` | Meeting.status not in {PROTOCOL_READY, EDITED} (RQ-029) |
| 400 | `VALIDATION_FAILED` | markdown_content missing/empty |
| 500 | `INTERNAL_ERROR` | DB failure |

## Authentication

MVP runs without auth per **NFR-007**. All endpoints are open. Ownership scope (RQ-003) is semantically 'all' at MVP — to be re-enabled when auth is added.

