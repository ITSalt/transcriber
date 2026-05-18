# UC-001 — Frontend Test Spec

**UC:** View meeting catalog

Framework: **Vitest** (component) + **Playwright** (E2E).

## Component tests
### CT01. `title` field renders + validates
- Field type: `text`
- Required: `False`
- Asserts label `Title` (RU + EN via i18next).

### CT02. `status` field renders + validates
- Field type: `badge/select`
- Required: `True`
- Asserts label `Status` (RU + EN via i18next).

### CT03. `language` field renders + validates
- Field type: `text`
- Required: `False`
- Asserts label `Language` (RU + EN via i18next).

### CT04. `uploaded_at` field renders + validates
- Field type: `datetime`
- Required: `True`
- Asserts label `Uploaded` (RU + EN via i18next).

### CT05. `duration_sec` field renders + validates
- Field type: `number`
- Required: `False`
- Asserts label `Duration` (RU + EN via i18next).

## E2E user-flow tests (Playwright)

### E2E01. Step 1
- Action: AUTHOR opens the meeting catalog page.

### E2E02. Step 2
- Action: AUTHOR sees the list and can click 'Open' on a row to navigate to UC-002.

## Acceptance coverage
- GIVEN at least one Meeting exists, WHEN I open the catalog, THEN I see a list of meetings sorted by updated_at descending.
- EACH row shows: title (or filename fallback), status badge (per ENUM-MeetingStatus), language, uploaded_at, duration if available.
- GIVEN a meeting in a transient state (UPLOADING / TRANSCRIBING / PROTOCOL_GENERATING), THEN its row shows a progress indicator that auto-refreshes.

Run: `pnpm --filter web test` (component) and `/nacl-tl-qa UC-001` (E2E).
