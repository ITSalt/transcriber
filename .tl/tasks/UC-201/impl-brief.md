# UC-201 — Backend Implementation Brief

**UC:** View and download transcript

## File plan

- `api/src/routes/uc-201.ts` — Fastify route handlers
- `api/src/services/uc-201.service.ts` — Service layer (DB tx + business rules)
- `api/src/services/uc-201.service.test.ts` — Service unit tests
- `api/src/routes/uc-201.test.ts` — Route integration tests (supertest)

## Steps

1. Load Transcript by meeting_id; gate on Meeting.status >= TRANSCRIPT_READY (return 409 otherwise).
2. For JSON endpoint: return Transcript shape with full_text + speaker_map.
3. For download endpoint: stream full_text as text/plain with Content-Disposition attachment filename '<title or filename>-transcript.txt' (RQ-020).

## Cross-cutting

- All Prisma writes that touch Meeting.status MUST go through a single transaction with the relevant child write (BRQ-008 mirror).
- All errors throw `AppError(code, http, message)` — never return ad-hoc objects.
- Each RQ ID referenced by a code comment on the line that satisfies it.
