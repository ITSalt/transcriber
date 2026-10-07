# UC-003 — API Contract

**UC:** Delete meeting  
**BE:** `UC-003-BE` · **FE:** `UC-003-FE`

> SOURCE OF TRUTH for BE/FE interface. Both agents consume this file.

## Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| DELETE | `/api/meetings/:id` | session (FR-003) | Delete meeting |

## Shared types (Zod schemas in `@transcrib/shared`)

```ts
// All types live in shared/src/api/uc003.ts
// BE imports as runtime Zod; FE imports inferred TS types.
import { z } from 'zod';
import { MeetingStatus, MeetingLanguage, JobStatus, VideoMimeType } from '../enums';

export const MeetingDeleteResponse = z.object({
  deleted: z.literal(true),
  in_flight_failed: z.boolean(), // true if any job was IN_PROGRESS at delete time (RQ-007)
});
export type MeetingDeleteResponse = z.infer<typeof MeetingDeleteResponse>;
```

## Endpoint details

### `DELETE /api/meetings/:id`
Delete meeting

**Note:** Cascade-delete derived rows + storage object; returns {deleted:true, in_flight_failed:boolean}.

**Response type:** `MeetingDeleteResponse`

## Errors

All errors are `AppError` (see TECH-005). Stable codes returned in body `{code, message, details?}`.

| HTTP | Code | When |
|------|------|------|
| 404 | `MEETING_NOT_FOUND` | id does not exist |
| 500 | `STORAGE_DELETE_FAILED` | EXT-04 object removal failed |
| 500 | `INTERNAL_ERROR` | unhandled |

## Authentication

**Access (FR-003, WP-BACKEND-01; supersedes NFR-007).** Every endpoint needs a session (cookie `transcrib_session`) when `AUTH_REQUIRED=true`; with the default `false` a request without a session is served by the legacy principal, restricted to the workspace «Роман» (D-20). Meeting-scoped endpoints check workspace membership before validation and the handler: someone else's and a nonexistent meeting answer the same `404 {code: NOT_FOUND, message: «Не найдено»}` (RQ-044). See `api/README.md` and `shared/src/api/{auth,workspace,errors}.ts`.

