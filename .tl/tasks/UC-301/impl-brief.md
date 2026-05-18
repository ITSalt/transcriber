# UC-301 — Backend Implementation Brief

**UC:** Review and edit protocol

## File plan

- `api/src/routes/uc-301.ts` — Fastify route handlers
- `api/src/services/uc-301.service.ts` — Service layer (DB tx + business rules)
- `api/src/services/uc-301.service.test.ts` — Service unit tests
- `api/src/routes/uc-301.test.ts` — Route integration tests (supertest)

## Steps

1. GET: load Protocol by meeting_id; gate on Meeting.status in {PROTOCOL_READY, EDITED} (RQ-029).
2. PUT (save): in a transaction -> UPDATE Protocol SET markdown_content=:m, version=version+1, edit_count=edit_count+1, last_edited_at=now WHERE meeting_id=:id (RQ-027/028).
3. Transition Meeting.status to EDITED if not already (RQ-029).
4. Return updated metadata in response.
5. Reject save if Meeting.status NOT in {PROTOCOL_READY, EDITED} (409).

## Cross-cutting

- All Prisma writes that touch Meeting.status MUST go through a single transaction with the relevant child write (BRQ-008 mirror).
- All errors throw `AppError(code, http, message)` — never return ad-hoc objects.
- Each RQ ID referenced by a code comment on the line that satisfies it.
