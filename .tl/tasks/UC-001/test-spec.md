# UC-001 — Backend Test Spec

**UC:** View meeting catalog  ·  **Wave:** 1

Test framework: **Vitest** + supertest (HTTP) / BullMQ test harness (worker).

Each test references an RQ ID. Add new tests when adding new RQs.

## Test scenarios

### T01. RQ-001 — Meeting catalog MUST sort meetings by updated_at descending..
```ts
// RQ-001: Meeting catalog MUST sort meetings by updated_at descending.
// Setup -> Action -> Assert
// (Implement against the endpoint / worker handler in task-be.md.)
```

### T02. RQ-002 — Meeting rows in transient statuses (UPLOADING, TRANSCRIBING, PROTOCOL_GENERATING) MUST auto-refresh their status without requiring a full page reload..
```ts
// RQ-002: Meeting rows in transient statuses (UPLOADING, TRANSCRIBING, PROTOCOL_GENERATING) MUST auto-refresh their status without requiring a full page reload.
// Setup -> Action -> Assert
// (Implement against the endpoint / worker handler in task-be.md.)
```

### T03. RQ-003 — AUTHOR sees only own meetings (BRQ-016).
```ts
// RQ-003: AUTHOR sees only own meetings (BRQ-016). Enforcement deferred until auth is added (NFR-007); MVP semantically equivalent to 'all'.
// Setup -> Action -> Assert
// (Implement against the endpoint / worker handler in task-be.md.)
```

### T04. NFR-007 — MVP runs without authentication; single trust boundary..
```ts
// NFR-007: MVP runs without authentication; single trust boundary.
// Setup -> Action -> Assert
// (Implement against the endpoint / worker handler in task-be.md.)
```

## Integration tests

- Endpoint smoke: each endpoint returns the documented success shape under happy-path setup.
- Each error code in `api-contract.md` is reachable via at least one negative test.
- Status-driven gating (RQ-005 / RQ-029) covered by parametrized tests over MeetingStatus enum values.

## Verification command

```bash
pnpm --filter api test -- uc-001
# or, for workers:
pnpm --filter worker test -- uc-001
```

