# UC-301 — Backend Test Spec

**UC:** Review and edit protocol  ·  **Wave:** 4

Test framework: **Vitest** + supertest (HTTP) / BullMQ test harness (worker).

Each test references an RQ ID. Add new tests when adding new RQs.

## Test scenarios

### T01. RQ-027 — Each save increments version by exactly 1 (BRQ-014); monotonic..
```ts
// RQ-027: Each save increments version by exactly 1 (BRQ-014); monotonic.
// Setup -> Action -> Assert
// (Implement against the endpoint / worker handler in task-be.md.)
```

### T02. RQ-028 — Each save increments edit_count by exactly 1 (BRQ-015); equals manual-save count since generation..
```ts
// RQ-028: Each save increments edit_count by exactly 1 (BRQ-015); equals manual-save count since generation.
// Setup -> Action -> Assert
// (Implement against the endpoint / worker handler in task-be.md.)
```

### T03. RQ-029 — First save: Meeting.status PROTOCOL_READY -> EDITED (BRQ-008).
```ts
// RQ-029: First save: Meeting.status PROTOCOL_READY -> EDITED (BRQ-008). Subsequent saves keep status=EDITED. last_edited_at updated every save.
// Setup -> Action -> Assert
// (Implement against the endpoint / worker handler in task-be.md.)
```

### T04. RQ-030 — Edits operate on canonical Markdown (BRQ-018); preview is a derivation, never persisted..
```ts
// RQ-030: Edits operate on canonical Markdown (BRQ-018); preview is a derivation, never persisted.
// Setup -> Action -> Assert
// (Implement against the endpoint / worker handler in task-be.md.)
```

### T05. RQ-031 — Editor warns AUTHOR before navigating away with unsaved changes..
```ts
// RQ-031: Editor warns AUTHOR before navigating away with unsaved changes.
// Setup -> Action -> Assert
// (Implement against the endpoint / worker handler in task-be.md.)
```

## Integration tests

- Endpoint smoke: each endpoint returns the documented success shape under happy-path setup.
- Each error code in `api-contract.md` is reachable via at least one negative test.
- Status-driven gating (RQ-005 / RQ-029) covered by parametrized tests over MeetingStatus enum values.

## Verification command

```bash
pnpm --filter api test -- uc-301
# or, for workers:
pnpm --filter worker test -- uc-301
```

