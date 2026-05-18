# TECH-021 — Result

## Status: ready_for_review

## What was done

### Part A — S3 env-driven config

**File:** `api/src/storage/s3-adapter.ts`

`s3ConfigFromEnv()` now reads `S3_FORCE_PATH_STYLE` from env and maps the string
`"true"` / `"false"` to a boolean, or leaves `forcePathStyle` as `undefined` when
the env var is absent (the `S3StorageProvider` constructor already defaults to
`true` when an endpoint is set, preserving MinIO dev behavior unchanged).

`S3_REGION` was already read before this task; no change needed there.

**File:** `.env.example`

Added `S3_REGION`, `S3_FORCE_PATH_STYLE`, and a commented
`PUPPETEER_EXECUTABLE_PATH` entry with inline docs.

### Part B — puppeteer-core wiring

**File:** `api/src/lib/pdf.ts`

The PDF renderer (UC-302) lives in `api/`, not `worker/` — the impl-brief
referenced a not-yet-created `worker/src/pdf/render.ts` but TECH-014 placed it
in the API package. The changes follow the spec intent applied to the actual
file location:

- Import changed from lazy `import('puppeteer')` to a static
  `import puppeteerCore from 'puppeteer-core'`.
- New exported function `_getDefaultLaunchOptions()` returns
  `{ executablePath, args, headless }` using:
  - `process.env.PUPPETEER_EXECUTABLE_PATH` when set (prod path).
  - `require('puppeteer').executablePath()` fallback when unset (dev path).
  - Always includes `['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu']`.
- `_launchBrowser` now calls `puppeteerCore.launch(_getDefaultLaunchOptions())`.

**File:** `api/package.json`

- `puppeteer` moved from `dependencies` to `devDependencies`.
- `puppeteer-core` added to `dependencies`.

## Test results

### Before implementation (RED)
- `src/storage/s3-adapter.test.ts`: 2 new tests failing (s3ConfigFromEnv Cloud.ru / forcePathStyle)
- `src/lib/pdf.test.ts`: 3 new tests failing (_getDefaultLaunchOptions)

### After implementation (GREEN)
- `api` test suite: **172 passed | 7 skipped** (was 163 passed before TECH-021 tests)
- `worker` test suite: **111 passed** (unchanged)

## Typecheck

```
pnpm -F @transcrib/shared run build   → clean
pnpm -F @transcrib/api run typecheck  → clean
pnpm -F @transcrib/worker run typecheck → clean
```

## Deviations from spec

1. **PDF renderer location:** The spec assumed `worker/src/pdf/render.ts` but
   TECH-014 placed the implementation in `api/src/lib/pdf.ts`. All puppeteer-core
   changes were applied there instead.

2. **`S3_REGION` already existed:** `s3ConfigFromEnv()` already read `S3_REGION`
   with `us-east-1` default. No duplication needed.

3. **`_getDefaultLaunchOptions` exported (not inlined):** The spec showed
   `resolveDevChrome()` inlined in the launcher. A separate exported helper was
   added so tests can assert on launch options without actually launching Chrome.
