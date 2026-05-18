# UC-302 — Backend Test Spec

**UC:** Export protocol to PDF  ·  **Wave:** 5

Test framework: **Vitest** + supertest (HTTP) / BullMQ test harness (worker).

Each test references an RQ ID. Add new tests when adding new RQs.

## Test scenarios

### T01. RQ-032 — PDF export is transient: rendered PDF MUST NOT be persisted (BRQ-017); each export re-renders from canonical Markdown (BRQ-018)..
```ts
// RQ-032: PDF export is transient: rendered PDF MUST NOT be persisted (BRQ-017); each export re-renders from canonical Markdown (BRQ-018).
// Setup -> Action -> Assert
// (Implement against the endpoint / worker handler in task-be.md.)
```

### T02. RQ-033 — Exported PDF MUST include the four required sections (BRQ-011).
```ts
// RQ-033: Exported PDF MUST include the four required sections (BRQ-011). On render failure, no file delivered and no state change persisted.
// Setup -> Action -> Assert
// (Implement against the endpoint / worker handler in task-be.md.)
```

## Integration tests

- Endpoint smoke: each endpoint returns the documented success shape under happy-path setup.
- Each error code in `api-contract.md` is reachable via at least one negative test.
- Status-driven gating (RQ-005 / RQ-029) covered by parametrized tests over MeetingStatus enum values.

## Verification command

```bash
pnpm --filter api test -- uc-302
# or, for workers:
pnpm --filter worker test -- uc-302
```

