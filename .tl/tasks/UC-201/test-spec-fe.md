# UC-201 — Frontend Test Spec

**UC:** View and download transcript

Framework: **Vitest** (component) + **Playwright** (E2E).

## Component tests
### CT01. `language` field renders + validates
- Field type: `select`
- Required: `True`
- Asserts label `Language` (RU + EN via i18next).

### CT02. `segments_count` field renders + validates
- Field type: `number`
- Required: `True`
- Asserts label `Segments` (RU + EN via i18next).

### CT03. `speakers_count` field renders + validates
- Field type: `number`
- Required: `True`
- Asserts label `Speakers` (RU + EN via i18next).

### CT04. `created_at` field renders + validates
- Field type: `datetime`
- Required: `True`
- Asserts label `Created` (RU + EN via i18next).

### CT05. `full_text` field renders + validates
- Field type: `textarea (read-only)`
- Required: `True`
- Asserts label `Transcript content` (RU + EN via i18next).

### CT06. `speaker_map` field renders + validates
- Field type: `textarea`
- Required: `False`
- Asserts label `Speaker name map` (RU + EN via i18next).

## E2E user-flow tests (Playwright)

### E2E01. Step 1
- Action: AUTHOR clicks 'View transcript' from the meeting detail page.

### E2E02. Step 2
- Action: AUTHOR sees the transcript with speaker labels and timestamps; header shows segments_count, speakers_count, language, created_at.

### E2E03. Step 3
- Action: AUTHOR clicks Download to save a plain-text file.

### E2E04. Step 4
- Action: AUTHOR clicks 'Back to meeting' to return to UC-002.

## Acceptance coverage
- GIVEN Meeting.status >= TRANSCRIPT_READY, WHEN I open the transcript view, THEN I see segments with speaker labels, timestamps, and counts (segments_count, speakers_count).
- I can download the transcript as a text file with a one-click action.
- Unresolved speakers (BRQ-021) are shown as 'Speaker N'; resolved speakers show the real name.

Run: `pnpm --filter web test` (component) and `/nacl-tl-qa UC-201` (E2E).
