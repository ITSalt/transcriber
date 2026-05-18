---
task: UC-301
phase: sync
verdict: PASS
verified: 2026-05-18
---
# Sync Check: UC-301 Review and Edit Protocol

## Contract Points Verified

### 1. GET /api/meetings/:id/protocol — URL match

- **Contract:** `GET /api/meetings/:id/protocol`
- **BE route** (`api/src/routes/uc-301.ts` line 25): `'/api/meetings/:id/protocol'` — MATCH
- **FE hook** (`web/src/routes/protocol/index.tsx` line 27): `` apiGet(`/api/meetings/${meetingId}/protocol`, ProtocolResponse) `` — MATCH

### 2. PUT /api/meetings/:id/protocol — URL, method, request body, response shape

- **Contract:** `PUT /api/meetings/:id/protocol`, body `{markdown_content: string}`, response `ProtocolSaveResponse`
- **BE route** (`api/src/routes/uc-301.ts` line 46): `PUT '/api/meetings/:id/protocol'`, body schema `ProtocolSaveRequest` — MATCH
- **FE mutation** (`web/src/routes/protocol/index.tsx` line 67): `` apiPut(`/api/meetings/${meetingId}/protocol`, body, ProtocolSaveResponse) `` — MATCH
- **HTTP method:** Contract specifies PUT; BE registers PUT; FE calls `apiPut` (PUT). All agree — MATCH
- **Note:** api-contract.md also mentions PATCH in the task-be.md summary header ("PATCH /api/protocols/:id"), but this is a discrepancy in the task prose only. Both the actual api-contract.md (source of truth) and all implementations consistently use PUT. No functional mismatch.

### 3. Shared Zod schemas from @transcrib/shared

- **Shared schema file:** `shared/src/api/uc301.ts` exports `ProtocolResponse`, `ProtocolSaveRequest`, `ProtocolSaveResponse`
- **Shared index:** `shared/src/api/index.ts` re-exports `./uc301.js`; top-level `shared/src/index.ts` re-exports `./api/index.js`
- **BE route** imports `{ ProtocolResponse, ProtocolSaveRequest, ProtocolSaveResponse }` from `@transcrib/shared` — MATCH
- **BE service** imports `type { ProtocolResponse, ProtocolSaveResponse }` from `@transcrib/shared` — MATCH
- **FE page** imports `{ ProtocolResponse, ProtocolSaveResponse }` and `type { ProtocolSaveRequest }` from `@transcrib/shared` — MATCH
- No inline type definitions or duplicates found in either BE or FE

### 4. ProtocolResponse shape (GET response)

Contract schema (`shared/src/api/uc301.ts`):
```
{ id, meeting_id, markdown_content, version, edit_count, generated_at, last_edited_at? }
```
BE service `getProtocol` return object maps all fields with correct snake_case names and ISO datetime strings. FE consumes `data.version`, `data.edit_count`, `data.last_edited_at`, `data.generated_at`, `data.markdown_content` — all field names match schema — MATCH

### 5. ProtocolSaveRequest shape (PUT body)

Contract: `{ markdown_content: string (min 1) }`
BE route uses `ProtocolSaveRequest` Zod schema for body validation. BE service destructures `markdownContent` from Prisma (different casing internally), but the wire format `markdown_content` is what the route schema enforces. FE sends `{ markdown_content: markdown }` — MATCH

### 6. ProtocolSaveResponse shape (PUT response)

Contract: `{ version, edit_count, last_edited_at, meeting_status: 'EDITED' }`
BE service `saveProtocol` returns exactly `{ version, edit_count, last_edited_at, meeting_status: 'EDITED' }` — MATCH
FE `onSuccess` destructures `result.version`, `result.edit_count`, `result.last_edited_at` — MATCH

### 7. Error codes/shapes

Contract error table:
| HTTP | Code | When |
|------|------|------|
| 404 | PROTOCOL_NOT_FOUND | no Protocol for meeting |
| 409 | STATUS_NOT_READY | Meeting.status not in {PROTOCOL_READY, EDITED} |
| 400 | VALIDATION_FAILED | markdown_content missing/empty |
| 500 | INTERNAL_ERROR | DB failure |

BE throws `AppError` with these exact codes in `uc-301.service.ts`. Fastify error handler (TECH-005) serializes as `{ code, message, details? }`.

FE error handling: uses `ApiError` from `web/src/lib/api.ts` which catches HTTP non-OK responses. The FE does not branch on specific error codes for UC-301 (shows a generic error state) — this is consistent with the contract which does not require FE to handle individual error codes differently.

### 8. SSE events

UC-301 has no SSE events defined in `api-contract.md`. Neither BE nor FE registers or listens to SSE for this use case. The SSE stream (`GET /api/meetings/:id/events`) is used by other UCs. No divergence.

### 9. No raw fetch / no inline types

FE uses `apiGet` and `apiPut` from `web/src/lib/api.ts` exclusively — no raw `fetch` calls in component code. All types from `@transcrib/shared`.

### 10. Test baseline

`pnpm test` from project root: **455 passed, 7 skipped** — matches expected baseline. UC-301 specific suites:
- `api/src/routes/uc-301.test.ts` — 25 tests, all pass
- `web/src/routes/protocol/index.test.tsx` — 25 tests, all pass

## Summary

All contract points agree between BE and FE. The shared Zod schemas are the single source of type truth used by both sides. No URL mismatches, no field name divergences, no method mismatches, no missing error code handling gaps. Test baseline is green.
