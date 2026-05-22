# External Contract — `puppeteer-pdf`

## 1. Identity

| Field | Value |
|---|---|
| **Name** | `puppeteer-pdf` |
| **Kind** | `provider` (provider-as-runtime-asset boundary — Puppeteer drives a local chromium binary) |
| **Owner skill** | `nacl-sa-architect` |
| **Consumed by** | `nacl-tl-plan`, `nacl-tl-sync` (W2), `nacl-tl-qa`, `nacl-tl-dev-be` |
| **Created** | `2026-05-22` |
| **Last updated** | `2026-05-22` |
| **References** | UC-302 (Export protocol to PDF), ADR-009, TECH-014, TECH-021, `api/src/routes/uc-302.ts`, `api/src/lib/pdf/template.html`, https://pptr.dev/ |

## 2. Endpoint

| Field | Value |
|---|---|
| **Base URL** | N/A — local binary, not HTTP. Driven via `puppeteer-core@^25.0.3`. |
| **All endpoints** | `chromium binary` launch (`puppeteer.launch({...})`); `page.setContent(html); page.pdf({format:'A4', printBackground:true})` |
| **Discovery** | `static-catalog` — Puppeteer protocol pinned to puppeteer-core@25 |
| **Versioning** | `puppeteer-core@^25.0.3` (api/package.json); `puppeteer@^25.0.3` devDep for tests |

## 3. Auth

| Field | Value |
|---|---|
| **Scheme** | `none` (local binary) |
| **Secret env var** | N/A |
| **Missing-secret behavior** | N/A. Missing **binary** behavior: throws `chromium not found` at first PDF render; ops installs via apt or distro package per TECH-021 / TECH-017 server bootstrap. |
| **Rotation** | N/A |

## 4. Request shape

Conceptual call shape (no HTTP):

```ts
const browser = await puppeteer.launch({
  executablePath: process.env.CHROMIUM_EXECUTABLE_PATH ?? 'chromium',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage();
await page.setContent(renderedHtml);     // HTML from template.html + markdown
const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true });
await browser.close();
```

| Field | Value |
|---|---|
| **Content-Type** | N/A |
| **Required headers** | N/A |
| **Body shape** | Markdown string (in protocol model) → rendered HTML via `remark` + `remark-html` → page.setContent |
| **Query params** | N/A |

## 5. Response shape

| Field | Value |
|---|---|
| **Success status** | `200` (HTTP response from `GET /api/meetings/:id/protocol/pdf`); body is `application/pdf` |
| **Success body** | PDF binary (Puppeteer-rendered) |
| **Parsing path** | api streams the buffer back to browser; never persisted (per ADR-009 — "PDF is transient, never stored") |
| **Required response headers** | `Content-Type: application/pdf`, `Content-Disposition: attachment; filename="protocol-<meeting-id>.pdf"` |

## 6. Lifecycle: sync vs async

| Field | Value |
|---|---|
| **Mode** | `sync` per request (typical 1-3 seconds for a 5-page protocol) |
| **Cancellation** | If browser disconnects mid-render, api closes the Puppeteer page; chromium child process is cleaned up on next event-loop tick. |

## 7. File-URL reachability assumptions

| Field | Value |
|---|---|
| **Scheme expected by consumers** | N/A — chromium binary is local-process |
| **Reverse-proxy translation** | N/A |
| **Public origin vs origin server** | N/A |
| **Lifetime** | PDF buffer is in-memory; never persisted to disk or S3 |
| **Toolchain compatibility** | chromium binary MUST be on PATH (or `CHROMIUM_EXECUTABLE_PATH` env var set). On Cloud.ru server: installed by TECH-017 server bootstrap. |

## 8. Failure codes

| Code | Meaning | Consumer action |
|---|---|---|
| `chromium not found` | binary absent at launch | halt; surface `PDF_RENDER_UNAVAILABLE`; ops re-runs server bootstrap |
| `out of memory` | chromium killed by OOMKiller during render | halt; surface error; recommend reducing concurrent renders |
| `timeout` (>30s) | page.pdf() hung | abort; surface `PDF_TIMEOUT` |
| `template parse error` | markdown→HTML failed before chromium | halt; surface upstream parse error |

## 9. Model namespace / catalog

| Field | Value |
|---|---|
| **Catalog source** | `static-list-in-this-file` |
| **Namespace prefix policy** | N/A |
| **Models in use** | chromium binary (no version pin currently; whatever the server bootstrap installs) |

## 10. Fixture-test path

| Field | Value |
|---|---|
| **Fixture file** | `api/test/fixtures/protocol-sample.md` (input) + `api/test/fixtures/protocol-sample.expected.pdf-pages-text.txt` (golden — extracted text per page, not binary diff) (W6) |
| **Test file** | `api/test/wire/puppeteer-pdf.fixture.test.ts` (W6) |
| **What it asserts** | Markdown → HTML → PDF pipeline produces a PDF whose extracted page text matches the golden (font-rendering tolerant). Uses local chromium. |
| **Run command** | `pnpm --filter @transcrib/api run test -- puppeteer` |

## 11. Smoke-test path

| Field | Value |
|---|---|
| **Smoke test file** | `api/test/smoke/puppeteer-pdf.smoke.test.ts` (W6) |
| **Env vars required** | none (chromium binary on PATH) |
| **Sandbox vs prod** | Local dev (api docker container) and prod server share the same chromium install pattern. |
| **Run command** | `pnpm --filter @transcrib/api run smoke -- puppeteer` |
| **Stage decomposition** | `LOCAL_RUNTIME_QA` (chromium binary present + renders OK), `PROVIDER_FIXTURE_QA` (markdown→PDF golden). PROD_GOLDEN_PATH for UC-302 = part of the W7 end-to-end run. |

## Optional fields

| Field | Value |
|---|---|
| **Framework-specific gotchas** | (i) On prod server, run chromium with `--no-sandbox` because the api process runs unprivileged (Cloud.ru VM). (ii) `template.html` lives at `api/src/lib/pdf/template.html` and is copied to `dist/lib/pdf/template.html` by the api build script (`fs.copyFileSync`). Missing template at runtime = `ENOENT`. (iii) puppeteer-core (not full puppeteer) used to avoid bundling chromium at install time — chromium comes from the server (TECH-017). |
| **Concurrency** | One Puppeteer browser per request; no shared pool currently. For higher load, consider a pooled `BrowserContext` reuse strategy (out of scope for MVP). |
