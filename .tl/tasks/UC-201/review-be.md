# UC-201 BE — Code Review

**Reviewer:** strategist
**Date:** 2026-05-18
**Commit:** 473000a
**Verdict:** APPROVED

## Summary

GET `/api/meetings/:id/transcript` and GET `/api/meetings/:id/transcript/download`
ship cleanly against `api-contract.md`. JSON endpoint returns the full
`TranscriptResponse` DTO; download endpoint streams plain text with a
`Content-Disposition: attachment` header. All 8 review categories pass with no
blockers or major substantive issues. One MAJOR informational flag: 100% test
author overlap (single-author implementation + tests, per conductor workflow).

## Test results

- `pnpm test` from project root: **457 passed, 7 skipped** (matches expected).
- UC-201 route tests: 21 cases covering T01-T13 plus parameterised expansions.
- All RQ-019 / RQ-020 acceptance scenarios covered in `api/src/routes/uc-201.test.ts`.

## 8-category review

### 1. Spec conformance — PASS

- RQ-019 satisfied: JSON shape matches the `TranscriptResponse` Zod schema in `shared/src/api/uc201.ts`. `full_text` carries speaker labels + minute:second timestamps (mock asserts on `[00:00] Speaker 1: Hello everyone.`).
- RQ-020 satisfied: download returns `text/plain; charset=utf-8` with `Content-Disposition: attachment; filename="<title>-transcript.txt"`. Title-absent fallback to recording filename verified by T10.
- Error contract conforms to `api-contract.md`: 404 `TRANSCRIPT_NOT_FOUND`, 409 `STATUS_NOT_READY`, 500 `INTERNAL_ERROR`, 400 `VALIDATION_ERROR` (Zod).
- NFR-007 (no auth at MVP) honoured — no auth checks; T06 covers reachability.
- BRQ-008 status gate respected: `TRANSCRIPT_READY_STATUSES = {TRANSCRIBED, GENERATING_PROTOCOL, PROTOCOL_READY, EDITED}` matches BA semantics for `Meeting.status >= TRANSCRIPT_READY`.

### 2. Architecture and conventions — PASS

- Route/service split is clean: `uc-201.ts` is thin and delegates to `uc-201.service.ts`.
- Uses Fastify `withTypeProvider<ZodTypeProvider>()` and imports the shared Zod schema from `@transcrib/shared` (no inline DTOs in BE).
- No vendor SDK leakage. Prisma is the only DB driver in scope.
- Storage URI convention preserved: `filenameWithoutExt` parses `s3://bucket/key` (ADR-004).
- Route registration order is correct: `/download` is registered BEFORE the JSON endpoint (annotated in source) so Fastify does not match `download` as a UUID param.

### 3. Error handling — PASS

- All thrown errors are `AppError(code, http, message)` per TECH-005.
- Outer `try/catch` re-throws `AppError` unchanged and wraps unknown failures as `INTERNAL_ERROR` (T07 verifies).
- 404 distinguishes "meeting missing" vs. "transcript row missing" at message level while keeping the stable code `TRANSCRIPT_NOT_FOUND` — acceptable per contract.

### 4. Security — PASS

- Filename sanitiser `sanitizeFilename` strips `[^a-zA-Z0-9_\-().]` and collapses repeats, blocking header injection and path traversal in `Content-Disposition`.
- Zod UUID validation on `:id` blocks arbitrary string injection (T08).
- No raw SQL, no user input passed unfiltered to Prisma.

### 5. Performance — PASS

- One `findUnique` per request with a relation include — appropriate for 1:1 `Meeting`↔`Transcript`.
- Walking `segmentsBlob` for `speakers_count` is O(n) over segments; JSONB lives co-located with the row, so no extra round-trip. UC-200 bounds segment counts to typical ASR output.
- Download payload is assembled from `rawText` (already persisted) — no per-request transcoding.
- Minor observation (not blocking): download uses `reply.send(content)` rather than a true `pipe` stream. Fine for MVP given typical text-only transcript sizes; flag for revisit if transcripts grow to many MB.

### 6. Tests — PASS (with MAJOR informational flag)

- TDD pattern claimed in `result-be.md`; numbered T01-T13 test layout supports the claim.
- Coverage:
  - Happy-path JSON (T01) and download (T02) with body assertions.
  - 404 split: meeting-missing (T03) and transcript-row missing (T04).
  - 409 status gating: positive (T12 over TRANSCRIBED, GENERATING_PROTOCOL, PROTOCOL_READY) and negative (T13 over CREATED, UPLOADING, UPLOADED, TRANSCRIBING).
  - DB failure → 500 (T07); invalid UUID → 400 (T08).
  - Filename: title-based (T09) and recording fallback (T10).
  - Empty speaker_map → null (T11).
- Every `api-contract.md` error row is reachable from at least one test.
- **MAJOR (informational):** 100% test author overlap — commit 473000a "Transcrib Conductor" authored both `uc-201.ts`, `uc-201.service.ts`, and `uc-201.test.ts`. Per UC-200 precedent and conductor-workflow operator override, this is NOT a blocker. Adversarial coverage to be reaffirmed at the QA gate (`/nacl-tl-qa UC-201`).

### 7. Documentation — PASS

- Every requirement-bearing line carries an inline `RQ-###` comment (e.g., `// RQ-020: Content-Disposition…`).
- Service-level doc-comment lists thrown `AppError` codes; route file documents the `/download` registration-order rationale.
- `result-be.md` accurately enumerates files, test counts, and tied requirements.

### 8. Definition of done — PASS

- [x] Endpoints implemented per `api-contract.md`.
- [x] RQ-019, RQ-020 covered by tests in `test-spec.md`.
- [x] No new migrations required (read-only over existing Transcript table from UC-200).
- [x] All errors map to `AppError` (TECH-005).
- [x] No SA-doc lookups in source — RQ IDs cited inline.
- [ ] BE/FE sync (`/nacl-tl-sync UC-201`) — deferred to post-review phase per workflow.

## Issues

- 0 blocker
- 0 critical
- 0 major (substantive)
- 1 major (informational): 100% test author overlap — operator-override precedent applied
- 0 minor

## Files reviewed

- `C:\projects\transcrib\api\src\routes\uc-201.ts`
- `C:\projects\transcrib\api\src\services\uc-201.service.ts`
- `C:\projects\transcrib\api\src\routes\uc-201.test.ts`
- `C:\projects\transcrib\shared\src\api\uc201.ts`
- `C:\projects\transcrib\api\src\server.ts` (registration order verified)

## Recommendation

APPROVED. Proceed to FE review and then `/nacl-tl-sync UC-201`.
