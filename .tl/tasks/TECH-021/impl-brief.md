# TECH-021 — Implementation brief

## Part A — S3 adapter (`shared/` + consumers)

The S3 client factory in `shared/src/s3/client.ts` (or wherever TECH-007 placed it) should look like:

```ts
import { S3Client } from '@aws-sdk/client-s3';

export function createS3Client(env = process.env) {
  return new S3Client({
    endpoint: env.S3_ENDPOINT,                                  // https://s3.cloud.ru in prod, http://localhost:9000 in dev
    region: env.S3_REGION ?? 'us-east-1',                       // ru-central-1 in prod
    forcePathStyle: env.S3_FORCE_PATH_STYLE === 'true',         // true for MinIO; safe for Cloud.ru
    credentials: {
      accessKeyId: required(env.S3_KEY, 'S3_KEY'),
      secretAccessKey: required(env.S3_SECRET, 'S3_SECRET'),
    },
  });
}
```

The Zod schema in `shared/src/env.ts` adds optional `S3_REGION` (defaulted) and `S3_FORCE_PATH_STYLE` (boolean string). No call site changes — the URI helpers `toS3Uri(bucket, key)` / `parseS3Uri(uri)` stay as-is.

Why path-style for both:
- MinIO requires it (it cannot do virtual-hosted-style without a wildcard cert).
- Cloud.ru supports both — choosing path-style means **one code path** for dev and prod.

## Part B — puppeteer-core

`worker/src/pdf/render.ts`:

```ts
import puppeteer from 'puppeteer-core';

export async function renderPdf(html: string): Promise<Buffer> {
  const browser = await puppeteer.launch({
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH ?? resolveDevChrome(),
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    headless: true,
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    return await page.pdf({ format: 'A4', printBackground: true });
  } finally {
    await browser.close();
  }
}

function resolveDevChrome(): string {
  // puppeteer (non-core) is a devDependency that downloads a known Chrome.
  // We use its cache lookup so dev DX is unchanged.
  const { executablePath } = require('puppeteer'); // dev-only — never reached in prod where env is set
  return executablePath();
}
```

Why this seam:
- `puppeteer-core` has zero Chrome download — prod build is small, deploy is fast.
- Dev keeps `puppeteer` as devDependency → still gets bundled Chrome for tests without manual installation.
- A misconfigured prod (no env, no dev cache) fails loudly at `require('puppeteer')` — better than silently downloading on first request.

## Server-host implications (recap from TECH-017)

- Prod binary is **Google Chrome stable** at `/usr/bin/google-chrome` (Ubuntu 24.04 only ships `chromium-browser` as snap — incompatible with Puppeteer's sandbox confinement). Installed in TECH-017 from `dl.google.com/linux/chrome/deb`.
- `PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome` is set in `/opt/transcrib/.env` (TECH-018).

## `--no-sandbox` rationale

Chromium's sandbox requires a setuid helper that snap-packaged Chromium often ships in an inaccessible location. We're running headless as `deploy` (a non-privileged user), already isolated by the OS; the sandbox adds little here. Risk is acceptable for an internal SSR-style PDF render of trusted HTML.

`--disable-dev-shm-usage` is mandatory: server's `/dev/shm` is usually 64MB and Chromium will crash on large pages without this flag.
