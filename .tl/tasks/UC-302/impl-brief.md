# UC-302 — Backend Implementation Brief

**UC:** Export protocol to PDF

## File plan

- `api/src/routes/uc-302.ts` — Fastify route handlers
- `api/src/services/uc-302.service.ts` — Service layer (DB tx + business rules)
- `api/src/services/uc-302.service.test.ts` — Service unit tests
- `api/src/routes/uc-302.test.ts` — Route integration tests (supertest)

## Steps

1. Gate on Meeting.status in {PROTOCOL_READY, EDITED} (RQ-032 - return 409 otherwise).
2. Load Protocol.markdown_content (canonical per BRQ-018).
3. Invoke renderPdf(markdown, {title, version}) from TECH-014.
4. Stream Buffer as application/pdf with Content-Disposition attachment filename '<title>-protocol-v<version>.pdf'.
5. Do NOT persist the rendered buffer (RQ-032).
6. ALT: on render failure -> return 500 with stable error code 'PDF_RENDER_FAILED'; no state change (RQ-033).

## Cross-cutting

- All Prisma writes that touch Meeting.status MUST go through a single transaction with the relevant child write (BRQ-008 mirror).
- All errors throw `AppError(code, http, message)` — never return ad-hoc objects.
- Each RQ ID referenced by a code comment on the line that satisfies it.
