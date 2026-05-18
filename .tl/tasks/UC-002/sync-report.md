---
task: UC-002
phase: sync
verdict: pass
---
# Sync: UC-002 BE/FE

## Contract check

| Endpoint | Contract | BE | FE | Result |
|----------|----------|----|-----|--------|
| GET /api/meetings/:id | api-contract.md | uc-002.ts route | meeting/index.tsx | PASS |
| GET /api/meetings/:id/events | api-contract.md | TECH-012 (SSE) | meeting/index.tsx | PASS |

- BE registers route at `/api/meetings/:id` (uc-002.ts line 17) — matches contract.
- FE calls `apiGet(\`/api/meetings/${id}\`, MeetingDetailResponse)` (meeting/index.tsx line 15) — matches contract.
- SSE: BE emits on `/api/meetings/:id/events` (TECH-012); FE subscribes via `new EventSource(\`/api/meetings/${meetingId}/events\`)` (meeting/index.tsx line 33) — path matches.
- HTTP method: GET on both sides — matches.
- Response status 200: BE sends 200 — FE accepts any 2xx — matches.
- Error 404 `MEETING_NOT_FOUND`: BE throws `AppError('MEETING_NOT_FOUND', 404)` in service (uc-002.service.ts line 44 and 52) — matches contract.
- Error 500 `INTERNAL_ERROR`: BE throws `AppError('INTERNAL_ERROR', 500)` in service catch block — matches contract.
- No auth on either side — consistent with NFR-007.

## Schema alignment

- Shared schema: `shared/src/api/uc002.ts` — `MeetingDetailResponse` + `MeetingStatusEvent`.
- BE imports `MeetingDetailResponse` from `@transcrib/shared` and registers as Fastify response schema.
- BE service builds return value manually matching all required fields:
  - `meeting`: id, title, language, status, uploaded_at, updated_at — all present.
  - `recording`: filename, size_bytes, mime_type, duration_sec — all present.
  - `latest_transcription_job`: status, started_at, completed_at, error_reason (mapped from `errorMsg`) — all present.
  - `latest_protocol_job`: same shape — all present.
  - `transcript_exists`: boolean — present.
  - `protocol_exists`: boolean — present.
- FE imports `MeetingDetailResponse` from `@transcrib/shared` and passes to `apiGet` as parse schema.
- Both sides reference the identical exported symbol — zero drift possible.
- `recording.mime_type` field: shared schema uses `VideoMimeType` enum (`VIDEO_MP4`, etc.); BE service returns `rec.mimeType` which is the Prisma enum value (also `VIDEO_MP4`-style) stored via `MIME_TO_PRISMA` mapping in uc-100.service.ts — consistent.
- SSE event: `MeetingStatusEvent` schema is defined in shared; FE does not parse SSE payload with Zod (it only reads `payload.id` for query invalidation), which is acceptable — the event schema serves as documentation and BE type-checking.

## Issues (if any)

None. All fields align. The `recording.mime_type` round-trip (raw MIME string -> MIME_TO_PRISMA -> Prisma -> DTO) produces enum values matching `VideoMimeType` — consistent.

## Verdict

PASS — BE and FE both consume the same `MeetingDetailResponse` Zod schema. Both endpoints (REST + SSE) paths, methods, and response shapes are fully aligned.
