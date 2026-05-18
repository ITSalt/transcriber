# UC-100 — Backend Implementation Brief

**UC:** Upload meeting video

## File plan

- `api/src/routes/uc-100.ts` — Fastify route handlers
- `api/src/services/uc-100.service.ts` — Service layer (DB tx + business rules)
- `api/src/services/uc-100.service.test.ts` — Service unit tests
- `api/src/routes/uc-100.test.ts` — Route integration tests (supertest)

## Steps

1. On TUS pre-create: validate size <= 500 MB (RQ-008); validate mime in {video/mp4, video/x-matroska, video/quicktime} (RQ-009). Reject pre-bytes with 4xx + error code.
2. Accept chunked PATCH bytes; stream directly to S3 (TECH-007/008).
3. On TUS upload-finish: probeContainer via ffprobe (RQ-010). On failure -> delete partial object + return 422.
4. In a single DB transaction: insert Meeting(status=UPLOADING, language=hint|null, title=hint|filename-no-ext per RQ-013), insert Recording(filename, size_bytes, mime_type, storage_path), enqueue TranscriptionJob(status=QUEUED, recording_id, meeting_id), transition Meeting.status -> TRANSCRIBING (RQ-011).
5. Return {meeting_id} so client can redirect to UC-002.

## Cross-cutting

- All Prisma writes that touch Meeting.status MUST go through a single transaction with the relevant child write (BRQ-008 mirror).
- All errors throw `AppError(code, http, message)` — never return ad-hoc objects.
- Each RQ ID referenced by a code comment on the line that satisfies it.
