# UC-001 — Backend Implementation Brief

**UC:** View meeting catalog

## File plan

- `api/src/routes/uc-001.ts` — Fastify route handlers
- `api/src/services/uc-001.service.ts` — Service layer (DB tx + business rules)
- `api/src/services/uc-001.service.test.ts` — Service unit tests
- `api/src/routes/uc-001.test.ts` — Route integration tests (supertest)

## Steps

1. Load Meetings sorted by updated_at DESC; left-join Recording for duration_sec.
2. Render one row per Meeting with title (or filename fallback), status badge, language, uploaded_at, duration.
3. For rows in transient states, the client subscribes to SSE per-meeting event stream and applies status patches.

## Cross-cutting

- All Prisma writes that touch Meeting.status MUST go through a single transaction with the relevant child write (BRQ-008 mirror).
- All errors throw `AppError(code, http, message)` — never return ad-hoc objects.
- Each RQ ID referenced by a code comment on the line that satisfies it.
