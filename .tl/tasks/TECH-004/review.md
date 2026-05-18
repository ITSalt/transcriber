---
task: TECH-004
type: tech
mode: tech
reviewer: nacl-tl-review
reviewed: 2026-05-18
re_reviewed: 2026-05-18
commit: a3e2813 (initial) + follow-up (M-1 fix: 11 SSE tests added)
verdict: approved
headline: REVIEW APPLIED -- UNVERIFIED (100% author overlap, operator override applied)
---

# Review: TECH-004 -- Shared Zod DTOs + Per-UC API Contracts (Re-Review)

Workflow status: REVIEW APPLIED -- UNVERIFIED (100% author overlap). Code judgment: APPROVED (operator override per prior review note). Action required: none.

## Re-Review Context

Prior review (verdict CHANGES REQUESTED) flagged one Major issue:

- M-1 -- Missing SSE test coverage. shared/src/api/sse-events.ts exports MeetingDeletedEvent, PingEvent, the SseEvent discriminated union, and meetingChannel helper -- none had dedicated unit tests.

The fix has been applied: 11 new tests were added to shared/src/api/api.test.ts. This re-review re-evaluates the full checklist and confirms M-1 resolution.

## M-1 Verification

Inspected shared/src/api/api.test.ts lines 316-383. Confirmed the following 11 new tests are present and correctly authored:

| Surface | Test | Lines | Status |
|---|---|---|---|
| MeetingDeletedEvent | round-trips | 321-324 | PASS |
| MeetingDeletedEvent | rejects non-uuid meeting_id | 326-330 | PASS |
| MeetingDeletedEvent | rejects wrong type literal | 332-336 | PASS |
| PingEvent | round-trips | 340-342 | PASS |
| PingEvent | rejects non-ping type | 344-346 | PASS |
| SseEvent | discriminates meeting.status | 352-356 | PASS |
| SseEvent | discriminates ping | 358-361 | PASS |
| SseEvent | discriminates meeting.deleted | 363-367 | PASS |
| SseEvent | rejects unknown type | 369-371 | PASS |
| meetingChannel | returns meeting:ID format | 375-377 | PASS |
| meetingChannel | returns meeting:UUID format | 379-382 | PASS |

Import line 4 correctly updated to add MeetingDeletedEvent, PingEvent, SseEvent, meetingChannel from sse-events.js.

All three originally-flagged recommended cases from the prior review are covered:
- (a) MeetingDeletedEvent.parse round-trip plus bad-type negative -- COVERED (3 tests, includes additional non-uuid coverage).
- (b) SseEvent.parse correctly discriminates meeting.status / ping / meeting.deleted -- COVERED (3 discriminate tests + 1 negative).
- (c) meetingChannel(abc-123) equals meeting:abc-123 -- COVERED (literal assertion at line 376).

Quality observations:
- AAA pattern, independent tests, behavior-focused descriptions consistent with the rest of the suite.
- Negative-path coverage included (non-uuid, wrong-type, unknown-discriminator) -- defence in depth.
- PingEvent heartbeat: zero-payload contract verified.
- SseEvent discriminatedUnion correctness verified for all three arms.

M-1 verdict: RESOLVED.

## Stub Gate

PASSED. No new TODO|FIXME|STUB|MOCK|HACK markers introduced in the test additions. (Re-confirmed against shared/src/.)

## Test Run

Runner: pnpm test from project root.

Result:
- Test Files: 29 passed, 1 skipped (30 total)
- Tests: 455 passed, 7 skipped (462 total)
- Duration: ~6.4s
- Skipped 7 = api/src/prisma.smoke.test.ts (live Postgres required; unchanged from baseline).

Per-package shared results:
- shared/src/api/api.test.ts -- 45 tests (was 34, now +11 = 45). CONFIRMED.
- shared/src/dto/dto.test.ts -- 16 tests.
- shared/src/enums.test.ts -- 8 tests.

Expected 455 passed, 7 skipped matches exactly.

Baseline: workspace baseline 441 passed at the prior reconciliation entry. Increment since then includes the 11 SSE additions plus other approved increments captured in the changelog. Zero new failures.

## BE 8-Category Checklist (Re-Evaluation)

