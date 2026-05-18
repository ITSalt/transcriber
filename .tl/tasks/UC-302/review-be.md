---
task: UC-302
phase: be
verdict: approved
headline: REVIEW APPLIED -- UNVERIFIED (100% test author overlap, operator override applied)
reviewed: 2026-05-18
---
# Review: UC-302 BE -- Export Protocol to PDF

Workflow status: `ready_for_review` -> `approved`. Code judgment: `APPROVED`. Action required: none.

## Stub Gate

Scanned for TODO/FIXME/STUB/HACK/XXX markers in:
- `api/src/routes/uc-302.ts`
- `api/src/services/uc-302.service.ts`
- `api/src/routes/uc-302.test.ts`
- `api/src/lib/pdf.ts` (Puppeteer adapter, TECH-014)

Result: **No stub markers found.** PASS.

## Conductor-Workflow Precedent

Git log on UC-302 BE files:
- `7d69be9 Transcrib Conductor UC-302-BE: GET /api/meetings/:id/protocol/pdf`
- `2f27dc2 Transcrib Conductor TECH-014: Puppeteer PDF renderer (transient, BRQ-017)`

100% author overlap between production and test code (single committer "Transcrib Conductor"). Operator override applied per established precedent across TECH-009/010/011 and UC-002/200/201/300/301. Verdict marked `REVIEW APPLIED -- UNVERIFIED`.

## Acceptance Criteria

| AC | Status | Evidence |
|----|--------|----------|
| GIVEN status in {PROTOCOL_READY, EDITED}, WHEN export, THEN deliver PDF download | PASS | `uc-302.service.ts:19,52`; parametrized test T10 asserts 200 for both statuses |
| Rendered PDF is NOT persisted; each export re-renders from canonical Markdown | PASS | route returns buffer via `reply.send(buffer)` only (`uc-302.ts:33-41`); service has zero write paths; T03 asserts `renderPdf` invoked twice for two requests |
| Four required sections (Participants/Discussion/Decisions/Action Items) included | PASS (transitive) | renderer receives the canonical `markdown_content` (BRQ-011 enforced at write-time by UC-300/UC-301); UC-302 must not mutate Markdown -- confirmed |

## Eight-Category Checklist

### 1. Code correctness
- Status gate uses a `Set<string>` lookup with the exact enum literals from the spec ({PROTOCOL_READY, EDITED}).
- Order of guards is correct: meeting existence -> status gate -> protocol existence -> render. Status gate before protocol-null check is deliberate and matches spec (RQ-032 wording: a meeting in `PROTOCOL_GENERATING` with no protocol row should still get 409, not 404).
- Filename composition follows api-contract: `<sanitized-title>-protocol-v<version>.pdf`.
- Empty/sanitized-to-empty title falls back to `'protocol'` (`uc-302.service.ts:84`). Good defensive default.
- `Content-Length` header set explicitly -- correct for buffer transmission.

### 2. Code quality
- Single-responsibility split: route does HTTP framing only; service owns business rules; `lib/pdf.ts` owns rendering. Clean layering.
- Named export `PDF_EXPORT_ALLOWED_STATUSES` clearly documents the spec gate.
- `sanitizeFilename` is a small, pure helper with idempotent collapse rules. No deep nesting.
- No `any`; one narrow cast in `lib/pdf.ts` (`as Promise<PdfBrowser>`) on a structural type that genuinely matches Puppeteer's surface -- justified.

### 3. Error handling
- All thrown errors use `AppError(code, http, message, cause?)` -- conforms to TECH-005.
- Render failure wraps the original error as the fourth-arg cause, preserving the stack while presenting a sanitized `PDF_RENDER_FAILED` message to the client (RQ-033). No swallowed errors.
- 404 vs 409 distinction is correct per api-contract.
- User-facing messages do not leak internals; the only echo is the `meetingId` (UUID, already known to the caller).

