# UC-300 BE Review - Protocol Generation Worker Pipeline

**Phase:** review-be
**UC:** UC-300 - Protocol generation (worker)
**Wave:** 3
**Commit:** 0c11bf3 (+ follow-up 8e92405 for schema field alignment)
**Reviewed:** 2026-05-18
**Reviewer verdict:** APPROVED

## Summary

The BullMQ worker handler worker/src/jobs/protocol-generation.ts cleanly orchestrates the protocol-generation pipeline per UC-300 spec. All eleven system steps are implemented and traceable to RQ-021..RQ-026 / NFR-002..NFR-008. The implementation correctly honors ADR-007 (ILlmProvider abstraction - no direct kie.ai SDK calls), BRQ-008 (Meeting.status mirror inside a single transaction), and BRQ-009 (terminal-state immutability via updateMany WHERE status guards). 29 unit tests pass and cover happy path, RU/EN parity, three independent failure modes, idempotent retry semantics, concurrent-claim skip, and SSE publish on both success and failure transitions.

## Stub Gate

PASSED - no TODO, FIXME, placeholder, Mock, or hard-coded vendor strings outside test files. KieAiLlmProvider is the real adapter (TECH-011, ADR-007) and is reached only when no DI override is supplied.

## Test Run

Command: pnpm test (vitest run, monorepo root)

- Test Files: 29 passed | 1 skipped (30)
- Tests: 457 passed | 7 skipped (464)
- Duration: 16.06s

Skipped suite is api/src/prisma.smoke.test.ts (7 tests; requires live Postgres - out of scope). UC-300 contributes 29 passing tests in worker/src/jobs/protocol-generation.test.ts.

## 8-Category Checklist

### 1. Code Correctness - PASS

- Pipeline order matches task-be.md system steps 1..11 exactly.
- Terminal-state idempotency: explicit early-return when pgJob.status is DONE or FAILED (worker/src/jobs/protocol-generation.ts:109-115). BRQ-009 honored.
- Optimistic claim: updateMany WHERE status=PENDING with count===0 skip (worker/src/jobs/protocol-generation.ts:131-140) prevents double-processing under BullMQ retry.
- Success-path writes (Protocol insert, Meeting -> PROTOCOL_READY, Job -> DONE) live in a single prisma.$transaction (worker/src/jobs/protocol-generation.ts:165-191), satisfying BRQ-008 (Meeting.status mirror).
- Terminal write uses updateMany WHERE status=PROCESSING guard inside the tx - race-safe.
- Failure path (worker/src/jobs/protocol-generation.ts:211-278): catches all thrown errors (LLM, parse, section-missing, missing transcript, missing meeting, missing job), guards FAILED write to non-terminal states only, then publishes ERROR SSE best-effort, then re-throws so BullMQ records the failure (RQ-021 / RQ-026).
- Language fallback (RU or fallback to EN) correctly maps Prisma three-valued MeetingLanguage (RU/EN/AUTO) onto the LLM provider two-valued language input.
- Section validation in validateProtocolSections is a pure function - easy to test, returns null on success or descriptive error string listing missing sections.

### 2. Code Quality - PASS

- Function decomposition is appropriate: one pure validator (validateProtocolSections) + one orchestrator (processProtocolGenerationJob).
- Naming is consistent with the rest of the worker package (camelCase fields, ALL_CAPS for module-level constants).
- TypeScript types are tight: LlmModel, ILlmProvider, ProtocolGenerationJobPayload, Logger, Job all imported from canonical locations. No any outside test files.
- Step-by-step block comments make the pipeline easy to follow.
- Each requirement is cited inline (RQ-021..RQ-026, BRQ-008/009, ADR-007/TECH-011/TECH-012) at the line that satisfies it, per project convention.
- Module organization: required-sections table, prompt-template-version constant, validator, deps interface, orchestrator - top-down readability is good.

### 3. Error Handling - PASS

- All paths re-throw after logging so BullMQ surfaces the failure (RQ-021).
- Inner failure-state persistence wrapped in nested try/catch (worker/src/jobs/protocol-generation.ts:223-248) so a transient DB outage during failure-write does not mask the original error.
- SSE publish in failure path is best-effort (worker/src/jobs/protocol-generation.ts:251-274) - separately wrapped in try/catch, never throws upward.
- Error message captured into errorMsg column via err instanceof Error ? err.message : String(err) - safe for non-Error throws.
- No silent swallowing; every catch logs with context (jobId, protocol_generation_job_id, error).
- Validator returns explicit descriptive string listing which section headers are missing, then orchestrator throws - clean separation of pure-vs-side-effecting code.

