# UC-003 — Backend Test Spec

**UC:** Delete meeting  ·  **Wave:** 3

Test framework: **Vitest** + supertest (HTTP) / BullMQ test harness (worker).

Each test references an RQ ID. Add new tests when adding new RQs.

## Test scenarios

### T01. RQ-003 — Ownership scope (deferred per NFR-007)..
```ts
// RQ-003: Ownership scope (deferred per NFR-007).
// Setup -> Action -> Assert
// (Implement against the endpoint / worker handler in task-be.md.)
```

### T02. RQ-006 — Meeting deletion MUST cascade-remove Protocol, ProtocolGenerationJob, Transcript, TranscriptionJob, Recording (incl.
```ts
// RQ-006: Meeting deletion MUST cascade-remove Protocol, ProtocolGenerationJob, Transcript, TranscriptionJob, Recording (incl. storage object in EXT-04), and the Meeting itself.
// Setup -> Action -> Assert
// (Implement against the endpoint / worker handler in task-be.md.)
```

### T03. RQ-007 — Deletion while a job is IN_PROGRESS MUST require confirmation and MUST mark the in-flight job FAILED with error_reason='deleted by user'.
```ts
// RQ-007: Deletion while a job is IN_PROGRESS MUST require confirmation and MUST mark the in-flight job FAILED with error_reason='deleted by user'. Already-terminal jobs preserve BRQ-009 immutability.
// Setup -> Action -> Assert
// (Implement against the endpoint / worker handler in task-be.md.)
```

### T04. NFR-007 — MVP no-auth..
```ts
// NFR-007: MVP no-auth.
// Setup -> Action -> Assert
// (Implement against the endpoint / worker handler in task-be.md.)
```

## Integration tests

- Endpoint smoke: each endpoint returns the documented success shape under happy-path setup.
- Each error code in `api-contract.md` is reachable via at least one negative test.
- Status-driven gating (RQ-005 / RQ-029) covered by parametrized tests over MeetingStatus enum values.

## Verification command

```bash
pnpm --filter api test -- uc-003
# or, for workers:
pnpm --filter worker test -- uc-003
```

