# UC-003 — Frontend Test Spec

**UC:** Delete meeting

Framework: **Vitest** (component) + **Playwright** (E2E).

## Component tests
### CT01. `title` field renders + validates
- Field type: `text`
- Required: `False`
- Asserts label `Meeting title` (RU + EN via i18next).

## E2E user-flow tests (Playwright)

### E2E01. Step 1
- Action: AUTHOR clicks Delete on the meeting detail page (from UC-002).

### E2E02. Step 2
- Action: System shows confirmation dialog showing the title; if a job is IN_PROGRESS, the dialog warns it will be marked FAILED.

### E2E03. Step 3
- Action: AUTHOR confirms (or cancels and returns to UC-002).

### E2E04. Step 4
- Action: On success, AUTHOR is redirected to catalog (UC-001) with a success toast.

## Acceptance coverage
- GIVEN any Meeting, WHEN I confirm deletion, THEN the Meeting, its Recording (storage object removed), Transcript, Protocol, and all jobs are deleted.
- GIVEN deletion succeeds, THEN I am returned to the catalog (UC-001) with a confirmation toast.
- WHILE a job is IN_PROGRESS, deletion shows confirmation that the in-flight job will be marked FAILED.

Run: `pnpm --filter web test` (component) and `/nacl-tl-qa UC-003` (E2E).
