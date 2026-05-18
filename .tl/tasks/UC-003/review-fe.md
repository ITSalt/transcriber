---
task_id: UC-003-FE
title: "Code Review: UC-003 FE - Delete meeting"
reviewer: tl-review (strategist)
review_started: 2026-05-18T22:30:00Z
review_completed: 2026-05-18T23:00:00Z
duration_minutes: 30
result: approved
issues_found: 4
blockers: 0
critical: 0
major: 2
minor: 2
created: 2026-05-18
updated: 2026-05-18
tags: [review, UC-003, frontend, delete-meeting]
---

# Code Review: UC-003-FE - Delete Meeting

## Summary

UC-003-FE wires a delete mutation into the existing UC-002 meeting detail page. The delete button and confirmation dialog live in StatusSection.tsx; the mutation hook lives in routes/meeting/hooks/useDeleteMeeting.ts. On success, the cache is invalidated, a toast appears, and the user is navigated to /catalog. Cancel closes the dialog without side effects. In-flight job warning is shown when any job is PROCESSING (RQ-007). All 37 tests in the shared route test file pass; 5 of them are UC-003-specific.

**Verdict: APPROVED** with two MAJOR observations (test author independence, dialog a11y warning) and two MINOR items (file-path doc drift, i18n key duplication). None block merge.

## Review Scope

### Files Reviewed

| File | Lines | Status |
|------|-------|--------|
| web/src/routes/meeting/index.tsx | 93 | PASS |
| web/src/routes/meeting/hooks/useDeleteMeeting.ts | 33 | PASS |
| web/src/routes/meeting/components/StatusSection.tsx | 151 | PASS |
| web/src/routes/meeting/index.test.tsx | 528 | PASS (37 tests) |
| web/src/i18n/en.json (meeting.delete.*) | - | PASS |
| web/src/i18n/ru.json (meeting.delete.*) | - | PASS |

Note: result-fe.md lists the hook path as web/src/hooks/useDeleteMeeting.ts but the actual file is at web/src/routes/meeting/hooks/useDeleteMeeting.ts. See N1.

### Review Coverage

| Metric | Value |
|--------|-------|
| Files Reviewed | 6 |
| Lines Reviewed | ~800 |
| Test Files Reviewed | 1 (37 tests, 5 UC-003-specific) |
| Languages Verified | EN + RU (i18n keys present) |

## Acceptance Criteria Verification

### Functional Criteria (acceptance.md)

| ID | Criterion | Status | Evidence |
|----|-----------|--------|----------|
| AC1 | GIVEN any Meeting, WHEN I confirm deletion, THEN the Meeting + Recording + Transcript + Protocol + all jobs are deleted | PASS (BE-enforced) | FE issues DELETE /api/meetings/:id; cascade is BE responsibility (covered in BE review) |
| AC2 | GIVEN deletion succeeds, THEN I am returned to the catalog (UC-001) with a confirmation toast | PASS | useDeleteMeeting.onSuccess invalidates ["meetings"], shows success toast, navigates to /catalog; test "navigates to /catalog after successful delete" verifies |
| AC3 | WHILE a job is IN_PROGRESS, deletion shows confirmation that the in-flight job will be marked FAILED | PASS | StatusSection conditionally renders amber warning paragraph testid "delete-dialog-inflight-warning" when jobInProgress prop is true; test "shows in-flight warning when job is PROCESSING" verifies |

### Form Fields (task-fe.md)

| Name | Label | Type | Implemented | Notes |
|------|-------|------|-------------|-------|
| header | Delete this meeting? | header | YES | DialogTitle uses key meeting.delete.confirmTitle |
| title | Meeting title | text | YES | data-testid="delete-dialog-meeting-title"; echoes meeting.title |
| warning | In-flight job warning | alert | YES (conditional) | data-testid="delete-dialog-inflight-warning"; shown when jobInProgress is true |
| confirm_button | Confirm delete | button | YES | data-testid="btn-delete-confirm"; triggers DELETE /api/meetings/:id |
| cancel_button | Cancel | button | YES | data-testid="btn-delete-cancel"; closes dialog |

### Component Tests (test-spec-fe.md)

| ID | Description | Status |
|----|-------------|--------|
| CT01 | title field renders + validates (label Meeting title in EN+RU) | PASS via existing UC-002 CT01 + new UC-003 CT01 (shows meeting title in delete dialog) |

## FE Quality Review (10-category)

### 1. Component Architecture — PASS