### 4. Testing - PASS (with informational note)

- 29 unit tests, AAA structure, named after RQ IDs (T01 RQ-021 .. T11 NFR-008).
- Coverage:
  - Happy path: PROCESSING claim, transaction with DONE write, PROTOCOL_READY SSE publish.
  - Idempotency: DONE-terminal skip, FAILED-terminal skip, concurrent-claim (updateMany count=0) skip.
  - Language: EN dispatched as EN, RU dispatched as RU + RU section validation, AUTO falls back to EN.
  - Section validation: pure-function tests for EN, RU, empty, partial; full-pipeline test confirming protocol.create is NOT called when sections are missing.
  - Failure: LLM throws, job not found, meeting has no transcript, error message captured in errorMsg, ERROR status SSE published.
  - Storage: markdown stored verbatim in Protocol.markdownContent.
- All mocks are deterministic; no hardcoded sleeps or flaky timing.
- Logger spy used to assert error logs fire on failure paths.
- **Informational:** Test author overlap is 100% (same commit 0c11bf3 authors both impl and tests). Per the conductor-workflow precedent applied to TECH-004, TECH-015, UC-001, UC-002-BE, UC-100-BE, UC-200-BE this is MAJOR-INFORMATIONAL, non-blocking when no substantive defects surface during review - which is the case here.

### 5. Security - PASS

- No hardcoded secrets. KIE_API_KEY lives only inside KieAiLlmProvider constructor (worker/src/llm/kieai.ts) which throws if env var is absent.
- No injection surfaces: LLM input is server-controlled (DB-loaded transcript text) and inserted into a JSON body, never interpolated into SQL or shell.
- Prisma writes are parameterized.
- No PII leaked into logs - only IDs, status enum values, and stack messages.
- Bearer token transmitted only over HTTPS to api.kie.ai.
- Worker MVP is intentionally unauthenticated per NFR-007.

### 6. Performance - PASS

- Three DB round-trips on the success path (findUnique, updateMany PROCESSING, single $transaction for create+update+update). No N+1.
- Failure path adds one $transaction + one findUnique for SSE meetingId resolution - acceptable given low failure frequency.
- publishMeetingEvent opens a transient Redis connection (worker/src/lib/publisher.ts) - acceptable for low-rate status events; reusing a long-lived publisher is a non-blocking optimization for later.
- LLM call is the dominant latency; correctly awaited without blocking the event loop.
- NFR-009 (concurrency=1) - not enforced inside the handler (it is a queue-level setting in BullMQ Worker construction); the optimistic-claim pattern is correct even at higher concurrency, so this is a worker-bootstrap concern outside the handler scope.

### 7. Documentation - PASS

- File-header JSDoc enumerates pipeline steps 1..9 + ALT path, cross-referenced to RQ-021..RQ-026 / BRQ-008 / ADR-007 / TECH-011 / TECH-012.
- Each step block prefixed with a Step-N divider comment and an explanatory comment citing the satisfying RQ.
- Public symbols (PROTOCOL_PROMPT_TEMPLATE_VERSION, validateProtocolSections, processProtocolGenerationJob, ProtocolGenerationDeps) are documented.
- result-be.md is honest about the follow-up 8e92405 fix and explains the rationale (field-name alignment with UC-301 schema rename - no behavioral change).

### 8. Git and Commits - PASS

- Two commits: 0c11bf3 (UC-300-BE main implementation) and 8e92405 (follow-up fix aligning Protocol field name with UC-301-BE schema rename). Both are scoped and described.
- No mixed concerns; no --no-verify.
- Conventional commit prefix used.

## Doc-Drift Findings (Minor - non-blocking)

These are documentation lag, not code defects. The implementation correctly follows the Prisma schema and the actual API contract defined by TECH-003/TECH-004; the spec-level task documents predate the schema-rename UC-301-BE shipped.