| Category | Prior | Now | Notes |
|---|---|---|---|
| 1. Code Correctness | PASS | PASS | Unchanged. Schemas faithfully reflect DTO shapes. |
| 2. Code Quality | PARTIAL | PARTIAL | Unchanged. Minor N-1/N-2/N-3 deferred. |
| 3. Error Handling | PASS | PASS | Unchanged. Pure schema package. |
| 4. Testing | PARTIAL | PASS | UPGRADED. M-1 resolved. SSE surface fully covered. 45 tests in api.test.ts. AAA pattern, independent, behavior-focused. |
| 5. Security | PASS | PASS | Unchanged. |
| 6. Performance | PASS | PASS | Unchanged. |
| 7. Documentation | PARTIAL | PARTIAL | Unchanged. JSDoc on public schemas plus camelCase/snake_case header still deferred (N-1, N-3). |
| 8. Git and Commits | PARTIAL | PARTIAL | Unchanged. Conductor-pipeline structural; follow-up commit applies the test additions. |

## TDD Compliance

The M-1 fix landed as test-only additions, which is the correct order for the spec-first principle (production schema already existed; tests were retroactively added to lock the contract). No production code changed in the M-1 follow-up.

## Test Author Independence

| Surface | Authors |
|---|---|
| Test files | noreply@anthropic.com |
| Production files | noreply@anthropic.com |
| Overlap | 100% |

Unchanged. This is structural for the conductor-driven workflow. Per the prior review operator-override note: the operator may accept the overlap as a structural fact of the pipeline and downgrade the headline to REVIEW COMPLETE / verdict APPROVED, but only after M-1 is fixed.

M-1 is now fixed. Per the operator note in the prior review and the user instruction, operator override is applied: verdict APPROVED with headline retained as REVIEW APPLIED -- UNVERIFIED to preserve audit transparency about the structural overlap.

Recommend (non-blocking): /nacl-tl-regression-test --retroactive TECH-004 for an independent-identity re-execution of the SSE tests when desired.

## Issues

### Major

None remaining. M-1 RESOLVED.

### Minor (carried forward, non-blocking)

- N-1 -- Document camelCase vs snake_case split in shared/src/index.ts or a shared/README.md. Carried.
- N-2 -- DRY TranscriptionJobDto and ProtocolGenerationJobDto via a shared JobBaseDto factory. Carried, non-blocking.
- N-3 -- JSDoc on public schemas (entity DTOs and contract responses). Carried.
- N-4 -- MeetingStatus.EDITED vs Prisma drift. Belongs to TECH-003 / UC-301-BE reviewers. Not a TECH-004 defect. Carried.

### No Blockers, No Critical

## Positive Observations

- PRAISE: Tight, surgical fix for M-1. Eleven tests added, no production code touched, no scope creep. Spec-first principle honored (schemas were already correct; tests retroactively lock the contract).
- PRAISE: Negative-path tests for MeetingDeletedEvent (non-uuid + wrong type) and for SseEvent (unknown discriminator) exceed the minimum recommended in the prior review.
- PRAISE: meetingChannel literal assertion uses both a synthetic id and a real UUID -- mirrors realistic usage patterns.
- PRAISE: Test suite now provides full discriminated-union coverage across all three SSE event variants, locking the wire contract for UC-002, UC-200, UC-300 SSE subscribers.

## Verdict

Workflow status: REVIEW APPLIED -- UNVERIFIED (100% author overlap). Code judgment: APPROVED (operator override applied per prior review note).

Rationale:
- M-1 is RESOLVED -- the single substantive blocker from the prior review is fixed.
- Testing category upgrades from PARTIAL to PASS.
- The 100% test-author overlap is structural for the conductor pipeline (single-bot identity). The prior review operator-override note authorized a downgrade to APPROVED once M-1 was fixed.
- All other categories remain at or above their prior level.

The headline is retained as REVIEW APPLIED -- UNVERIFIED (rather than REVIEW COMPLETE) to preserve audit transparency about the structural author overlap. This is the operator-override pattern documented in the prior review.

## Next Steps

1. TECH-004 may be marked approved in .tl/status.json.
2. Downstream gates unblocked: TECH-005 (already approved) and TECH-013 (already approved) no longer depend on a TECH-004 review hold.
3. Optional follow-ups (N-1..N-4) may be scheduled as documentation polish tasks, not blockers.
4. Optional: /nacl-tl-regression-test --retroactive TECH-004 for independent-identity test re-execution.