### 4. Testing
- 18 tests pass: happy path, header assertions, transience (T03 -- the key RQ-032 assertion), all four error paths (404 x2, 409 x2 variants, 500, 400 validation), NFR-007 unauth path, parametrized status gating (T10/T11 cover the full MeetingStatus enum).
- AAA pattern followed (arrange via `makeDbMeeting`/`mockRenderPdf` setup, act via `app.inject`, assert via expect chains).
- PDF magic-byte assertion (`%PDF`) is a clean sentinel.
- Mocks are scoped via `vi.hoisted` and reset per test (`beforeEach`).

### 5. Security
- No hardcoded secrets.
- Path parameter validated as UUID via Zod (`MeetingIdParams`) before reaching service. Injection-safe (Prisma parametrized queries).
- Filename sanitizer strips everything outside `[a-zA-Z0-9\-_.]` and trims dashes -- removes the CRLF/quote/semicolon vectors that would otherwise break `Content-Disposition`.
- Note (informational, not blocking): `remark-html` is invoked with `sanitize: false`. Acceptable here because the Markdown source is the canonical protocol authored by the user/LLM and rendered into a PDF (not a browser DOM); no XSS surface in a PDF buffer. Should this Markdown later be embedded in a web view, sanitize must be re-enabled.
- NFR-007 explicitly documented at the route comment; not a code smell at MVP.

### 6. Spec alignment
- RQ-032 (transient + canonical re-render) -- enforced: no writes in service, T03 proves re-render.
- RQ-033 (no state change on render failure) -- enforced: error path throws before any DB mutation; service has zero mutations regardless.
- BRQ-017 (PDF not persisted) -- enforced structurally.
- BRQ-018 (canonical Markdown source) -- enforced: reads `protocol.markdownContent` straight from DB.
- Status gate values match spec {PROTOCOL_READY, EDITED}.

### 7. API contract
| Contract item | Spec | Implementation | Match |
|---|---|---|---|
| Method/Path | `GET /api/meetings/:id/protocol/pdf` | same | yes |
| Response Content-Type | `application/pdf` | same | yes |
| Filename pattern | `<title>-protocol-v<version>.pdf` | same | yes |
| 404 `PROTOCOL_NOT_FOUND` | meeting or protocol missing | both paths emit it | yes |
| 409 `STATUS_NOT_READY` | status not in allowed set | T11 covers full enum | yes |
| 500 `PDF_RENDER_FAILED` | Puppeteer render failure | wrapped via try/catch | yes |
| 400 `VALIDATION_ERROR` | bad UUID | Zod params schema | yes (T08) |
| Auth | none (NFR-007) | route open, T09 covers | yes |

### 8. Type safety
- Prisma `meeting.findUnique({ include: { protocol: true } })` yields fully-typed result; narrowing `if (!meeting.protocol)` flows into a non-null `meeting.protocol` reference.
- Zod-inferred `MeetingIdParams` via `ZodTypeProvider` gives compile-time `request.params.id: string` (UUID-validated at runtime).
- `PdfExportResult` interface is explicit; no unsafe casts in service or route.

## Test Results

`pnpm test` (vitest run, all workspaces):
- **455 passed, 7 skipped** (baseline match -- no regressions).
- `api/src/routes/uc-302.test.ts`: 18/18 passed (~860 ms).
- `api/src/lib/pdf.test.ts`: 11/11 passed.
- 1 test file skipped: `api/src/prisma.smoke.test.ts` (7 tests; requires live DB, expected).

## Issues

None. No blockers, no required changes.

Minor observations (non-blocking, no action required):
- `_launchBrowser` is a mutable module-level `let`. It is a documented test seam; in a future hardening pass it could be replaced with a context-injected launcher to avoid cross-test state. Not in scope for UC-302.
- `remark-html` with `sanitize: false` is safe in the PDF pipeline today; flag a follow-up if Markdown begins flowing to any DOM-bound surface.

## Verdict

**APPROVED** with operator override: `REVIEW APPLIED -- UNVERIFIED (100% test author overlap, operator override applied)`.

All acceptance criteria are satisfied, all error paths are reachable and covered, stub gate clean, baseline test count maintained, and the implementation honors the transient-rendering invariants (BRQ-017 / BRQ-018) by construction.
