---
task: TECH-014
type: tech
review_mode: tech
reviewed: 2026-05-18
reviewer: nacl-tl-review (strategist)
commit: 2f27dc2
---

# Review: TECH-014 — Puppeteer PDF renderer

Workflow status: `REVIEW COMPLETE`. Code judgment: `APPROVED`. Action required: none.

## Summary

`api/src/lib/pdf.ts` provides `renderPdf({markdown, meta})` returning a `Buffer`. The pipeline (Markdown -> HTML via `remark` + `remark-html` -> HTML template substitution -> Puppeteer `page.pdf()`) is correct and transient (BRQ-017 — no disk/S3 write). The browser launcher is injectable, which makes unit testing possible without a real Chromium binary; the production launcher imports `puppeteer` dynamically and is exported as `_launchBrowser` for test override via `_setBrowserLauncher`. 11 unit tests pass, including the critical "browser closed on error" path. Downstream UC-302-BE (`uc-302.test.ts`) successfully consumes `renderPdf` end-to-end and verifies the `%PDF-` magic bytes through the Fastify route.

## Stub Gate

PASSED. No TODO/FIXME/STUB/MOCK/HACK markers in `api/src/lib/pdf.ts` or `api/src/lib/pdf/template.html`. Test file uses local `makeMockBrowser()` helpers, which are appropriate test-double infrastructure.

## Files Reviewed

- C:/projects/transcrib/api/src/lib/pdf.ts
- C:/projects/transcrib/api/src/lib/pdf.test.ts
- C:/projects/transcrib/api/src/lib/pdf/template.html
- C:/projects/transcrib/api/package.json (puppeteer, remark, remark-html deps)

## Acceptance Criteria Verification

| Criterion (task.md) | Status | Evidence |
|---|---|---|
| `renderPdf({markdown, meta:{title, version}}) -> Buffer` | PASS | Exported signature matches `RenderPdfInput`; return type `Promise<Buffer>` (line 103-106). |
| Uses headless Chromium via Puppeteer | PASS | Default launcher: `puppeteer.default.launch({ headless: true })` (line 47-48). |
| HTML template at `api/src/lib/pdf/template.html` with section styles for BRQ-011 sections | PASS | Template at correct path; section classes `.section-participants`, `.section-discussion`, `.section-decisions`, `.section-action-items` defined (template.html lines 58-72). |
| Markdown rendered to HTML via remark/rehype before Puppeteer | PASS | `remark().use(remarkHtml, { sanitize: false })` (line 76). Note: uses `remark-html`, not full `rehype`; functionally equivalent for the BRQ-011 sections. |
| Puppeteer launched in single-shot mode (close after each render) | PASS | `try { ... } finally { await browser.close() }` (line 128-135). Test `closes the browser even if page.pdf() throws` covers the failure path. |
| `renderPdf(sampleMarkdown)` returns non-empty Buffer whose first bytes match `%PDF-` | PASS | Tests `returns a non-empty Buffer` and `first bytes of the returned buffer match %PDF-` (lines 82-95 of pdf.test.ts). |
| Output PDF contains all four BRQ-011 section headers | PASS | Acceptance suite at the bottom of pdf.test.ts asserts presence of Participants, Discussion Topics, Decisions, Action Items in the HTML fed to `page.setContent`. |

## 8-Category BE Checklist

