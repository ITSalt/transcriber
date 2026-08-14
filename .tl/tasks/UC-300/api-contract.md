# UC-300 — API Contract

**UC:** Generate protocol pipeline  
**BE:** `UC-300-BE` · **FE:** none (`UC-300.has_ui = false`, actor SYSTEM)

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
_Worker UC — failures are written to `ProtocolGenerationJob.error_msg` (RQ-026), not returned over HTTP. See the ALT failure path in `task-be.md`._

### Upstream provider status handling (kie.ai — DEC-001)

Not an HTTP contract of this UC, but the contract this UC **consumes**. The
adapter classifies on the **effective status** — `body.code` when an HTTP 200
body carries a numeric `code != 200`, else the HTTP status:

| Effective status | Class | Job outcome |
|---|---|---|
| 404, 408, 429, 5xx; network/transport | TRANSIENT | Re-throw, no DB write, BullMQ retries (up to 3) |
| 400, 401, 402, 413, other unlisted 4xx | PERMANENT | `FAILED` + `error_msg` immediately |
| local parse / empty completion / missing section | PERMANENT | `FAILED` + `error_msg` immediately |

Default endpoint is exactly `https://api.kie.ai/claude/v1/messages`. Full wire
detail: `.tl/external-contracts/kie-anthropic.md` §5.1 and §8.

## Authentication

MVP runs without auth per **NFR-007**. All endpoints are open. Ownership scope (RQ-003) is semantically 'all' at MVP — to be re-enabled when auth is added.

