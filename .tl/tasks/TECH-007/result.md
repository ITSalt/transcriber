---
task: TECH-007
type: tech
status: ready_for_review
commit: 2ae611f
completed: 2026-05-18
test_run: pnpm test (vitest run)
---

# Result: TECH-007 — S3/MinIO Storage Adapter

## Implemented

`IS3Adapter` interface defined in `shared/` with `put`, `get`, `delete`, and `getSignedUrl` methods. `S3Adapter` implementation in `api/src/storage/s3-adapter.ts` uses `@aws-sdk/client-s3` with path-style addressing for MinIO compatibility. Storage URI format follows `s3://bucket/key` convention per ADR-004. Adapter is injectable for testing.

## Files

- `api/src/storage/s3-adapter.ts`
- `api/src/storage/index.ts`
- `shared/src/storage/types.ts`
- `api/src/storage/s3-adapter.test.ts`

## Tests

- Test file: `api/src/storage/s3-adapter.test.ts`
- Tests: 19 passed, 0 failed
- Notable cases: `put` uploads buffer with correct content-type, `getSignedUrl` produces pre-signed URL, `delete` handles missing key gracefully

## Verification

441/441 tests pass. Typecheck clean. MinIO swap to AWS S3/R2 requires only env-var changes.
