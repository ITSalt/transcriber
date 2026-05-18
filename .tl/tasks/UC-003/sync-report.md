---
task: UC-003
phase: sync
verdict: PASS
verified: 2026-05-18
---
# Sync Check: UC-003 Delete Meeting

## Contract Points

### 1. Endpoint URL

Contract: `DELETE /api/meetings/:id`

BE (`api/src/routes/uc-003.ts`): Registers `DELETE /api/meetings/:id` via Fastify route.
FE (`web/src/routes/meeting/hooks/useDeleteMeeting.ts`): Calls `apiDelete(`/api/meetings/${meetingId}`, MeetingDeleteResponse)`.

Result: MATCH

---

### 2. Response Shape

Contract (`shared/src/api/uc003.ts`):
```ts
MeetingDeleteResponse = z.object({
  deleted: z.literal(true),
  in_flight_failed: z.boolean(),
})
```

BE: Route declares `response: { 200: MeetingDeleteResponse }` and service returns `{ deleted: true, in_flight_failed: hasInFlight }`.
FE: Hook passes `MeetingDeleteResponse` Zod schema to `apiDelete()` for runtime parsing.

Result: MATCH — both sides import and use the same Zod schema from `@transcrib/shared`.

---

### 3. HTTP Status Code

Contract: 200 on success.

BE: `reply.status(200).send(result)`.
FE: `apiDelete` uses the generic `request()` helper which throws `ApiError` on non-ok status; 200 is treated as success.

Result: MATCH

---

### 4. Error Handling Contract

Contract errors:
- 404 `MEETING_NOT_FOUND` — id does not exist
- 500 `STORAGE_DELETE_FAILED` — EXT-04 object removal failed
- 500 `INTERNAL_ERROR` — unhandled

BE: `AppError('MEETING_NOT_FOUND', 404, ...)`, `AppError('STORAGE_DELETE_FAILED', 500, ...)`, `AppError('INTERNAL_ERROR', 500, ...)` thrown from service and mapped by TECH-005 error handler. Confirmed by T02, T06, T09 in test suite.

FE: `useDeleteMeeting` has a single `onError` handler that shows a destructive toast. `ApiError` is thrown by `apiDelete` on any non-ok response. No code-specific branching — all errors produce the same toast. This is acceptable per the contract (no FE-specific 404 vs. 500 handling is required by the spec).

Result: MATCH — FE handles errors generically as specified; no contract violation.

---

### 5. Shared Zod Schema Usage

Both sides import from `@transcrib/shared`:
- BE imports `MeetingDeleteResponse` (runtime Zod schema) for Fastify response validation.
- FE imports `MeetingDeleteResponse` (same export) for `apiDelete()` response parsing.
- No inline types, no mocks, no `fetch` calls in components.

Result: MATCH — shared types used correctly by both sides per the contract.

---

### 6. RQ-007 In-Flight Job Detection

Contract: If any job is `IN_PROGRESS` at delete time, BE returns `in_flight_failed: true`; FE shows a warning in the confirmation dialog.

BE: Service checks `status === 'PROCESSING'` against Prisma models (JobStatus enum value `PROCESSING`). Returns `in_flight_failed: true` when at least one such job exists.

FE: `meeting/index.tsx` derives `jobInProgress` by checking `data?.latest_transcription_job?.status === "PROCESSING" || data?.latest_protocol_job?.status === "PROCESSING"`. This matches `JobStatus.PROCESSING` from `shared/src/enums.ts`. The `StatusSection` component renders `data-testid="delete-dialog-inflight-warning"` when `jobInProgress` is true.

Note: The task spec prose uses the term `IN_PROGRESS` while the actual `JobStatus` enum in `shared/src/enums.ts` uses `PROCESSING`. Both BE and FE correctly reference the actual enum value `PROCESSING`. The spec prose is a doc-level naming inconsistency that does not affect runtime behavior.

Result: MATCH

---

### 7. Post-Delete Navigation

Contract (acceptance.md): On success, user is returned to catalog (UC-001) with a confirmation toast.

FE: `onSuccess` in `useDeleteMeeting` calls `navigate("/catalog")` and fires a toast with `t("meeting.delete.successTitle")`. Confirmed by FE test "navigates to /catalog after successful delete".

Result: MATCH

---

### 8. Test Suite Status

`pnpm test` result: 455 passed, 7 skipped, 0 failed.
- All 10 UC-003-BE tests (T01-T10) pass.
- All UC-003-FE tests in `web/src/routes/meeting/index.test.tsx` pass (including delete dialog, in-flight warning, cancel, navigation).

Result: PASS

---

## Summary

All contract points align. BE and FE use shared Zod schemas exclusively. Endpoint URL, response shape, HTTP status, and error handling are consistent. The `in_flight_failed` flag flows correctly from BE service through the API response to the FE confirmation dialog. Tests are green.

Verdict: PASS
