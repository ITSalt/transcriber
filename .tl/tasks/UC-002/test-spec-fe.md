# UC-002 — Frontend Test Spec

**UC:** View meeting detail

Framework: **Vitest** (component) + **Playwright** (E2E).

## Component tests
### CT01. `title` field renders + validates
- Field type: `text`
- Required: `False`
- Asserts label `Title` (RU + EN via i18next).

### CT02. `language` field renders + validates
- Field type: `select`
- Required: `False`
- Asserts label `Language` (RU + EN via i18next).

### CT03. `status` field renders + validates
- Field type: `badge`
- Required: `True`
- Asserts label `Status` (RU + EN via i18next).

### CT04. `uploaded_at` field renders + validates
- Field type: `datetime`
- Required: `True`
- Asserts label `Uploaded at` (RU + EN via i18next).

### CT05. `updated_at` field renders + validates
- Field type: `datetime`
- Required: `True`
- Asserts label `Last update` (RU + EN via i18next).

### CT06. `filename` field renders + validates
- Field type: `text`
- Required: `True`
- Asserts label `File name` (RU + EN via i18next).

### CT07. `size_bytes` field renders + validates
- Field type: `number`
- Required: `True`
- Asserts label `Size` (RU + EN via i18next).

### CT08. `mime_type` field renders + validates
- Field type: `select`
- Required: `True`
- Asserts label `Format` (RU + EN via i18next).

### CT09. `duration_sec` field renders + validates
- Field type: `number`
- Required: `False`
- Asserts label `Duration` (RU + EN via i18next).

### CT10. `error_reason` field renders + validates
- Field type: `textarea`
- Required: `False`
- Asserts label `Error` (RU + EN via i18next).

## E2E user-flow tests (Playwright)

### E2E01. Step 1
- Action: AUTHOR navigates from catalog or via direct URL /meetings/:id.

### E2E02. Step 2
- Action: AUTHOR sees detail panel; available action links depend on status (RQ-005).

### E2E03. Step 3
- Action: AUTHOR clicks: View transcript (-> UC-201), Review/Edit protocol (-> UC-301), Export PDF (-> UC-302 endpoint), or Delete (-> UC-003).

## Acceptance coverage
- GIVEN a Meeting, WHEN I open its detail page, THEN I see: title, language, status, recording metadata (filename, size, duration), and current job error_reason when FAILED.
- GIVEN status >= TRANSCRIPT_READY, THEN a link to view the transcript is visible (UC-201).
- GIVEN status >= PROTOCOL_READY, THEN a link to review/edit the protocol is visible (UC-301).

Run: `pnpm --filter web test` (component) and `/nacl-tl-qa UC-002` (E2E).
