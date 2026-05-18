# UC-003 — API Contract

**UC:** Delete meeting  
**BE:** `UC-003-BE` · **FE:** `UC-003-FE`

> SOURCE OF TRUTH for BE/FE interface. Both agents consume this file.

## Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| DELETE | `/api/meetings/:id` | none (NFR-007) | Delete meeting |

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

MVP runs without auth per **NFR-007**. All endpoints are open. Ownership scope (RQ-003) is semantically 'all' at MVP — to be re-enabled when auth is added.

