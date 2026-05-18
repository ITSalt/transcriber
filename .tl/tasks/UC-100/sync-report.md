---
task: UC-100
phase: sync
verdict: pass
verified: 2026-05-18
---
# Sync: UC-100 BE/FE (Re-check)

## Contract check

| Endpoint | Contract | BE | FE | Result |
|----------|----------|----|-----|--------|
| POST /api/uploads | api-contract.md | TECH-008 (TUS) | tus.Upload endpoint="/api/uploads" | PASS |
| PATCH /api/uploads/:uploadId | api-contract.md | TECH-008 (TUS) | tus-js-client (automatic) | PASS |
| POST /api/uploads/:uploadId/finalize | api-contract.md | uc-100.ts route | upload/index.tsx onSuccess | PASS |

## Checks performed

### 1. FE finalize body (web/src/routes/upload/index.tsx lines 151-161)

The `onSuccess` callback now sends:
```ts
{
  filename: file.name,
  size_bytes: file.size,
  mime_type: file.type,
  title: effectiveTitle,
  ...(language && { language }),
}
```
All three required fields (`filename`, `size_bytes`, `mime_type`) are present. Optional `title` and `language` are handled correctly. PASS.

### 2. MIME type format (raw string vs enum)

`mime_type: file.type` sends the raw browser MIME string (e.g. `"video/mp4"`). The BE `ALLOWED_MIME` set (api/src/routes/uc-100.ts line 66) contains `'video/mp4'`, `'video/x-matroska'`, `'video/quicktime'` — raw strings. Values align. PASS.

### 3. BE ALLOWED_MIME set (api/src/routes/uc-100.ts line 66)

`new Set(['video/mp4', 'video/x-matroska', 'video/quicktime'])` — exactly three types, webm/avi removed per RQ-009. PASS.

### 4. UploadFinalizeResponse schema alignment (shared/src/api/uc100.ts)

Shared schema: `{ meeting_id: z.string().uuid(), status: z.literal('TRANSCRIBING') }`.
- BE: route is bound to `UploadFinalizeResponse` via Zod type provider; returns `finalizeUpload(...)` result.
- FE: imports `UploadFinalizeResponse` from `@transcrib/shared` and passes it to `apiPost` for response parsing.
Full round-trip alignment. PASS.

### 5. Test SYNC-UC100-1 (web/src/routes/upload/index.test.tsx lines 234-256)

Test is present and asserts:
- `body["filename"] === "my-meeting.mp4"`
- `body["size_bytes"] === 2048`
- `body["mime_type"] === "video/mp4"`
- `body["title"] === "my-meeting"`

Covers the previously failing contract point. PASS.

### 6. Language field

FE sends `language` only when truthy (`...(language && { language })`). BE schema: `language: z.enum(['RU', 'EN', 'AUTO']).optional()`. FE values are `"RU"` or `"EN"` — valid enum members. PASS.

## Issues

None. All issues identified in the prior FAIL report have been resolved.

## Verdict

PASS — All BE/FE contract points for UC-100 are satisfied. The finalize body now contains all required fields with correct types and MIME format. Schema alignment is complete. Test SYNC-UC100-1 provides automated coverage.
