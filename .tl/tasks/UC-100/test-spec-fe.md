# UC-100 — Frontend Test Spec

**UC:** Upload meeting video

Framework: **Vitest** (component) + **Playwright** (E2E).

## Component tests
### CT01. `file` field renders + validates
- Field type: `file`
- Required: `True`
- Asserts label `Video file (MP4 / MKV / MOV, max 500 MB)` (RU + EN via i18next).

### CT02. `language` field renders + validates
- Field type: `select`
- Required: `False`
- Asserts label `Language (leave blank for auto-detect)` (RU + EN via i18next).

### CT03. `title` field renders + validates
- Field type: `text`
- Required: `False`
- Asserts label `Meeting title (defaults to filename)` (RU + EN via i18next).

## E2E user-flow tests (Playwright)

### E2E01. Step 1
- Action: AUTHOR navigates to /upload.

### E2E02. Step 2
- Action: AUTHOR selects a video file via picker (max 500 MB; MP4/MKV/MOV).

### E2E03. Step 3
- Action: AUTHOR optionally sets language (RU/EN; blank = auto-detect) and title (defaults to filename).

### E2E04. Step 4
- Action: AUTHOR clicks Upload; sees progress bar driven by TUS upload progress events.

### E2E05. Step 5
- Action: On error, inline message appears on the form (RQ-008/009/010 failures).

### E2E06. Step 6
- Action: On success, AUTHOR is redirected to /meetings/:id with success toast.

## Acceptance coverage
- GIVEN a valid MP4/MKV/MOV file <= 500 MB (BRQ-001, BRQ-002), WHEN I upload, THEN the system accepts, creates Meeting + Recording + TranscriptionJob, and shows status UPLOADING -> TRANSCRIBING.
- GIVEN a file > 500 MB or wrong MIME, WHEN I attempt upload, THEN the system rejects before storage with a clear error.
- GIVEN a corrupt file (BRQ-003), WHEN validation fails, THEN the system rejects with a user-facing error.
- I can choose RU or EN as the language hint; leaving it blank means auto-detect (BRQ-005).

Run: `pnpm --filter web test` (component) and `/nacl-tl-qa UC-100` (E2E).
