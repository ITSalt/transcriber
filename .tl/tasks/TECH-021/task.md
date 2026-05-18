---
id: TECH-021
title: S3 (Cloud.ru) profile + Puppeteer→puppeteer-core wiring
type: tech
wave: 7
priority: high
depends_on: ['TECH-007', 'TECH-014']
owner: dev
---

# TECH-021 — S3 (Cloud.ru) profile + Puppeteer→puppeteer-core wiring

## What

Make the code production-ready against Cloud.ru S3 (no MinIO assumptions) and against a system-installed Chromium (no bundled Chrome download). Both changes are **env-driven** and must keep dev (MinIO + bundled Puppeteer Chrome) working.

## Deliverables

### 21a. S3 adapter (`api/` + `worker/`, via `shared/`)

1. The S3 client (`@aws-sdk/client-s3`) is constructed with these env-driven options when `S3_ENDPOINT` is set:
   - `endpoint: process.env.S3_ENDPOINT`
   - `region: process.env.S3_REGION` (default `us-east-1` for MinIO dev)
   - `forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true'`
   - `credentials: { accessKeyId: S3_KEY, secretAccessKey: S3_SECRET }`
2. The `s3://bucket/key` URI convention (ADR-004) is unchanged — only the underlying client config changes.
3. Multipart-upload threshold remains as defined for TUS in TECH-008. No code change to TUS itself.
4. `.env.example` updated with `S3_REGION` and `S3_FORCE_PATH_STYLE=true` (MinIO needs path-style; Cloud.ru also accepts it).

### 21b. Puppeteer wiring (`worker/` only, for UC-302 PDF renderer)

1. Replace `puppeteer` dependency with `puppeteer-core` (puppeteer-core does not download Chrome).
2. Read `process.env.PUPPETEER_EXECUTABLE_PATH` at startup; if set, pass `executablePath` to `puppeteer.launch()`.
3. If the env var is **not set** (dev environment), fall back to `puppeteer`'s bundled Chrome discovery — keep dev DX. Document via:
   - dev path: `pnpm add -D puppeteer` in `worker/` (devDependency only — used in tests + local dev).
   - prod path: `PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser` in `.env` (TECH-018).
4. Add `args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu']` to launch options (server has no `/dev/shm` budget for headless Chrome).

## Out of scope

- Cloud.ru bucket creation (TECH-016).
- Production server `.env` population (TECH-018).
- Lifecycle policy logic in code — handled entirely server-side by Cloud.ru.

## Verification

Local (dev with MinIO + bundled Chrome):
- `pnpm -F api test` and `pnpm -F worker test` still pass.
- Manual upload through TUS still lands in MinIO.
- PDF export still works against bundled Chromium.

Pre-prod (against real Cloud.ru test bucket from a dev machine using new keys):
- `aws --endpoint-url https://s3.cloud.ru --region ru-central-1 s3 cp ./fixture.mp4 s3://transcrib-itsalt-prod/test/` succeeds.
- API can read back via `s3://transcrib-itsalt-prod/test/fixture.mp4`.

## Definition of done

- [ ] S3 client constructor accepts endpoint/region/forcePathStyle from env.
- [ ] `worker/package.json` has `puppeteer-core` in `dependencies` and `puppeteer` in `devDependencies` only.
- [ ] `PUPPETEER_EXECUTABLE_PATH` is honored; bundled fallback works in dev.
- [ ] `.env.example` and `shared/` schema updated.
- [ ] All existing tests green.
- [ ] PR linked to this task.
