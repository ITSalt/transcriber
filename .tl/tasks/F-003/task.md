# F-003 — Author committed smoke test files

**Type:** follow-up (post-W11 GAP-closure)
**Status:** open
**Created:** 2026-05-22
**Owner:** QA / backend lead

## Source

W11 pilot replay
([`.tl/gap-closure/2026-05-22-pilot-replay.json`](../../gap-closure/2026-05-22-pilot-replay.json))
`post_w11_followups_not_in_this_run[2]`:

> "Author worker/test/smoke/*.smoke.test.ts files referenced in
> `.tl/external-contracts/*.md` § 11 (currently the smoke evidence lives
> in `.tl/tasks/<UC>/qa-evidence/` rather than as committed test files)"

In W7 the LIVE_PROVIDER_SMOKE and PROD_GOLDEN_PATH evidence was captured
as YAML files under `.tl/tasks/<UC>/qa-evidence/`. The
external-contracts files (`§ 11 Smoke-test path`) reference *runnable*
test files at `worker/test/smoke/<slug>.smoke.test.ts` etc. — those
files do not yet exist.

## Deliverable

Five runnable smoke test files, plus the CI wiring to run them on a
nightly schedule or on every deploy:

| Test file (to author) | What it does | Skip when |
|---|---|---|
| `worker/test/smoke/deepgram.smoke.test.ts` | POST a 2-sec WAV to Deepgram Nova-3; assert `results.channels[0].alternatives[0].transcript` is a string and `metadata.model_info` references nova-3. | `DEEPGRAM_API_KEY` env var absent. |
| `worker/test/smoke/kie-anthropic.smoke.test.ts` | POST a 50-token user message to kie.ai `/claude/v1/messages`; assert `content[0].text` non-empty and `stop_reason === "end_turn"`. | `KIE_API_KEY` env var absent. |
| `api/test/smoke/s3-multipart.smoke.test.ts` | Drive the full init → PUT → complete → abort cycle against the configured S3 endpoint with a 64KB fixture; assert each leg's HTTP status. | `S3_KEY`/`S3_SECRET`/`S3_ENDPOINT` absent. |
| `api/test/smoke/sse.smoke.test.ts` | Open an EventSource against a local API instance, force a `meeting.status` event via the worker, assert the typed listener fires within 5s. | Local dev stack not running. |
| `api/test/smoke/puppeteer-pdf.smoke.test.ts` | Render `api/test/fixtures/protocol-sample.md` via the production Puppeteer codepath; assert output is a PDF v1.4 with >0 pages. | `chromium` binary not on PATH. |

CI wiring:

- Add a new `.github/workflows/smoke-nightly.yml` that runs daily at 03:00 UTC against staging (or a dedicated smoke environment).
- Alternatively chain the smokes after a successful `deploy-production.yml`
  run with a `continue-on-error: true` guard so a smoke failure surfaces as
  an alert but does not roll back the deploy.

## Deadline

Open. The current state (W7 evidence in qa-evidence YAML) is point-in-time
proof; F-003 converts that to ongoing regression coverage.

## Acceptance criteria

- All five smoke test files exist, are runnable via `pnpm --filter <pkg> run smoke`, and gracefully skip (with a clear message) when their required env vars are absent.
- A CI workflow runs them at least daily.
- Each external-contracts file's § 11 Smoke-test path now points to a real
  file in the repo (not a planned path).
- A first nightly run produces green logs visible in GitHub Actions.

## References

- `.tl/external-contracts/{deepgram,kie-anthropic,s3-multipart-presigned,sse,puppeteer-pdf}.md` § 11
- `.tl/tasks/UC-{100,200,300,302}/qa-evidence/2026-05-22-*.yaml` (W7 evidence to migrate into runnable form)
- Pilot replay note in `.tl/gap-closure/2026-05-22-pilot-replay.json`
