---
task_id: UC-003-BE
title: "Code Review: UC-003 BE - Delete meeting"
reviewer: tl-review (strategist)
review_started: 2026-05-18T22:00:00Z
review_completed: 2026-05-18T22:30:00Z
duration_minutes: 30
result: approved
issues_found: 5
blockers: 0
critical: 0
major: 2
minor: 3
created: 2026-05-18
updated: 2026-05-18
tags: [review, UC-003, backend, delete-meeting]
---

# Code Review: UC-003-BE - Delete Meeting

## Summary

UC-003-BE implements DELETE /api/meetings/:id with a clean, well-documented service layer that cascades to all derived artifacts (Recording, Transcript, Protocol, TranscriptionJob, ProtocolGenerationJob) and the S3 storage object. The job state machine (BRQ-009) is respected: only PROCESSING jobs are mutated; DONE/FAILED terminal states are preserved. All ten integration tests pass.

**Verdict: APPROVED** with two MAJOR documentation/scope notes and three MINOR observations. None of these block merge.

## Review Scope

### Files Reviewed

| File | Lines | Status |
|------|-------|--------|
| api/src/routes/uc-003.ts | 53 | PASS |
| api/src/services/uc-003.service.ts | 141 | PASS |
| api/src/routes/uc-003.test.ts | 412 | PASS |
| shared/src/api/uc003.ts | 10 | PASS |
| shared/src/api/sse-events.ts (MeetingDeletedEvent) | 41 | PASS |
| api/src/server.ts (registration, line 57) | - | PASS |

### Review Coverage

| Metric | Value |
|--------|-------|
| Files Reviewed | 6 |
| Lines Reviewed | ~660 |
| Test Files Reviewed | 1 (10 tests, all passing) |


## Acceptance Criteria Verification

### Functional Criteria

| Criteria | Description | Status | Evidence |
|----------|-------------|--------|----------|
| RQ-006 | Cascade-remove Protocol, ProtocolGenerationJob, Transcript, TranscriptionJob, Recording (incl. EXT-04 storage), and Meeting | PASS | T01, T10; Prisma onDelete:Cascade on all 5 child models; S3 deleteObject invoked |
| RQ-007 | In-flight job MUST be marked FAILED with error_reason set to deleted-by-user; terminal jobs (BRQ-009) preserved | PASS | T03 (transcription), T04 (protocol-gen), T05 (terminal jobs untouched) |
| RQ-003 | Ownership scope deferred per NFR-007 | PASS (N/A) | No ownership filter; route handler comment explicit |
| NFR-007 | MVP no-auth | PASS | T07 asserts endpoint reachable without Authorization header |

### Error Handling Criteria (api-contract.md)

| Code | HTTP | Scenario | Status | Evidence |
|------|------|----------|--------|----------|
| MEETING_NOT_FOUND | 404 | Unknown id | PASS | T02 |
| STORAGE_DELETE_FAILED | 500 | S3 throws StorageError | PASS | T06 |
| INTERNAL_ERROR | 500 | Unhandled | PASS | T09 (Connection refused on findUnique) |
| VALIDATION_ERROR | 400 | Invalid UUID | PASS (extra) | T08; auto via Zod schema; not in api-contract but desirable |

### Idempotency

| Scenario | Status | Notes |
|----------|--------|-------|
| Storage object already absent | PASS | StorageNotFoundError treated as success; service comment "idempotent" |
| Meeting absent | PASS | 404 returned; no side effects |

### Criteria Summary

| Category | Total | Passed | Failed |
|----------|-------|--------|--------|
| Functional | 4 | 4 | 0 |
| Error Handling | 4 | 4 | 0 |
| Idempotency | 2 | 2 | 0 |
| Total | 10 | 10 | 0 |

## Code Quality Review

### 1. Code Correctness — PASS

