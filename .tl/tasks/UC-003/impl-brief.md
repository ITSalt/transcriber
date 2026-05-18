# UC-003 — Backend Implementation Brief

**UC:** Delete meeting

## File plan

- `api/src/routes/uc-003.ts` — Fastify route handlers
- `api/src/services/uc-003.service.ts` — Service layer (DB tx + business rules)
- `api/src/services/uc-003.service.test.ts` — Service unit tests
- `api/src/routes/uc-003.test.ts` — Route integration tests (supertest)

## Steps

1. Begin transaction.
2. Mark any IN_PROGRESS TranscriptionJob/ProtocolGenerationJob -> FAILED with error_reason='deleted by user' (RQ-007).
3. Delete Protocol, ProtocolGenerationJob, Transcript, TranscriptionJob, Recording rows in dependency order (relies on Prisma cascade from TECH-003).
4. Remove the storage object in EXT-04 via IStorage.deleteObject(Recording.storage_path).
5. Delete Meeting; commit.
6. Emit SSE 'meeting.deleted' so any open clients close the detail view.

## Cross-cutting

- All Prisma writes that touch Meeting.status MUST go through a single transaction with the relevant child write (BRQ-008 mirror).
- All errors throw `AppError(code, http, message)` — never return ad-hoc objects.
- Each RQ ID referenced by a code comment on the line that satisfies it.
