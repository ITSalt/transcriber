# UC-301 — API Contract

**UC:** Review and edit protocol  
**BE:** `UC-301-BE` · **FE:** `UC-301-FE`

> SOURCE OF TRUTH for BE/FE interface. Both agents consume this file.

## Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/meetings/:id/protocol` | session (FR-003) | Get protocol Markdown |
| PUT | `/api/meetings/:id/protocol` | session (FR-003) | Save protocol edits |

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

**Access (FR-003, WP-BACKEND-01; supersedes NFR-007).** Every endpoint needs a session (cookie `transcrib_session`) when `AUTH_REQUIRED=true`; with the default `false` a request without a session is served by the legacy principal, restricted to the workspace «Роман» (D-20). Meeting-scoped endpoints check workspace membership before validation and the handler: someone else's and a nonexistent meeting answer the same `404 {code: NOT_FOUND, message: «Не найдено»}` (RQ-044). See `api/README.md` and `shared/src/api/{auth,workspace,errors}.ts`.


## WP-BACKEND-01 additions (FR-005 / RQ-050)

`PUT /api/meetings/:id/protocol` also appends an immutable `ProtocolVersion(kind USER_EDIT, authorUserId)` in the same transaction (the replaced text is first recorded as v1 `GENERATED`/`LEGACY` or the next `LEGACY` version when the history lacks it). Two saves racing for the same version number → `409 PROTOCOL_EDIT_CONFLICT` (reload and retry). `authorUserId` is null for the legacy principal (D-20).
