---
task: UC-001
phase: sync
verdict: pass
---
# Sync: UC-001 BE/FE

## Contract check

| Endpoint | Contract | BE | FE | Result |
|----------|----------|----|-----|--------|
| GET /api/meetings | api-contract.md | uc-001.ts route | catalog/index.tsx | PASS |

- BE registers route at `/api/meetings` (uc-001.ts line 16) — matches contract.
- FE calls `apiGet("/api/meetings", MeetingListResponse)` (catalog/index.tsx line 23) — matches contract.
- HTTP method: GET on both sides — matches.
- Response status code: BE sends 200 — FE `apiGet` accepts any 2xx — matches.
- Error code `INTERNAL_ERROR` (500): BE throws via `AppError` in service — matches contract.
- No auth on either side — consistent with NFR-007.

## Schema alignment

- Shared schema: `shared/src/api/uc001.ts` — `MeetingListItem` + `MeetingListResponse`.
- BE imports `MeetingListResponse` from `@transcrib/shared` and registers it as the Fastify response schema (runtime Zod validation on serialization).
- BE service maps Prisma rows to `MeetingListItem[]` and returns `{ items }` — all required fields present: `id`, `title`, `filename`, `status`, `language`, `uploaded_at`, `updated_at`, `duration_sec`.
- FE imports `MeetingListResponse` from `@transcrib/shared` and passes it directly to `apiGet` as the parse schema.
- Both sides reference the identical exported symbol from the same package — zero drift possible.
- `MeetingStatus` enum referenced in `MeetingListItem.status` is defined in `shared/src/enums.ts` — shared on both sides.
- `MeetingLanguage` enum referenced in `MeetingListItem.language` — same.
- Shared schema does NOT import `JobStatus` or `VideoMimeType` (not needed for list view) — no unused imports.
- Note: api-contract.md snippet imports `JobStatus` and `VideoMimeType` which the actual `uc001.ts` does not — contract doc has a minor superfluous import, but the schema shape is identical and correct.

## Issues (if any)

None. The api-contract.md lists a slightly wider import statement than what is in the actual shared file, but the exported schema shapes are identical. This is a documentation cosmetic issue only — no functional divergence.

## Verdict

PASS — BE and FE both consume the same `MeetingListResponse` Zod schema. Endpoint path, method, and response shape are fully aligned.
