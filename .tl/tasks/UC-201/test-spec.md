# UC-201 — Backend Test Spec

**UC:** View and download transcript  ·  **Wave:** 3

Test framework: **Vitest** + supertest (HTTP) / BullMQ test harness (worker).

Each test references an RQ ID. Add new tests when adding new RQs.

## Test scenarios

### T01. RQ-019 — Transcript view MUST display each segment with its speaker label (resolved from speaker_map or 'Speaker N') and minute/second timestamps..
```ts
// RQ-019: Transcript view MUST display each segment with its speaker label (resolved from speaker_map or 'Speaker N') and minute/second timestamps.
// Setup -> Action -> Assert
// (Implement against the endpoint / worker handler in task-be.md.)
```

### T02. RQ-020 — Download produces a plain-text file (.txt) with verbatim transcript + speaker labels + timestamps.
```ts
// RQ-020: Download produces a plain-text file (.txt) with verbatim transcript + speaker labels + timestamps. Filename: '<meeting-title>-transcript.txt' (or filename fallback when title is null).
// Setup -> Action -> Assert
// (Implement against the endpoint / worker handler in task-be.md.)
```

## Integration tests

- Endpoint smoke: each endpoint returns the documented success shape under happy-path setup.
- Each error code in `api-contract.md` is reachable via at least one negative test.
- Status-driven gating (RQ-005 / RQ-029) covered by parametrized tests over MeetingStatus enum values.

## Verification command

```bash
pnpm --filter api test -- uc-201
# or, for workers:
pnpm --filter worker test -- uc-201
```