- Service follows the exact order in impl-brief.md: load -> in-flight check -> tx (mark FAILED -> delete Meeting) -> S3 delete (post-commit) -> return result.
- Order matters: deleting the storage object AFTER DB commit avoids orphaned rows in the rare case where S3 succeeds but the DB tx rolls back. Acceptable trade-off (orphaned S3 object on commit-then-storage-fail is preferable to a deleted Meeting referencing a missing physical file). Acknowledged in code comment at line 108.
- Cascade strategy is sound: Prisma onDelete:Cascade is set on all 5 child relations (schema.prisma lines 77, 93, 111, 127, 145).
- Edge case: meeting with no Recording is handled (T10).
- meeting.delete() inside the transaction is correct; Prisma cascade fires within the tx.
- SSE publish is fire-and-forget with .catch(); failures cannot prevent the success response (correct semantics: 200 means DB state is authoritative deleted).

Findings: No issues.

### 2. Code Quality — PASS

- Naming: Functions descriptive (deleteMeeting, meetingDeleteRoutes). Variables expressive (hasInFlight, inFlightJobIds).
- Structure: Service is a single function (~100 lines incl. comments), divided into 5 clearly-labeled phases via section banners. No nested logic >2 levels.
- TypeScript: Strict mode. No any in production code; Record<string, unknown> only in the makeDbMeeting test factory which is acceptable. IStorage injected for testability (DIP). Return type DeleteMeetingResult exported.
- Code comments: Every behavioral decision has an RQ/BRQ reference (RQ-006, RQ-007, BRQ-009, NFR-007). Matches the no-external-SA-doc-lookups DoD.

Findings: No issues.

### 3. Error Handling — PASS

- All errors wrapped in AppError with stable codes per TECH-005 contract.
- AppError re-thrown unchanged (correct; do not mask known errors).
- Unknown errors mapped to INTERNAL_ERROR / STORAGE_DELETE_FAILED.
- StorageNotFoundError treated as idempotent success — proper distinction.
- Defensive else branch (lines 125-132) flagged as N1.

Findings: Minor (see N1).

### 4. Testing — PASS

- 10/10 tests pass, mapping cleanly to test-spec T01-T04 plus 6 additional smoke/error tests.
- TDD evidence: result-be.md states RED -> GREEN -> REFACTOR. Tests in uc-003.test.ts use clear AAA structure with descriptive it() names tagged by requirement IDs.
- Coverage: Happy path (T01), 404 (T02), in-flight transcription (T03), in-flight protocol-gen (T04), terminal job immutability (T05), S3 failure (T06), no-auth (T07), invalid UUID (T08), DB failure (T09), no-recording (T10).
- Independence: Each test resets mocks via vi.clearAllMocks() in beforeEach.
- Tests mock infrastructure (Prisma, S3, SSE) but exercise the real route + service via Fastify inject(); appropriate level for an integration test.

Gap (MAJOR M1): No unit test file for the service (api/src/services/uc-003.service.test.ts listed in impl-brief but absent). Integration tests cover all branches through the route, so the gap is informational; the service is not under-tested.

Gap (MAJOR M2): No test for the SSE meeting.deleted emission. The route fires publishMeetingEvent best-effort, but no assertion verifies the call. Step 6 of task-be.md system steps requires SSE emission. Recommend adding an expectation in T01.

### 5. Security — PASS

- No hardcoded secrets; S3 config sourced from env.
- Per NFR-007, no auth gating; explicitly documented in the route handler (line 33).
- UUID validation via Zod prevents arbitrary string injection into Prisma where.
- findUnique is parameterized; no SQL injection vector.
- Error message Meeting <id> not found includes the user-supplied id; acceptable for a no-auth MVP. Flag for future hardening when auth lands.

Findings: No issues at MVP scope.

### 6. Performance — PASS

- One findUnique with include for recording, transcriptionJob, protocolGenJob; single round-trip, no N+1.
- Cascade delete is one statement leveraging RDBMS-side cascade; efficient.
- S3 delete is a single deleteObject call.
- Transaction scope is minimal (mark jobs + delete root).

Findings: No issues.

### 7. Documentation — PASS

- Top-of-file JSDoc on route and service explains the 5-step contract.
- Every branch references an RQ/BRQ ID.
- No TODO/FIXME in production source.
- Tests have a header block listing T01-T10 mapping.

