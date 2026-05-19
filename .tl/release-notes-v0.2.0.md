## Features

- **UC-100: Replace TUS with direct S3 presigned multipart upload**
  Browser uploads parts directly to MinIO using presigned PUT URLs with 4 concurrent streams (10 MB/part).
  - `POST /api/uploads/init` — validate, create S3 multipart, return presigned part URLs
  - `POST /api/uploads/complete` — complete S3 multipart, run ffprobe + DB + BullMQ
  - `POST /api/uploads/abort` — abort in-progress multipart
  - Expected speedup for 500 MB files: 3-5x vs single-stream TUS

## Removed

- `@tus/server`, `@tus/s3-store` (api)
- `tus-js-client` (web)
- TUS PATCH endpoint and related infrastructure

## Configuration

- New env var `S3_PUBLIC_ENDPOINT`: browser-reachable MinIO URL (set if MinIO is behind reverse proxy)
- New env var `MINIO_API_CORS_ALLOW_ORIGIN`: required for browser to MinIO CORS on PUT requests

## Verification gaps

- UC-100-BE: done | evidence: unknown (no RED to GREEN artifact in graph)
- UC-100-FE: done | evidence: unknown (no RED to GREEN artifact in graph)

Full changelog: `.tl/changelog.md`
