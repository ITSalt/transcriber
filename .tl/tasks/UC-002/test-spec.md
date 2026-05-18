# UC-002 — Backend Test Spec

**UC:** View meeting detail  ·  **Wave:** 2

Test framework: **Vitest** + supertest (HTTP) / BullMQ test harness (worker).

Each test references an RQ ID. Add new tests when adding new RQs.

## Test scenarios

### T01. RQ-002 — Auto-refresh status without full page reload..
```ts
// RQ-002: Auto-refresh status without full page reload.
// Setup -> Action -> Assert
// (Implement against the endpoint / worker handler in task-be.md.)
```

### T02. RQ-003 — AUTHOR sees only own meetings (deferred per NFR-007)..
```ts
// RQ-003: AUTHOR sees only own meetings (deferred per NFR-007).
// Setup -> Action -> Assert
// (Implement against the endpoint / worker handler in task-be.md.)
```

### T03. RQ-004 — Meeting detail MUST surface the current job's error_reason when Meeting.status=FAILED..
```ts
// RQ-004: Meeting detail MUST surface the current job's error_reason when Meeting.status=FAILED.
// Setup -> Action -> Assert
// (Implement against the endpoint / worker handler in task-be.md.)
```

### T04. RQ-005 — Action links gated by status: 'View transcript' enabled in {TRANSCRIPT_READY, PROTOCOL_GENERATING, PROTOCOL_READY, EDITED}; 'Review/Edit protocol' enabled in {PROTOCOL_READY, EDITED}; 'Export PDF' enabled in {PROTOCOL_READY, EDITED}..
```ts
// RQ-005: Action links gated by status: 'View transcript' enabled in {TRANSCRIPT_READY, PROTOCOL_GENERATING, PROTOCOL_READY, EDITED}; 'Review/Edit protocol' enabled in {PROTOCOL_READY, EDITED}; 'Export PDF' enabled in {PROTOCOL_READY, EDITED}.
// Setup -> Action -> Assert
// (Implement against the endpoint / worker handler in task-be.md.)
```

### T05. NFR-007 — MVP no-auth single trust boundary..
```ts
// NFR-007: MVP no-auth single trust boundary.
// Setup -> Action -> Assert
// (Implement against the endpoint / worker handler in task-be.md.)
```

## Integration tests

- Endpoint smoke: each endpoint returns the documented success shape under happy-path setup.
- Each error code in `api-contract.md` is reachable via at least one negative test.
- Status-driven gating (RQ-005 / RQ-029) covered by parametrized tests over MeetingStatus enum values.

## Verification command

```bash
pnpm --filter api test -- uc-002
# or, for workers:
pnpm --filter worker test -- uc-002
```

