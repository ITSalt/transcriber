# External Contract — `s3-multipart-presigned`

> **What this file is.** The wire protocol between the browser, the api/ Fastify
> server, and the S3-compatible object store (MinIO in dev, Cloud.ru S3 in prod)
> for chunked upload of meeting video files. This contract REPLACES the TUS
> protocol described in graph ADR-005 (revoked 2026-05-22 in W3; succeeded by
> ADR-012). See changelog [2026-05-19] ed6aaa9 for the code-side removal.

## 1. Identity

| Field | Value |
|---|---|
| **Name** | `s3-multipart-presigned` |
| **Kind** | `protocol` |
| **Owner skill** | `nacl-sa-architect` |
| **Consumed by** | `nacl-tl-plan`, `nacl-tl-sync` (W2), `nacl-tl-qa`, `nacl-tl-dev-be`, `nacl-tl-dev-fe` |
| **Created** | `2026-05-22` (post-W11 strict mode); replaces TUS (ADR-005 revoked) |
| **Last updated** | `2026-05-22` |
| **References** | UC-100 (Upload meeting video), TECH-007, TECH-016, TECH-021, ADR-004 (object storage), ADR-012 (new — S3 multipart adoption), `api/src/routes/upload-{init,complete,abort}.ts`, `api/src/storage/s3-adapter.ts`, AWS S3 Multipart Upload API |

## 2. Endpoint

| Field | Value |
|---|---|
| **Base URL** | `https://transcriber.itsalt.ru/api/uploads` (server) + presigned PUT URLs against MinIO/S3 (browser → S3 direct) |
| **All endpoints** | `POST /api/uploads/init` — create multipart upload, return presigned PUT URLs per part. `POST /api/uploads/complete` — finalize with collected ETags. `POST /api/uploads/abort` — abort an in-flight upload. **Browser-only**: `PUT <presigned-url>` per part (direct to S3). |
| **Discovery** | `static-catalog` |
| **Versioning** | Unversioned API path; AWS S3 Multipart Upload v2 protocol (S3-compatible). |

## 3. Auth

| Field | Value |
|---|---|
| **Scheme** | Server-side: S3 SigV4 (computed by `@aws-sdk/s3-request-presigner` from `S3_KEY` + `S3_SECRET`). Browser-side: none — presigned URL embeds signature. |
| **Secret env var** | `S3_KEY`, `S3_SECRET`, `S3_ENDPOINT`, `S3_BUCKET`, `S3_REGION`, `S3_PUBLIC_ENDPOINT` (browser-reachable URL — may differ from server-internal) |
| **Missing-secret behavior** | api server fails at boot; `nacl-tl-qa` LOCAL_RUNTIME_QA fails until env complete. |
| **Rotation** | Cloud.ru: rotate via console; update `/opt/transcrib/.env`; restart pm2 transcrib-api. Postmortem reference: 2026-05-18 InvalidAccessKeyId fix (NO_INFRA L0). |

## 4. Request shape

### Browser → api: POST /api/uploads/init

```jsonc
Content-Type: application/json
{
  "filename": "meeting-2026-05-22.mp4",
  "filetype": "video/mp4",     // ← canonical MIME key per BRQ-002; bug 29c175a fixed this
  "size_bytes": 524288000,     // ≤ 1 GiB per RQ-008 (raised in 1b94f5b)
  "title": "Q2 planning"
}
```

### Browser → S3: PUT <presigned-url> (per part)

```
Content-Type: <inferred by S3>
Body: 10 MB binary chunk
Headers: presigned URL embeds the signature
```

### Browser → api: POST /api/uploads/complete

```jsonc
{
  "s3_key": "pending/<uuid>.mp4",
  "s3_upload_id": "<aws-multipart-upload-id>",
  "parts": [
    { "part_number": 1, "etag": "\"<aws-etag-1>\"" },
    { "part_number": 2, "etag": "\"<aws-etag-2>\"" }
  ],
  "language": "ru" | "en" | null,    // null = auto-detect (ad7b8b4)
  "speaker_count": 3 | null          // optional (ad7b8b4)
}
```

### Browser → api: POST /api/uploads/abort

```jsonc
{ "s3_key": "...", "s3_upload_id": "..." }
```

## 5. Response shape

### POST /api/uploads/init → 200 OK

```jsonc
{
  "s3_key": "pending/<uuid>.<ext>",
  "s3_upload_id": "<aws-multipart-upload-id>",
  "part_size": 10485760,
  "parts": [
    { "part_number": 1, "url": "https://<S3_PUBLIC_ENDPOINT>/...?<sigv4>" },
    ...
  ]
}
```

### POST /api/uploads/complete → 200 OK

```jsonc
{
  "meeting_id": "<uuid>",
  "status": "TRANSCRIBING"     // Meeting moves UPLOADED → TRANSCRIBING
}
```