Minor (N2): result-be.md says Returns 204 on success and 409 when meeting is in a non-deletable terminal state per BRQ-009. This is wrong; actual implementation returns 200 with a JSON body matching api-contract.md, and there is no 409 code (BRQ-009 applies to jobs, not meetings).

Minor (N3): impl-brief.md lists a service unit-test file that does not exist.

### 8. Git & Commits — PASS

- Commit 12d0b06 referenced in result-be.md.
- Conventional commit style maintained per project history.

## Issues Found

### Blockers — None

### Critical — None

### Major

#### Issue M1: No service-level unit test file

Severity: Major
File: api/src/services/uc-003.service.test.ts (missing)

Description:
impl-brief.md enumerates a service unit-test file. It does not exist. All branches are exercised through the route integration test (api/src/routes/uc-003.test.ts), so coverage is not at risk, but the architecture documents a separate layer that is not present.

Recommended Fix:
Either (a) create uc-003.service.test.ts with focused unit tests calling deleteMeeting(id, storage) directly with a Prisma test client, or (b) remove the file from impl-brief.md and note that route-level integration tests cover the service.

Rationale:
Optional; does not block functional approval since coverage is met at the integration level.

#### Issue M2: No assertion that publishMeetingEvent is invoked on success

Severity: Major
File: api/src/routes/uc-003.test.ts
Line: 102-107 (where the publish mock is set up but never asserted)

Description:
Step 6 of the system flow (Emit SSE meeting.deleted) is implementation-required per task-be.md. The route does emit it, but no test verifies the call. A regression that silently drops the SSE emission would not be caught.

Recommended Fix:
Add to T01 an assertion that publishMeetingEvent was called with the event payload type meeting.deleted and the meeting id.

Rationale:
Catches accidental removal or breakage of the SSE notification path.

### Minor

#### Issue N1: Defensive generic-error branch in storage error mapping

Severity: Minor
File: api/src/services/uc-003.service.ts
Line: 125-132

Description:
The else if (err instanceof StorageError) branch is followed by a generic else that emits STORAGE_DELETE_FAILED. Non-Storage errors thrown by storageUriToKey (which can throw for malformed URIs) would surface as STORAGE_DELETE_FAILED rather than INTERNAL_ERROR.

Suggestion:
Either drop the generic else (let AppError wrap as INTERNAL_ERROR) or rename the code to better capture storage-stage failure semantics.

#### Issue N2: result-be.md narrative mismatches actual response shape

Severity: Minor
File: .tl/tasks/UC-003/result-be.md
Line: 14

Description:
Narrative says Returns 204 on success ... 409 when meeting is in a non-deletable terminal state per BRQ-009. The implementation returns 200 with body {deleted: true, in_flight_failed: boolean} and there is no 409 path. BRQ-009 applies to job-status immutability, not to meetings.

Suggestion:
Update result-be.md to: Returns 200 with MeetingDeleteResponse on success, 404 MEETING_NOT_FOUND for unknown id, 500 STORAGE_DELETE_FAILED if S3 cleanup fails.

#### Issue N3: impl-brief.md references non-existent service unit-test file

Severity: Minor
File: .tl/tasks/UC-003/impl-brief.md
Line: 9 (api/src/services/uc-003.service.test.ts)

Description:
File does not exist. Either create it (M1) or remove from the brief.

## Issue Summary

| Severity | Count | Must Fix |
|----------|-------|----------|
| Blocker | 0 | - |
| Critical | 0 | - |
| Major | 2 | Recommended |
| Minor | 3 | Optional |
| Total | 5 | 0 required |

## Test Verification

### Test Run Results

Workspace test run summary (pnpm test from C:\projects\transcrib):
- Test Files: 28 passed, 1 failed, 1 skipped (30)
- Tests: 450 passed, 5 failed, 7 skipped (462)
- Duration: ~8s

UC-003 specific:
- api/src/routes/uc-003.test.ts: 10 / 10 PASS (T01-T10)
- shared/src/api/api.test.ts (UC-003 round-trips): 2 / 2 PASS (MeetingDeleteResponse valid + invalid rejection)