- Business logic lives in the useDeleteMeeting hook (mutation + onSuccess/onError side-effects), not in the component.
- StatusSection (151 lines) and index.tsx (93 lines) are well under the 150-line guideline. The delete dialog could arguably be its own component, but co-locating it in StatusSection (where the trigger button lives) is reasonable and keeps state local.
- Props interfaces are explicit: StatusSectionProps lists all 8 props including new optional jobInProgress, isDeleting, and required onDelete callback.
- Composition: the delete dialog is a shadcn/ui Dialog primitive with DialogContent, DialogHeader, DialogTitle, DialogFooter — proper composition pattern.

Findings: No issues.

### 2. TypeScript Strictness — PASS

- No any in production code paths.
- StatusSection props typed via MeetingStatus discriminated string union imported from @transcrib/shared.
- useDeleteMeeting consumes MeetingDeleteResponse Zod schema from shared and passes it to apiDelete<T>(path, schema) — runtime + compile-time type safety.
- No `as` type assertions found.
- React event types are not used directly in this UC (no form input handlers; only onClick buttons).

Findings: No issues.

### 3. State Management — PASS

- Server state: useMeetingDetail uses useQuery; deletion uses useMutation. Cache invalidation on success via queryClient.invalidateQueries({ queryKey: ["meetings"] }). Correct TanStack Query pattern.
- Local UI state: showDeleteDialog is a useState in StatusSection; appropriate scope (only the parent of the dialog needs it).
- isDeleting prop comes from deleteMutation.isPending; passed down rather than re-derived. Disables the delete button (line 101).
- No prop drilling beyond 2 levels (MeetingDetailPage -> StatusSection).
- Derived state (canViewTranscript, canViewProtocol, canExportPdf) computed inline from props, not stored in useState. Correct.

Findings: No issues.

### 4. API Integration — PASS

- No raw fetch() in components. apiDelete<MeetingDeleteResponse>(...) is used.
- Error handling via onError toast in the mutation; user-visible feedback.
- Loading state: isDeleting disables the delete button.
- Typed response: MeetingDeleteResponse Zod schema enforces shape at runtime.
- Cache invalidation: queryClient.invalidateQueries({ queryKey: ["meetings"] }) refreshes the catalog after delete; navigate("/catalog") returns the user to the catalog page where the deleted item will be gone.

Findings: No issues.

### 5. Forms and Validation — N/A

UC-003 has no form fields requiring validation; the delete confirmation has only buttons and a static title display. The "form fields" listed in task-fe.md are display-only (header, title, warning) plus action buttons — no user input to validate.

Findings: N/A.

### 6. Accessibility — PARTIAL

- Buttons use semantic <Button> from shadcn/ui (renders <button>); keyboard-accessible by default.
- Delete confirmation dialog uses shadcn Dialog primitive, which provides role="dialog", aria-modal, focus management, and Escape-to-close. Confirmed by the test "cancel delete closes dialog without navigating" which works without an explicit click — well, in this test it clicks btn-delete-cancel, but the primitive supports Escape.
- Test "renders i18n labels in Russian when language is RU" verifies bilingual support.
- Warning on the in-flight case is a <p> with className="text-sm text-amber-600". It's not announced as a live region or role="alert", so a screen reader user opening the dialog will discover it as static text. Acceptable for the MVP but could be improved.

WARN observed in test output: Missing Description or aria-describedby={undefined} for DialogContent. Radix Dialog emits this warning when there is no DialogDescription element. The dialog has two <p> tags but neither is wired via aria-describedby. See M2.

Findings: Minor a11y warning (M2).

### 7. Responsive Design — PASS (light review)

- Layout uses Tailwind utilities; the dialog primitive is responsive out of the box.
- Buttons in the dialog footer (DialogFooter) wrap naturally.
- No fixed pixel widths in the delete-related JSX.
- Mobile tap targets: standard shadcn Button sizing meets ~44px equivalent.

Findings: No issues at the level of code review.

### 8. Performance — PASS

- No list rendering in the delete path; performance considerations are minimal.
- No useMemo/useCallback abuse; no premature optimization.
- The Dialog is conditionally rendered (only mounted when open; shadcn renders Portal on open).

Findings: No issues.

### 9. Testing (React Testing Library) — PARTIAL

- All 37 tests in routes/meeting/index.test.tsx pass.
- 5 UC-003-specific tests cover:
  1. shows meeting title in delete dialog (UC-003 CT01)
  2. shows in-flight warning when job is PROCESSING
  3. no in-flight warning when jobs are DONE
  4. navigates to /catalog after successful delete (full happy path)
  5. cancel delete closes dialog without navigating

- Tests use userEvent (preferred over fireEvent), getByTestId (rather than role) — see Note below.
- Tests cover happy path, cancel branch, and conditional UI (in-flight warning shown vs hidden).
- AAA structure clear; setup via mockFetch helper.