### POST /api/uploads/abort → 204 No Content

### PUT to S3 → 200 OK

Response headers: `ETag: "<aws-etag>"` (browser MUST capture and send to /complete).

## 6. Lifecycle: sync vs async

| Field | Value |
|---|---|
| **Mode** | `sync` per HTTP call. The multi-step lifecycle (init → N×PUT → complete) is serially synchronous on the browser side; presigned URLs expire after `PRESIGN_EXPIRES_SEC=3600` (1h). |
| **Cancellation** | Browser may call `/api/uploads/abort` at any point to release the in-flight S3 multipart upload. |

## 7. File-URL reachability assumptions

| Field | Value |
|---|---|
| **Scheme expected by consumers** | Browser MUST receive `https://...` presigned URLs (Caddy reverse-proxy + Let's Encrypt). In dev: `http://localhost:9000/...` is acceptable. |
| **Reverse-proxy translation** | `S3_PUBLIC_ENDPOINT` env var carries the browser-facing URL; `S3_ENDPOINT` carries the server-internal URL. The presigner uses `S3_PUBLIC_ENDPOINT` when generating browser-facing PUT URLs. |
| **Public origin vs origin server** | Presigned URLs always use the public origin; otherwise S3 SigV4 signature mismatch. |
| **Lifetime** | 1 hour per presigned PUT (configurable via `PRESIGN_EXPIRES_SEC`). |
| **Toolchain compatibility** | After /complete lands, worker fetches the audio for ffmpeg/ffprobe via a NEW presigned **GET** URL (NOT `s3://...` scheme — ffprobe rejects it; fix 5d9585d). |

## 8. Failure codes

| Code | Meaning | Consumer action |
|---|---|---|
| `400` | bad filetype/size_bytes/MIME in init or complete | halt; surface specific validation error |
| `401/403` | server S3 credentials invalid (InvalidAccessKeyId) | halt; ops rotates credentials |
| `404` | s3_upload_id not found in complete (expired or aborted) | halt; retry by recreating |
| `413` | size_bytes > 1 GiB | halt; surface `FILE_TOO_LARGE` (RQ-008) |
| `415` | unsupported MIME (not in `EXT_MAP` mp4/mkv/mov/webm) | halt; surface `UNSUPPORTED_TYPE` |
| `500 STORAGE_WRITE_FAILED` | S3 service error during createMultipartUpload or presign | halt; abort multipart; surface |
| `S3 503 SlowDown` (PUT) | S3 throttle | browser retries with backoff |
| `presigned URL expired (S3 403)` | upload took > 1h | call /init again; restart |

## 9. Model namespace / catalog

`N/A — not a provider; protocol only.`

## 10. Fixture-test path

| Field | Value |
|---|---|
| **Fixture file** | `api/test/fixtures/s3-multipart-init-response.json` + `api/test/fixtures/s3-multipart-complete-response.json` (W6) |
| **Test file** | `api/test/wire/s3-multipart.fixture.test.ts` (W6) |
| **What it asserts** | init/complete handlers correctly serialize requests + parse S3 multipart upload responses via real `@aws-sdk/client-s3` SDK calls against a recorded fixture. Browser-side: web/test/wire/s3-multipart.fixture.test.ts asserts the upload coordinator handles the 3-step lifecycle. |
| **Run command** | `pnpm --filter @transcrib/api run test -- s3-multipart` |

## 11. Smoke-test path

| Field | Value |
|---|---|
| **Smoke test file** | `api/test/smoke/s3-multipart.smoke.test.ts` (W6) |
| **Env vars required** | `S3_KEY`, `S3_SECRET`, `S3_ENDPOINT`, `S3_BUCKET`, `S3_REGION`, `S3_PUBLIC_ENDPOINT` |
| **Sandbox vs prod** | Smoke runs against the configured S3 (MinIO in dev / Cloud.ru in prod). |
| **Run command** | `pnpm --filter @transcrib/api run smoke -- s3-multipart` |
| **Stage decomposition** | `WIRE_CONTRACT_QA`, `PROVIDER_FIXTURE_QA`. PROD_GOLDEN_PATH for UC-100 is the full upload through transcriber.itsalt.ru per W7. |

## Optional fields

| Field | Value |
|---|---|
| **Webhook callback shape** | N/A |
| **Framework-specific gotchas** | (i) CORS on MinIO/Cloud.ru must allow browser PUT from app origin (configured in docker-compose.yml minio-init service + Cloud.ru bucket policy). (ii) `MINIO_API_CORS_ALLOW_ORIGIN` env var lists browser origins. (iii) ffprobe rejects `s3://` scheme — worker uses presigned GET URLs (5d9585d). (iv) Per-part ETag MUST include surrounding quotes when sent to /complete. |
