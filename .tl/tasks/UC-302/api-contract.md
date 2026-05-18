# UC-302 — API Contract

**UC:** Export protocol to PDF  
**BE:** `UC-302-BE` · **FE:** `UC-302-FE`

> SOURCE OF TRUTH for BE/FE interface. Both agents consume this file.

## Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/meetings/:id/protocol/pdf` | none (NFR-007) | Export protocol PDF |

## Shared types (Zod schemas in `@transcrib/shared`)

```ts
// All types live in shared/src/api/uc302.ts
// BE imports as runtime Zod; FE imports inferred TS types.
import { z } from 'zod';
import { MeetingStatus, MeetingLanguage, JobStatus, VideoMimeType } from '../enums';

// No JSON body — response is application/pdf (binary).
// Content-Disposition: attachment; filename="<meeting-title>-protocol-v<version>.pdf"

export const PdfExportError = z.object({
  code: z.literal('PDF_RENDER_FAILED'),
  message: z.string(),
});
export type PdfExportError = z.infer<typeof PdfExportError>;
```

## Endpoint details

### `GET /api/meetings/:id/protocol/pdf`
Export protocol PDF

**Note:** Streams Puppeteer-rendered PDF. Gate on Meeting.status in {PROTOCOL_READY, EDITED}. NEVER persists output (RQ-032).

**Response type:** `application/pdf`

## Errors

All errors are `AppError` (see TECH-005). Stable codes returned in body `{code, message, details?}`.

| HTTP | Code | When |
|------|------|------|
| 404 | `PROTOCOL_NOT_FOUND` | no Protocol for meeting |
| 409 | `STATUS_NOT_READY` | Meeting.status not in {PROTOCOL_READY, EDITED} |
| 500 | `PDF_RENDER_FAILED` | Puppeteer render failure (RQ-033) |

## Authentication

MVP runs without auth per **NFR-007**. All endpoints are open. Ownership scope (RQ-003) is semantically 'all' at MVP — to be re-enabled when auth is added.

