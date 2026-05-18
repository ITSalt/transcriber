# UC-002 — Backend Implementation Brief

**UC:** View meeting detail

## File plan

- `api/src/routes/uc-002.ts` — Fastify route handlers
- `api/src/services/uc-002.service.ts` — Service layer (DB tx + business rules)
- `api/src/services/uc-002.service.test.ts` — Service unit tests
- `api/src/routes/uc-002.test.ts` — Route integration tests (supertest)

## Steps

1. Load Meeting by id with eager Recording, latest TranscriptionJob, latest ProtocolGenerationJob, and existence flags for Transcript/Protocol.
2. Compose response surfacing error_reason from the latest job when Meeting.status=FAILED.
3. Stream status patches via SSE per TECH-012.

## Cross-cutting

- All Prisma writes that touch Meeting.status MUST go through a single transaction with the relevant child write (BRQ-008 mirror).
- All errors throw `AppError(code, http, message)` — never return ad-hoc objects.
- Each RQ ID referenced by a code comment on the line that satisfies it.