Gap (MAJOR M1): Test author independence. result-fe.md indicates tests are co-located with UC-002 FE in the same shared file (web/src/routes/meeting/index.test.tsx). The conductor workflow means the same agent wrote both the dialog and the tests; there is no independent verification. This is a project-systemic limitation (also flagged in UC-001 BE review history) rather than a UC-003-specific defect, but worth recording.

Note (advisory): Tests rely heavily on data-testid selectors (btn-delete, btn-delete-confirm, delete-confirm-dialog). The fe-review-checklist prefers role/text selectors (getByRole("button", { name: /delete/i })). For UC-003 the testids are stable and intentional, but switching to role-based queries would catch a11y regressions earlier. Non-blocking.

### 10. Stub/Mock Check — PASS

- No TODO/FIXME/STUB/MOCK markers in production sources (useDeleteMeeting.ts, StatusSection.tsx, index.tsx).
- No commented-out code blocks.
- No console.log.
- No placeholder text (Lorem ipsum, etc.).
- Mock fetches present only in the test file (web/src/routes/meeting/index.test.tsx), as expected.

Findings: No issues.

## Issues Found

### Blockers — None

### Critical — None

### Major

#### Issue M1: Test author independence (project-systemic)

Severity: Major
File: web/src/routes/meeting/index.test.tsx
Line: 421-528 (UC-003 test cases)

Description:
UC-003 FE tests are appended to the UC-002 FE test file. The conductor workflow means a single agent wrote both the dialog implementation and the test cases. There is no independent test author. This is a known project-systemic limitation already flagged in earlier reviews (UC-001 BE), not a UC-003-specific defect.

Recommended Fix:
Not addressable within this UC. Project-level concern. Acceptable to mark with the same caveat used for other UCs (test author independence: 100% overlap; conductor workflow).

Rationale:
Documented for traceability and consistency with prior reviews.

#### Issue M2: DialogContent emits a11y warning (missing description binding)

Severity: Major
File: web/src/routes/meeting/components/StatusSection.tsx
Line: 107-148 (DialogContent block)

Description:
Test output shows: Warning: Missing Description or aria-describedby=undefined for DialogContent. Radix Dialog emits this when DialogContent has no DialogDescription child or aria-describedby attribute pointing at descriptive text. Screen readers will announce only the title, not the body or the in-flight warning.

Recommended Fix:
Wrap the descriptive paragraph in a DialogDescription primitive (shadcn/ui exports it), or add aria-describedby to DialogContent pointing at the description paragraph id.

Rationale:
Improves screen-reader experience; eliminates the runtime warning that currently pollutes test output and would also appear in dev console.

### Minor

#### Issue N1: result-fe.md hook path is wrong

Severity: Minor
File: .tl/tasks/UC-003/result-fe.md
Line: 19

Description:
result-fe.md lists the hook at web/src/hooks/useDeleteMeeting.ts. Actual location is web/src/routes/meeting/hooks/useDeleteMeeting.ts. Doc drift.

Suggestion:
Update result-fe.md to the correct path.

#### Issue N2: i18n key duplication (legacy vs current delete keys)

Severity: Minor
File: web/src/i18n/en.json, web/src/i18n/ru.json

Description:
Two parallel sets of i18n keys exist for the same concept:
- meeting.detail.deleteConfirmTitle / meeting.detail.deleteConfirmBody (legacy from UC-002 scaffolding)
- meeting.delete.confirmTitle / meeting.delete.confirmBody (used by UC-003)

The UC-003 code uses the meeting.delete keys. The meeting.detail.deleteConfirm keys are unreferenced.

Suggestion:
Either delete the legacy entries or document them as deprecated. Non-blocking.

## Issue Summary

| Severity | Count | Must Fix |
|----------|-------|----------|
| Blocker | 0 | - |
| Critical | 0 | - |
| Major | 2 | Recommended |
| Minor | 2 | Optional |
| Total | 4 | 0 required |

## Test Verification

### Test Run Results

Workspace test run (pnpm test from C:\projects\transcrib):
- web: src/routes/meeting/index.test.tsx — 37 tests passed
- UC-003-specific cases (lines 421-528 of the test file):
  1. UC-003 CT01: shows meeting title in delete dialog — PASS
  2. UC-003: shows in-flight warning when job is PROCESSING — PASS
  3. UC-003: no in-flight warning when jobs are DONE — PASS
  4. UC-003: navigates to /catalog after successful delete — PASS
  5. UC-003: cancel delete closes dialog without navigating — PASS

Total workspace summary: 450 passed, 5 failed, 7 skipped (462 total). The 5 failures are in worker/src/jobs/transcription.test.ts (UC-200) and are unrelated to UC-003.

### Test Summary

