# UC-301 — Frontend Test Spec

**UC:** Review and edit protocol

Framework: **Vitest** (component) + **Playwright** (E2E).

## Component tests
### CT01. `markdown_content` field renders + validates
- Field type: `textarea (Milkdown WYSIWYG)`
- Required: `True`
- Asserts label `Protocol (Markdown)` (RU + EN via i18next).

### CT02. `version` field renders + validates
- Field type: `number`
- Required: `True`
- Asserts label `Version` (RU + EN via i18next).

### CT03. `edit_count` field renders + validates
- Field type: `number`
- Required: `True`
- Asserts label `Edits` (RU + EN via i18next).

### CT04. `last_edited_at` field renders + validates
- Field type: `datetime`
- Required: `False`
- Asserts label `Last edited` (RU + EN via i18next).

### CT05. `generated_at` field renders + validates
- Field type: `datetime`
- Required: `True`
- Asserts label `Generated` (RU + EN via i18next).

## E2E user-flow tests (Playwright)

### E2E01. Step 1
- Action: AUTHOR clicks 'Review/Edit protocol' from the meeting detail page (UC-002).

### E2E02. Step 2
- Action: Editor renders Markdown via Milkdown WYSIWYG with side-by-side rendered preview. Header shows version + edit_count + last_edited_at.

### E2E03. Step 3
- Action: AUTHOR edits content; preview updates live.

### E2E04. Step 4
- Action: AUTHOR clicks Save; success indicator shows new version.

### E2E05. Step 5
- Action: If AUTHOR navigates away with unsaved changes, browser-native or in-app confirmation warns (RQ-031).

### E2E06. Step 6
- Action: AUTHOR can also click 'Export PDF' (calls UC-302 endpoint) or 'Back to meeting'.

## Acceptance coverage
- GIVEN Meeting.status in {PROTOCOL_READY, EDITED}, WHEN I open the protocol, THEN it loads in a Markdown editor with rendered preview.
- WHEN I save changes, THEN Protocol.markdown_content is updated, version increments by 1 (BRQ-014), edit_count increments by 1 (BRQ-015), last_edited_at is set, and Meeting.status -> EDITED.
- All edits operate on the canonical Markdown (BRQ-018); preview is a derivation.

Run: `pnpm --filter web test` (component) and `/nacl-tl-qa UC-301` (E2E).