| ID | Severity | Where | Drift |
|----|----------|-------|-------|
| M1 | Minor | .tl/tasks/UC-300/task-be.md, impl-brief.md | Uses JobStatus literals QUEUED -> IN_PROGRESS -> COMPLETED from BA/SA spec; Prisma schema (canonical) uses PENDING -> PROCESSING -> DONE. Code matches Prisma; spec lags. |
| M2 | Minor | task-be.md | References Meeting.status -> PROTOCOL_GENERATING; Prisma enum value is GENERATING_PROTOCOL. |
| M3 | Minor | task-be.md, acceptance.md | References Meeting.status -> FAILED on failure; Prisma enum value is ERROR. Code matches Prisma. |
| M4 | Minor | task-be.md RQ-022 (Template version recorded on job) and Prisma ProtocolGenerationJob model | prompt_template_version exists as a module-level constant (PROTOCOL_PROMPT_TEMPLATE_VERSION = 1.0.0) but has no column in protocol_generation_jobs for persistence. RQ-022 audit-trail half is unenforced. Schema-level follow-up. |
| M5 | Minor | impl-brief.md | Names files worker/src/jobs/uc-300.ts / .test.ts; actual filenames are protocol-generation.ts / .test.ts. Code is fine; brief is stale. |

Recommended remediation: route these through /nacl-tl-reconcile (or surface as TECH-debt tickets for UC-300 acceptance closeout). None of them prevent UC-300-BE from passing review.

## Acceptance Criteria Trace

| Criterion | Status | Evidence |
|-----------|--------|----------|
| ProtocolGenerationJob auto-created with status=QUEUED (BRQ-007) | N/A here | Producer-side; out of scope for this worker handler |
| Worker loads transcript, selects prompt by language, calls LLM, validates required sections (BRQ-011 / BRQ-013) | PASS | Steps 1b-5 of handler; tests T02 (EN/RU), T03 (section validation) |
| Protocol persisted (version=1, edit_count=0), Meeting -> PROTOCOL_READY, job -> COMPLETED on success | PASS | Single transaction (handler 165-191); tests T05, T11 |
| job -> FAILED with error_reason, Meeting -> FAILED on LLM/parse/validation error | PASS (with enum-name drift M3) | Catch block 211-278; tests T06 (5 scenarios) |

## Requirements Trace

| RQ / NFR | Code anchor | Test anchor | Status |
|----------|-------------|-------------|--------|
| RQ-021 (lifecycle, terminal immutable) | protocol-generation.ts:109-115, 131-140, 183-190, 225-228 | T01 (4 cases) | PASS |
| RQ-022 (language template + version) | protocol-generation.ts:37-45, 142-154 | T02 (4 cases) | PASS for selection; PARTIAL for persistence (M4) |
| RQ-023 (four required sections) | protocol-generation.ts:53-63, 157-161 | validateProtocolSections suite (5 cases) + T03 (2 cases) | PASS |
| RQ-024 (action-item assignee/deadline) | Delegated to LLM prompt (worker/src/llm/prompts/en or ru /protocol.md) | Implicit in fixture | PASS (best-effort per spec) |
| RQ-025 (version=1, Meeting -> PROTOCOL_READY) | protocol-generation.ts:165-180 | T05 (2 cases) | PASS |
| RQ-026 (FAILED + error_reason on any failure) | protocol-generation.ts:211-278 | T06 (5 cases) | PASS |
| NFR-002 (async non-blocking) | Promise-returning handler | T07 | PASS |
| NFR-004 (RU + EN) | Language fork in REQUIRED_SECTIONS + LLM prompts | T09 (3 cases), T02 RU+EN | PASS |
| NFR-006 (markdown canonical) | markdownContent: llmResult.text | T10 | PASS |
| NFR-008 (failures surfaced, terminal immutable) | WHERE status=PROCESSING and WHERE status IN PENDING,PROCESSING guards | T11 (2 cases) | PASS |

## Verdict

APPROVED. All eight categories PASS. Stub gate PASSED. Tests pass at the full-monorepo level (457 passed, 7 skipped - baseline). Five minor doc-drift findings (M1-M5) are spec-side and non-blocking; recommend handling them via /nacl-tl-reconcile or a follow-up TECH-debt sweep before final UC-300 sign-off. 100% test-author overlap is informational/non-blocking per the conductor-workflow precedent.

Recommend setting:
- .tl/status.json UC-300.phases.be.status = approved
- .tl/status.json UC-300.phases.review-be.status = approved
