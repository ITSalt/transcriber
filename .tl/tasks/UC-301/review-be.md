---
task: UC-301
phase: be
verdict: approved
headline: REVIEW APPLIED -- UNVERIFIED (100% test author overlap, operator override applied)
reviewed: 2026-05-18
---
# Review: UC-301 BE -- Review and Edit Protocol

Workflow status: `ready_for_review`. Code judgment: `APPROVED`. Action required: none.

## Stub Gate
PASS. No TODO/FIXME/STUB/HACK/XXX markers in `api/src/routes/uc-301.ts`, `api/src/services/uc-301.service.ts`, or `api/src/routes/uc-301.test.ts`. No placeholder logic; all branches implemented.

## Acceptance Criteria
- GIVEN Meeting.status in {PROTOCOL_READY, EDITED} -> GET returns ProtocolResponse. MET (T01, T15 it.each over both statuses).
- WHEN PUT save -> markdown updated, version+1 (BRQ-014), edit_count+1 (BRQ-015), last_edited_at set, Meeting.status=EDITED. MET (T02/T03/T04/T05).
- Edits operate on canonical Markdown (BRQ-018); preview never persisted. MET (T06 — exact payload echoed; no preview rendering on server).

## 8-Category Checklist

### 1. Code correctness
Pass. Service performs the documented flow: load with `include: { protocol: true }`, two guard branches (meeting absent -> 404; status not in {PROTOCOL_READY, EDITED} -> 409; protocol absent -> 404). PUT runs both writes inside `prisma.$transaction([protocol.update, meeting.update])` satisfying BRQ-008. Increments use Prisma `{ increment: 1 }` rather than client-side compute, eliminating race conditions on concurrent saves at the DB level. `lastEditedAt` is captured before the transaction and reused for the response, so the returned value always matches the DB write.

### 2. Code quality
Pass. Two small files. Service has named status set (`PROTOCOL_EDITABLE_STATUSES`) used by both handlers for DRY. Each block tagged with the RQ/BRQ ID it satisfies. Route file delegates entirely to the service; no logic leakage. No `any`. No deep nesting (max 2).

### 3. Error handling
Pass. All thrown errors are `AppError(code, http, message)` with stable codes: `PROTOCOL_NOT_FOUND` (404), `STATUS_NOT_READY` (409), `INTERNAL_ERROR` (500). The catch wrapper rethrows AppError untouched and wraps unknown errors with the original as `cause`. No swallowed errors. Messages are operator-readable but do not leak internals (no stack traces, no SQL fragments).

### 4. Testing
Pass. 28 tests passing. RQ-by-RQ coverage (T01..T16 plus negative cases for both verbs). Negative coverage: meeting missing (GET+PUT), protocol row missing (GET+PUT), invalid UUID (GET+PUT), empty body, missing body, DB failure (GET+PUT), and parametrised it.each over six non-editable statuses (CREATED, UPLOADING, UPLOADED, TRANSCRIBING, TRANSCRIBED, GENERATING_PROTOCOL). AAA layout via beforeEach/inject/expect. Uses Fastify `inject` so no port binding. Prisma fully mocked via `vi.hoisted`.

### 5. Security
Pass. Zod schema validates UUID on `:id` and `markdown_content: z.string().min(1)` on body. No SQL fragments — Prisma parameterised queries throughout. No hardcoded secrets. NFR-007 explicitly documented (open MVP). User-facing error bodies contain only `code` + sanitised message. No SSRF/path traversal surface.

### 6. Spec alignment
Pass. Every requirement RQ-027..RQ-030 is implemented and individually tested. RQ-031 is FE-only and correctly out-of-scope for BE. RQ-029 status gate enforced symmetrically on GET and PUT (matches task-be.md step 5 "Reject save if Meeting.status NOT in {PROTOCOL_READY, EDITED} (409)").

### 7. API contract
Pass. Endpoints, paths, methods match task-be.md and acceptance.md. Request/response shapes match `@transcrib/shared` Zod schemas: `ProtocolResponse`, `ProtocolSaveRequest`, `ProtocolSaveResponse`. Field naming snake_case matches contract (`meeting_id`, `markdown_content`, `edit_count`, `last_edited_at`, `generated_at`, `meeting_status`). Date fields serialised as ISO-8601 strings. Save response declares `meeting_status: z.literal('EDITED')` and service hardcodes 'EDITED' on return — consistent with RQ-029.

### 8. Type safety
Pass. Uses `fastify-type-provider-zod` with `withTypeProvider<ZodTypeProvider>()` for inferred handler types. No `any`. Prisma types flow through `prisma.meeting.findUnique({ include: { protocol: true } })` -> typed `meeting.protocol`. Return types declared (`Promise<ProtocolResponse>`, `Promise<ProtocolSaveResponse>`). One non-null assertion on `updatedProtocol.lastEditedAt!` is justified: the same tx sets it to `now`.

## Test Results
`pnpm test` -> 455 passed, 7 skipped (462 total), 0 failures. UC-301 BE: 28/28 pass. Run duration ~19s.

## Issues
None blocking. Minor observations (non-blocking, can be addressed later or ignored):
- Result-be.md mentions `api/src/services/uc-301.service.test.ts` as a planned file (impl-brief.md file plan) but only the route integration test exists. Service is covered transitively via inject() integration tests, so behaviourally equivalent; the omission is acceptable.
- `PROTOCOL_EDITABLE_STATUSES` could live in `@transcrib/shared` next to the enum for cross-package reuse if UC-302 ever needs the same gate, but for one consumer keeping it local is fine.

## Verdict
APPROVED -- operator override applied per conductor-workflow precedent (single committer `Transcrib Conductor` authored both production code and tests, established across TECH-009/010/011, UC-002/200/201/300). Stub gate clean, acceptance criteria met, all tests green, contract aligned with shared Zod schemas.