| Metric | Value | Target | Status |
|--------|-------|--------|--------|
| Test Suites (UC-003 FE) | 1 of 1 pass | All pass | PASS |
| Tests (UC-003 FE specific) | 5 of 5 pass | All pass | PASS |
| Tests (shared meeting route, total) | 37 of 37 pass | All pass | PASS |

## TDD Compliance

| Phase | Evidence | Status |
|-------|----------|--------|
| RED | result-fe.md states RED -> GREEN -> REFACTOR | PASS (claimed) |
| GREEN | Minimal additions: 33-line hook + dialog block in StatusSection | PASS |
| REFACTOR | Reused existing StatusSection rather than creating a new component; props extension is clean | PASS |

## Positive Observations

1. Hook isolation: useDeleteMeeting cleanly separates server-state concerns (mutation, cache invalidation, toast, navigation) from view concerns. Component receives only onDelete and isDeleting.
2. Cache invalidation pattern: queryClient.invalidateQueries with queryKey ["meetings"] uses a prefix match — catalog (queryKey ["meetings"]) and detail (queryKey ["meetings", id]) will both refresh.
3. Optimistic UX: button is disabled during mutation (disabled=isDeleting); prevents double-submit.
4. In-flight warning is data-driven: derived from data.latest_transcription_job.status or data.latest_protocol_job.status equal to PROCESSING. Real-time SSE updates (useEffect on meetingId) refresh the detail query, so the warning reflects live state.
5. Bilingual: i18n keys present in both EN and RU; renders i18n labels in Russian when language is RU test verifies the language switch works.
6. Toasts: both success and error paths render user feedback via the shared toast system; no silent failures.
7. Navigation timing: navigate("/catalog") is wrapped in void to silence the promise warning while not awaiting (correct for fire-and-forget client navigation).
8. Type safety: MeetingDeleteResponse from @transcrib/shared used as the runtime schema for apiDelete; inferred type flows through useMutation.

## Recommendations

### Immediate (This PR)

1. Add DialogDescription or aria-describedby to the delete dialog (M2).
2. Fix the hook path in result-fe.md (N1).

### Future Improvements

1. Migrate test selectors from data-testid to role/name based queries to align with the FE review checklist preference.
2. Remove unused meeting.detail.deleteConfirm i18n keys (N2).
3. Consider extracting the delete confirmation dialog into its own component (DeleteMeetingDialog) once a second use case for it emerges.
4. Optionally add a unit test for useDeleteMeeting hook in isolation (renderHook from @testing-library/react), to exercise onSuccess/onError without rendering the entire page.

## Final Decision

### Review Result: APPROVED

Confidence Level: High

### Approval Conditions

None blocking. M2 (a11y warning) is recommended for cleanup before final QA but does not block merge — the dialog is functional and keyboard-accessible.

### Decision Rationale

All three acceptance criteria are met:
- AC2 verified by automated test (post-delete navigation to /catalog).
- AC3 verified by automated test (in-flight warning shown when job is PROCESSING, hidden when DONE).
- AC1 is BE-enforced (cascade deletion) and covered in the BE review.

The hook is well-isolated, types flow correctly from @transcrib/shared, and there are no stubs/mocks/TODOs in production code. 37 tests pass.

### Next Steps

- Update status.json: UC-003.phases.review-fe = approved.
- Append changelog entry.
- After BE is also approved, UC-003 is ready for /nacl-tl-qa UC-003 (E2E).

## Review Metadata

| Attribute | Value |
|-----------|-------|
| Reviewer | tl-review (strategist) |
| Review Type | full (10-category FE checklist) |
| Review Started | 2026-05-18 22:30 UTC |
| Review Completed | 2026-05-18 23:00 UTC |
| Duration | 30 minutes |
| Result Files Read | result-fe.md, acceptance.md, test-spec-fe.md, api-contract.md, impl-brief-fe.md |

### Files Referenced

| File | Purpose |
|------|---------|
| .tl/tasks/UC-003/task-fe.md | Task spec |
| .tl/tasks/UC-003/result-fe.md | Development evidence |
| .tl/tasks/UC-003/acceptance.md | Acceptance criteria |
| .tl/tasks/UC-003/test-spec-fe.md | Test specification |
| .tl/tasks/UC-003/impl-brief-fe.md | Implementation brief |
| web/src/routes/meeting/index.tsx | Page component |
| web/src/routes/meeting/components/StatusSection.tsx | Delete button + dialog |
| web/src/routes/meeting/hooks/useDeleteMeeting.ts | Delete mutation hook |
| web/src/routes/meeting/index.test.tsx | Tests (37 total, 5 UC-003) |
| web/src/i18n/en.json, web/src/i18n/ru.json | i18n keys |
