# UC-300 — API Contract

**UC:** Generate protocol pipeline  
**BE:** `UC-300-BE` · **FE:** `UC-300-FE`

> SOURCE OF TRUTH for BE/FE interface. Both agents consume this file.

## Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| WORKER | `queue:protocolGenerationJob` | n/a | Process ProtocolGenerationJob |

## Shared types (Zod schemas in `@transcrib/shared`)

```ts
// All types live in shared/src/api/uc300.ts
// BE imports as runtime Zod; FE imports inferred TS types.
import { z } from 'zod';
import { MeetingStatus, MeetingLanguage, JobStatus, VideoMimeType } from '../enums';

// BullMQ queue: 'protocolGenerationJob'
export const ProtocolGenerationJobPayload = z.object({
  protocol_generation_job_id: z.string().uuid(),
});
export type ProtocolGenerationJobPayload = z.infer<typeof ProtocolGenerationJobPayload>;
```

## Endpoint details

### `WORKER queue:protocolGenerationJob`
Process ProtocolGenerationJob

**Note:** BullMQ worker handler. Payload: {protocol_generation_job_id}.

**Response type:** `n/a`

## Errors

All errors are `AppError` (see TECH-005). Stable codes returned in body `{code, message, details?}`.

| HTTP | Code | When |
|------|------|------|
_Worker UC — failures are written to ProtocolGenerationJob.error_reason (RQ-026), not HTTP. See system steps ALT path._

## Authentication

MVP runs without auth per **NFR-007**. All endpoints are open. Ownership scope (RQ-003) is semantically 'all' at MVP — to be re-enabled when auth is added.

