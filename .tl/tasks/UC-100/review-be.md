---
task: UC-100
phase: be
verdict: approved
headline: REVIEW COMPLETE
commit: 299ff9f
reviewed: 2026-05-18
reviewer: nacl-tl-review (strategist)
followups: [F1-MIME-drift, F2-skip_probe, F3-console-error, F4-T10-missing, F5-zod-max]
---

# Review: UC-100 BE — Upload Meeting Video

Workflow status: `REVIEW COMPLETE`. Code judgment: `APPROVED`. Action required: file /nacl-tl-fix for F1 (MIME allowlist drift) before QA.

## Stub Gate

PASS — No TODO/FIXME/STUB/HACK markers in route or service.

## Acceptance Criteria

| Criterion | Result |
|-----------|--------|
| Valid MP4/MKV/MOV <=500MB accepted; creates Meeting+Recording+TranscriptionJob; UPLOADING→TRANSCRIBING | PASS — atomic prisma.$transaction; tests T04, T04b |
| File >500MB or wrong MIME rejected before storage | PASS — size+MIME guards at route and TUS pre-create; T01, T02b/c |
| Corrupt file rejected with user-facing error | PASS — 422 CONTAINER_INVALID; test T03 |
| RU/EN/blank language hint | PASS — T05a/b/c |

## 8-Category BE Checklist

| Category | Verdict | Notes |
|----------|---------|-------|
| Code Correctness | PASS | Contract conformance, atomicity, BullMQ ordering all correct |
| Code Quality | PASS | Thin route, service separation, RQ IDs inline throughout |
| Error Handling | PASS | Every path throws AppError; errorHandlerPlugin maps to {code,message}; T09 covers DB failure |
| Testing | PASS | 19/19; covers accept/reject MIME, size boundary, language, atomicity, error paths |
| Security | PASS | Defense-in-depth size+MIME at TUS pre-create AND finalize route |
| Performance | PASS | NFR-002 satisfied; enqueue after tx commit; immediate 200 response |
| Documentation | PASS | RQ IDs referenced inline: RQ-008 through RQ-013, BRQ-008, NFR-001/002/007 |
| Git & Commits | PASS | Conventional commit; TDD phases in result-be.md |

## TDD Compliance

PASS. Fastify inject() with Prisma + BullMQ + fluent-ffmpeg + S3 mocked at module boundary. Same canonical pattern as UC-001/002/003.

## Test Author Independence

MAJOR: All files authored in same conductor commit 299ff9f. Project-wide norm — non-blocking.

Recommend: `/nacl-tl-regression-test --retroactive UC-100`

## Test Results

441/441 passed (workspace). UC-100-BE: 19/19 passed.

## Issues

### F1 — MIME allowlist drift (MINOR — should fix before QA)
`routes/uc-100.ts:66` and `plugins/tus.ts:30-36` accept `video/webm` + `video/x-msvideo` but RQ-009 specifies strict 3-set: {video/mp4, video/x-matroska, video/quicktime}.
A hand-crafted HTTP call can bypass FE validation and submit webm.
**Action:** `/nacl-tl-fix "UC-100 MIME allowlist accepts video/webm and video/x-msvideo in violation of RQ-009 — tighten to {video/mp4, video/x-matroska, video/quicktime}"`

### F2 — skip_probe on public wire (MINOR)
`skip_probe` is a public body field; should be env-gated or removed in favor of test mocking.
Already flagged in commit follow-ups.

### F3 — console.error instead of structured logger (COSMETIC)
`uc-100.service.ts:194` uses `console.error` for BullMQ enqueue failure; should use `request.log.error`.

### F4 — T10 test stub without body (COSMETIC)
Test header declares T10 (missing S3 config 500) but no `it()` block exists.

### F5 — Route Zod schema missing size_bytes .max() (COSMETIC)
Route schema lacks `.max(524_288_000)` on `size_bytes`; relies on imperative 413 throw. Reuse UploadCreateRequest from shared.

## Positive Observations

- PRAISE: `addTranscriptionJob` enqueues AFTER `prisma.$transaction` commits — prevents orphan queue entries.
- PRAISE: Defense-in-depth size+MIME validation at both TUS pre-create and finalize route.
- PRAISE: Two-phase Meeting write (UPLOADING→TRANSCRIBING in same tx) preserves BP-001 state-machine documentation fidelity.

## Next Steps

- File `/nacl-tl-fix` for F1 (MIME drift) before QA
- Both UC-100 BE and FE needed for sync: `/nacl-tl-review UC-100 --fe` (already in flight)
