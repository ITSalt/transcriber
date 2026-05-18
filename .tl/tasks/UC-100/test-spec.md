# UC-100 — Backend Test Spec

**UC:** Upload meeting video  ·  **Wave:** 1

Test framework: **Vitest** + supertest (HTTP) / BullMQ test harness (worker).

Each test references an RQ ID. Add new tests when adding new RQs.

## Test scenarios

### T01. RQ-008 — Reject size_bytes > 524,288,000 (500 MB) BEFORE any storage upload begins..
```ts
// RQ-008: Reject size_bytes > 524,288,000 (500 MB) BEFORE any storage upload begins.
// Setup -> Action -> Assert
// (Implement against the endpoint / worker handler in task-be.md.)
```

### T02. RQ-009 — Accept exactly {video/mp4, video/x-matroska, video/quicktime}; reject others with clear user-facing error..
```ts
// RQ-009: Accept exactly {video/mp4, video/x-matroska, video/quicktime}; reject others with clear user-facing error.
// Setup -> Action -> Assert
// (Implement against the endpoint / worker handler in task-be.md.)
```

### T03. RQ-010 — Verify container integrity at upload acceptance (probe header / short sample).
```ts
// RQ-010: Verify container integrity at upload acceptance (probe header / short sample). Corrupt files rejected before Recording is persisted (BRQ-003).
// Setup -> Action -> Assert
// (Implement against the endpoint / worker handler in task-be.md.)
```

### T04. RQ-011 — On successful upload completion, atomically: (1) finalize Recording metadata; (2) transition Meeting.status UPLOADING -> TRANSCRIBING (BRQ-008); (3) create exactly one TranscriptionJob with status=QUEUED per Recording (BRQ-006)..
```ts
// RQ-011: On successful upload completion, atomically: (1) finalize Recording metadata; (2) transition Meeting.status UPLOADING -> TRANSCRIBING (BRQ-008); (3) create exactly one TranscriptionJob with status=QUEUED per Recording (BRQ-006).
// Setup -> Action -> Assert
// (Implement against the endpoint / worker handler in task-be.md.)
```

### T05. RQ-012 — Language selector accepts RU, EN, or blank.
```ts
// RQ-012: Language selector accepts RU, EN, or blank. Blank -> Meeting.language stays null; ASR auto-detects per BRQ-005.
// Setup -> Action -> Assert
// (Implement against the endpoint / worker handler in task-be.md.)
```

### T06. RQ-013 — Meeting.title defaults to Recording.filename (without extension) when AUTHOR leaves the field blank..
```ts
// RQ-013: Meeting.title defaults to Recording.filename (without extension) when AUTHOR leaves the field blank.
// Setup -> Action -> Assert
// (Implement against the endpoint / worker handler in task-be.md.)
```

### T07. NFR-001 — Upload pipeline accepts up to 500 MB via chunked transfer without timeout..
```ts
// NFR-001: Upload pipeline accepts up to 500 MB via chunked transfer without timeout.
// Setup -> Action -> Assert
// (Implement against the endpoint / worker handler in task-be.md.)
```

### T08. NFR-002 — Transcription/protocol run asynchronously; UI surfaces job progress without blocking..
```ts
// NFR-002: Transcription/protocol run asynchronously; UI surfaces job progress without blocking.
// Setup -> Action -> Assert
// (Implement against the endpoint / worker handler in task-be.md.)
```

### T09. NFR-004 — Support RU and EN throughout (UI, ASR hint, prompts, errors)..
```ts
// NFR-004: Support RU and EN throughout (UI, ASR hint, prompts, errors).
// Setup -> Action -> Assert
// (Implement against the endpoint / worker handler in task-be.md.)
```

### T10. NFR-005 — Recordings persist in durable object storage until both Transcript and Protocol are produced..
```ts
// NFR-005: Recordings persist in durable object storage until both Transcript and Protocol are produced.
// Setup -> Action -> Assert
// (Implement against the endpoint / worker handler in task-be.md.)
```

## Integration tests

- Endpoint smoke: each endpoint returns the documented success shape under happy-path setup.
- Each error code in `api-contract.md` is reachable via at least one negative test.
- Status-driven gating (RQ-005 / RQ-029) covered by parametrized tests over MeetingStatus enum values.

## Verification command

```bash
pnpm --filter api test -- uc-100
# or, for workers:
pnpm --filter worker test -- uc-100
```

