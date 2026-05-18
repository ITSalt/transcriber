# UC-300 — Backend Test Spec

**UC:** Generate protocol pipeline  ·  **Wave:** 3

Test framework: **Vitest** + supertest (HTTP) / BullMQ test harness (worker).

Each test references an RQ ID. Add new tests when adding new RQs.

## Test scenarios

### T01. RQ-021 — ProtocolGenerationJob lifecycle: QUEUED -> IN_PROGRESS -> {COMPLETED, FAILED}.
```ts
// RQ-021: ProtocolGenerationJob lifecycle: QUEUED -> IN_PROGRESS -> {COMPLETED, FAILED}. Terminal immutable (BRQ-009).
// Setup -> Action -> Assert
// (Implement against the endpoint / worker handler in task-be.md.)
```

### T02. RQ-022 — LLM prompt template selected by Transcript.language (BRQ-013); resulting protocol language MUST match transcript language.
```ts
// RQ-022: LLM prompt template selected by Transcript.language (BRQ-013); resulting protocol language MUST match transcript language. Template version recorded on job.
// Setup -> Action -> Assert
// (Implement against the endpoint / worker handler in task-be.md.)
```

### T03. RQ-023 — Persisted Protocol MUST contain Participants, Discussion Topics, Decisions, Action Items (BRQ-011).
```ts
// RQ-023: Persisted Protocol MUST contain Participants, Discussion Topics, Decisions, Action Items (BRQ-011). Missing section -> job FAILED.
// Setup -> Action -> Assert
// (Implement against the endpoint / worker handler in task-be.md.)
```

### T04. RQ-024 — Action items SHOULD include assignee/deadline when stated (BRQ-012).
```ts
// RQ-024: Action items SHOULD include assignee/deadline when stated (BRQ-012). Best-effort by LLM.
// Setup -> Action -> Assert
// (Implement against the endpoint / worker handler in task-be.md.)
```

### T05. RQ-025 — Initial Protocol on success: version=1, edit_count=0, generated_at=now.
```ts
// RQ-025: Initial Protocol on success: version=1, edit_count=0, generated_at=now. Meeting.status -> PROTOCOL_READY (BRQ-008/014/015).
// Setup -> Action -> Assert
// (Implement against the endpoint / worker handler in task-be.md.)
```

### T06. RQ-026 — On ANY failure (LLM error, parse error, missing required sections) -> job FAILED with error_reason; Meeting FAILED (BRQ-008/010)..
```ts
// RQ-026: On ANY failure (LLM error, parse error, missing required sections) -> job FAILED with error_reason; Meeting FAILED (BRQ-008/010).
// Setup -> Action -> Assert
// (Implement against the endpoint / worker handler in task-be.md.)
```

### T07. NFR-002 — Async; non-blocking UI..
```ts
// NFR-002: Async; non-blocking UI.
// Setup -> Action -> Assert
// (Implement against the endpoint / worker handler in task-be.md.)
```

### T08. NFR-003 — No SLA at MVP..
```ts
// NFR-003: No SLA at MVP.
// Setup -> Action -> Assert
// (Implement against the endpoint / worker handler in task-be.md.)
```

### T09. NFR-004 — RU + EN..
```ts
// NFR-004: RU + EN.
// Setup -> Action -> Assert
// (Implement against the endpoint / worker handler in task-be.md.)
```

### T10. NFR-006 — Markdown canonical; PDF transient (re-rendered)..
```ts
// NFR-006: Markdown canonical; PDF transient (re-rendered).
// Setup -> Action -> Assert
// (Implement against the endpoint / worker handler in task-be.md.)
```

### T11. NFR-008 — Failures surfaced; terminal immutable..
```ts
// NFR-008: Failures surfaced; terminal immutable.
// Setup -> Action -> Assert
// (Implement against the endpoint / worker handler in task-be.md.)
```

## Integration tests

- Full job lifecycle: enqueue payload -> worker handles -> COMPLETED with correct Transcript/Protocol persisted.
- Failure path: stub provider to throw -> job FAILED with error_reason, Meeting.status FAILED, no re-enqueue.
- Concurrency: BullMQ concurrency=1 honored per NFR-009.

## Verification command

```bash
pnpm --filter api test -- uc-300
# or, for workers:
pnpm --filter worker test -- uc-300
```

