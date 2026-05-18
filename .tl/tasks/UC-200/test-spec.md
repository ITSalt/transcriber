# UC-200 — Backend Test Spec

**UC:** Process transcription pipeline  ·  **Wave:** 2

Test framework: **Vitest** + supertest (HTTP) / BullMQ test harness (worker).

Each test references an RQ ID. Add new tests when adding new RQs.

## Test scenarios

### T01. RQ-014 — TranscriptionJob lifecycle: QUEUED -> IN_PROGRESS -> {COMPLETED, FAILED}.
```ts
// RQ-014: TranscriptionJob lifecycle: QUEUED -> IN_PROGRESS -> {COMPLETED, FAILED}. Terminal states immutable (BRQ-009).
// Setup -> Action -> Assert
// (Implement against the endpoint / worker handler in task-be.md.)
```

### T02. RQ-015 — On ANY failure (storage fetch, audio extraction, ASR call, response parsing) -> job.status=FAILED with non-null error_reason; Meeting.status -> FAILED (BRQ-008/010)..
```ts
// RQ-015: On ANY failure (storage fetch, audio extraction, ASR call, response parsing) -> job.status=FAILED with non-null error_reason; Meeting.status -> FAILED (BRQ-008/010).
// Setup -> Action -> Assert
// (Implement against the endpoint / worker handler in task-be.md.)
```

### T03. RQ-016 — On successful completion of TranscriptionJob, auto-create exactly one ProtocolGenerationJob (status=QUEUED, transcript_id, prompt_template_version=current) per BRQ-007..
```ts
// RQ-016: On successful completion of TranscriptionJob, auto-create exactly one ProtocolGenerationJob (status=QUEUED, transcript_id, prompt_template_version=current) per BRQ-007.
// Setup -> Action -> Assert
// (Implement against the endpoint / worker handler in task-be.md.)
```

### T04. RQ-017 — Speaker name resolution MUST attempt to map anonymous diarization labels to real names via self-introductions / addressed names in the transcript.
```ts
// RQ-017: Speaker name resolution MUST attempt to map anonymous diarization labels to real names via self-introductions / addressed names in the transcript. Confident matches substitute across full_text and populate speaker_map. Unresolved labels remain 'Speaker N' (BRQ-021).
// Setup -> Action -> Assert
// (Implement against the endpoint / worker handler in task-be.md.)
```

### T05. RQ-018 — Language: if Meeting.language is null, ASR detects and writes Transcript.language; Meeting.language stays null.
```ts
// RQ-018: Language: if Meeting.language is null, ASR detects and writes Transcript.language; Meeting.language stays null. If set, it is passed as hint and Transcript.language SHOULD match (BRQ-005).
// Setup -> Action -> Assert
// (Implement against the endpoint / worker handler in task-be.md.)
```

### T06. NFR-002 — Async job-based execution; no UI blocking..
```ts
// NFR-002: Async job-based execution; no UI blocking.
// Setup -> Action -> Assert
// (Implement against the endpoint / worker handler in task-be.md.)
```

### T07. NFR-003 — No processing-time SLA at MVP..
```ts
// NFR-003: No processing-time SLA at MVP.
// Setup -> Action -> Assert
// (Implement against the endpoint / worker handler in task-be.md.)
```

### T08. NFR-004 — RU + EN throughout..
```ts
// NFR-004: RU + EN throughout.
// Setup -> Action -> Assert
// (Implement against the endpoint / worker handler in task-be.md.)
```

### T09. NFR-008 — Failures surfaced with human-readable error_reason; terminal jobs immutable..
```ts
// NFR-008: Failures surfaced with human-readable error_reason; terminal jobs immutable.
// Setup -> Action -> Assert
// (Implement against the endpoint / worker handler in task-be.md.)
```

## Integration tests

- Full job lifecycle: enqueue payload -> worker handles -> COMPLETED with correct Transcript/Protocol persisted.
- Failure path: stub provider to throw -> job FAILED with error_reason, Meeting.status FAILED, no re-enqueue.
- Concurrency: BullMQ concurrency=1 honored per NFR-009.

## Verification command

```bash
pnpm --filter api test -- uc-200
# or, for workers:
pnpm --filter worker test -- uc-200
```