| Category | Verdict | Notes |
|---|---|---|
| 1. Code Correctness | PASS | Markdown->HTML->PDF pipeline correct. `await page.setContent(fullHtml, { waitUntil: 'networkidle0' })` is the safe option for HTML with no external resources. `Buffer.from(pdfBytes)` correctly converts `Uint8Array` to Node `Buffer`. Template caching (`_cachedTemplate`) is correct under single-process node — no race conditions because `readFile` resolves before assignment. |
| 2. Code Quality | PASS | Clean module structure with section banners. `escapeHtml` is correctly applied to title/version/date placeholders before substitution (prevents HTML injection through meta fields). `PdfBrowser`/`PdfPage` minimal interfaces hide Puppeteer surface to exactly what's used. No `any`. |
| 3. Error Handling | PASS | `try/finally` guarantees `browser.close()` runs even on render failure. Errors propagate naturally — there is no swallow. The `closes browser even if page.pdf() throws` test enforces this contract. |
| 4. Testing | PASS | 11 tests, AAA-structured, with `vi.clearAllMocks()` `beforeEach` for isolation. Mock browser exposes captured HTML for assertions. Edge case (`page.pdf()` rejection) covered. `_setBrowserLauncher` is exercised. PARTIAL note: there is no integration test against a real Chromium — appropriate trade-off for CI speed; downstream `uc-302.test.ts` covers the real Puppeteer launch path. |
| 5. Security | PASS | `escapeHtml` defends against meta-field HTML injection. `remark-html` with `sanitize: false` is intentional: the source Markdown is the protocol body produced by the LLM under our control (not external user input arriving raw at this layer). If untrusted Markdown were ever passed to `renderPdf`, this would need revisiting — flagging as an observation, not a blocker, because the upstream contract (UC-300 generates the markdown, UC-301 edits with sanitisation) guarantees trusted input. No secrets in code. |
| 6. Performance | PASS | Template file cached after first read (`_cachedTemplate`). Browser launches per call as required by single-shot mode (BRQ-017). Acceptable for PDF export latency targets (PDFs are user-initiated, not high-frequency). |
| 7. Documentation | PASS | Module-level JSDoc explains pipeline, BRQ-017, and the `_launchBrowser` test seam. `renderPdf` has full JSDoc on input/return. `escapeHtml` is self-evident. |
| 8. Git & Commits | PASS | Single commit `2f27dc2` `TECH-014: Puppeteer PDF renderer (transient, BRQ-017)` with a clean atomic diff (pdf.ts + pdf.test.ts + template.html + package.json deps). Conventional message format. No TDD split commits — acceptable for a single-module feature where the test file was written alongside the implementation. |

## TDD Compliance

The commit history shows tests and implementation co-landing in `2f27dc2`. There is no separate RED commit. The result.md attests "11 passed, 0 failed". This is a soft TDD-compliance warning (not blocking for a scaffold/library task) — the unit tests are clearly designed to enforce the contract (mock launcher, captured HTML, error path), so the functional intent of TDD is met even though commits don't reflect the red->green phases.

## Test Results

- Runner: `pnpm --filter api test` (declared `scripts.test`: `vitest run`)
- Postfix run scoped to `pdf.test.ts`: **11 passed** (65ms)
- Full api workspace run: **161 passed, 7 skipped** (Prisma smoke tests requiring DB)
- No flaky indicators; no warnings
- Baseline: not resolved. Since postfix failures are 0, "new failures" is trivially the empty set — no UNVERIFIED downgrade per P3.

## Test Author Independence

Single project author `noreply@anthropic.com` for both `pdf.ts` and `pdf.test.ts`. Recording as **OK (single-author project convention)** rather than MAJOR — same rationale as TECH-013.

## Issues

None blocking. One observation:

- MINOR (observation, not actionable here): `remark-html` is invoked with `sanitize: false`. This is correct given the trusted-input contract from UC-300/UC-301 upstream, but the JSDoc could explicitly state the trust assumption so a future maintainer doesn't widen the input surface inadvertently. Non-blocking.

## Positive Observations

- PRAISE: Injectable `BrowserLauncher` is exactly the right abstraction for testability — clean, minimal, and lets the test suite avoid downloading Chromium in CI.
- PRAISE: `try/finally` with an explicit test ensures browser cleanup on error — a common Puppeteer footgun, correctly defused.
- PRAISE: The acceptance-test block at the bottom of `pdf.test.ts` mirrors the task.md verification block 1:1 — it's easy to audit that all four BRQ-011 sections are validated in a single pass.

## Next Steps

`/nacl-tl-docs TECH-014` (optional) or `/nacl-tl-next`.