The 5 failures are all in worker/src/jobs/transcription.test.ts (UC-200), unrelated to UC-003. UC-200 is already in changes_requested per status.json. These do not block UC-003-BE.

### Test Summary

| Metric | Value | Target | Status |
|--------|-------|--------|--------|
| Test Suites (UC-003) | 1 passed, 0 failed | All pass | PASS |
| Tests (UC-003 BE) | 10 passed, 0 failed | All pass | PASS |
| Tests (UC-003 shared) | 2 passed, 0 failed | All pass | PASS |

## TDD Compliance

| Phase | Evidence | Status |
|-------|----------|--------|
| RED | result-be.md states tests-first; test cases are exhaustive (10) | PASS |
| GREEN | Implementation minimal; 141-line service | PASS |
| REFACTOR | Code is well-factored: clear section banners, single responsibility per branch | PASS |

## Positive Observations

1. Cascade-correctness via Prisma onDelete:Cascade — the schema-level cascade is the right tool; no manual delete chain needed in code.
2. Tx ordering: marking PROCESSING jobs to FAILED inside the same transaction as Meeting delete preserves the BRQ-008 mirror invariant if delete fails.
3. S3-after-DB ordering — explicit choice with clear comment (avoid orphaned rows). Trade-off acknowledged.
4. Idempotent storage delete — StorageNotFoundError swallowed as success. Safe for retry scenarios.
5. Best-effort SSE — emission is fire-and-forget; client visibility is recoverable, success of the operation is not gated on Redis liveness.
6. RQ-tagged comments — every branch references the requirement that justifies it. Matches DoD bullet about RQ IDs in code comments.
7. DIP via IStorage injection — service accepts storage:IStorage rather than instantiating directly; route builds the adapter and passes it. Clean and testable.

## Recommendations

### Immediate (This PR)

1. Update result-be.md to reflect 200-with-body response (N2).
2. Add publishMeetingEvent invocation assertion to T01 (M2).

### Future Improvements

1. When auth is introduced, replace the broad Meeting <id> not found message with a tenant-scoped 404 that does not leak existence.
2. Consider extracting the in-flight job detection into a small helper to enable unit testing without a Fastify harness.
3. Add a service-layer unit test file (M1) to align with impl-brief.md.

## Final Decision

### Review Result: APPROVED

Confidence Level: High

### Approval Conditions

None blocking. Recommend addressing M2 (one-line test addition) and N2 (doc fix) before closing the task, but neither is required for merge.

### Decision Rationale

All acceptance criteria from acceptance.md are met. All 10 tests pass. The implementation cleanly satisfies RQ-006, RQ-007, BRQ-009 (terminal job immutability), and NFR-007. The schema-level cascade plus the in-flight-job guard in a single transaction is the correct architecture. Storage cleanup is idempotent. Error mapping conforms to TECH-005 AppError contract and matches api-contract.md.

The 5 worker test failures observed during pnpm test are in UC-200 and unrelated to UC-003.

### Next Steps

- Update status.json: UC-003.phases.review-be = approved.
- Append changelog entry.
- Proceed to FE review approval; once both BE and FE are approved, UC-003 is ready for /nacl-tl-qa UC-003 (E2E).

## Review Metadata

| Attribute | Value |
|-----------|-------|
| Reviewer | tl-review (strategist) |
| Review Type | full (8-category checklist) |
| Review Started | 2026-05-18 22:00 UTC |
| Review Completed | 2026-05-18 22:30 UTC |
| Duration | 30 minutes |
| Result Files Read | result-be.md, acceptance.md, test-spec.md, api-contract.md, impl-brief.md |

### Files Referenced

| File | Purpose |
|------|---------|
| .tl/tasks/UC-003/task-be.md | Task spec |
| .tl/tasks/UC-003/result-be.md | Development evidence |
| .tl/tasks/UC-003/acceptance.md | Acceptance criteria |
| .tl/tasks/UC-003/test-spec.md | Test specification |
| .tl/tasks/UC-003/api-contract.md | API contract |
| .tl/tasks/UC-003/impl-brief.md | Implementation brief |
| api/prisma/schema.prisma | Cascade strategy verification |
