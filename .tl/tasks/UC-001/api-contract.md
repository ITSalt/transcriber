# UC-001 — API Contract

**UC:** View meeting catalog  
**BE:** `UC-001-BE` · **FE:** `UC-001-FE`

> SOURCE OF TRUTH for BE/FE interface. Both agents consume this file.

## Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/meetings` | none (NFR-007) | List meetings |

## Shared types (Zod schemas in `@transcrib/shared`)

```ts
// All types live in shared/src/api/uc001.ts
// BE imports as runtime Zod; FE imports inferred TS types.
import { z } from 'zod';
import { MeetingStatus, MeetingLanguage, JobStatus, VideoMimeType } from '../enums';

export const MeetingListItem = z.object({
  id: z.string().uuid(),
  title: z.string().nullable(),
  filename: z.string(), // fallback when title is null
  status: MeetingStatus,
  language: MeetingLanguage.nullable(),
  uploaded_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  duration_sec: z.number().int().nullable(),
});
export type MeetingListItem = z.infer<typeof MeetingListItem>;

export const MeetingListResponse = z.object({
  items: z.array(MeetingListItem),
});
export type MeetingListResponse = z.infer<typeof MeetingListResponse>;
```

## Endpoint details

### `GET /api/meetings`
List meetings

**Note:** Returns Meeting list sorted by updated_at DESC; joins Recording.duration_sec; no pagination at MVP.

**Response type:** `MeetingListResponse`

## Errors

All errors are `AppError` (see TECH-005). Stable codes returned in body `{code, message, details?}`.

| HTTP | Code | When |
|------|------|------|
| 500 | `INTERNAL_ERROR` | DB failure |

## Authentication

MVP runs without auth per **NFR-007**. All endpoints are open. Ownership scope (RQ-003) is semantically 'all' at MVP — to be re-enabled when auth is added.

