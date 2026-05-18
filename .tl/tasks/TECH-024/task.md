---
id: TECH-024
title: DNS A-record + first production cutover + smoke test runbook
type: tech
wave: 10
priority: high
depends_on: ['TECH-016', 'TECH-017', 'TECH-018', 'TECH-019', 'TECH-020', 'TECH-021', 'TECH-022', 'TECH-023']
owner: user + ops
---

# TECH-024 — DNS A-record + first production cutover + smoke test runbook

## What

Execute the production cutover for `transcriber.itsalt.ru`: point DNS, trigger the deploy workflow, watch ACME succeed, run an end-to-end smoke test against the live system. This is the **only** task that touches production traffic.

## Deliverables

1. DNS A-record `transcriber.itsalt.ru → 82.202.156.157`, TTL ≤ 300. (User action; pre-cutover.)
2. First successful run of `Deploy to Production` workflow on the `main` branch.
3. Successful TLS certificate provisioning by Caddy (verified by `journalctl -u caddy` and a real `https://` curl).
4. Smoke-test report (see verification) recorded in `result.md` for this task.

## Out of scope

- Any further development work — this task only ships what's been built.

## Runbook (sequential, do not skip)

1. **T-30 min — Pre-flight**:
   - `sudo -u deploy pm2 ls` shows learn-api/learn-worker `online`.
   - `curl -sf https://learn.itsalt.ru/api/health` → 200.
   - `/opt/transcrib/.env` exists with all keys (TECH-018).
   - `/etc/caddy/Caddyfile` contains the transcriber block but is **not** yet active (or is active — see step 4; either is fine, ACME will retry until DNS resolves).
2. **T-0 — DNS cutover**:
   - In your DNS provider's panel, set `transcriber.itsalt.ru` IN A `82.202.156.157`, TTL `300`. Save.
   - `dig +short transcriber.itsalt.ru` from your laptop returns the new IP within 5 minutes.
3. **T+5 min — Caddy reload (if not already done)**:
   - `sudo caddy validate --config /etc/caddy/Caddyfile`
   - `sudo systemctl reload caddy`
   - `sudo journalctl -u caddy -f` — within ~30s see `certificate obtained successfully` for `transcriber.itsalt.ru`.
4. **T+10 min — First deploy**:
   - On laptop: merge a no-op PR to `main` (or push directly if no PR gate) to trigger the workflow.
   - Watch the workflow in GitHub UI. CI completes (~3 min), deploy step runs.
   - After "pm2 reload" line, watch `sudo -u deploy pm2 logs transcrib-api --lines 20` server-side — see Fastify startup banner, no errors.
5. **T+15 min — Smoke test (golden path)**:
   - From laptop: `curl -sf https://transcriber.itsalt.ru/` returns the SPA `index.html` (HTTP 200, `<!doctype html>` body).
   - `curl -sf https://transcriber.itsalt.ru/api/health` returns `{ "status": "ok", ... }`.
   - Open `https://transcriber.itsalt.ru/` in a browser. Catalog page loads (empty state expected — DB is fresh).
   - Upload a small video (~10 MB MP4) through the UI. Verify:
     - TUS upload finishes, page transitions to "processing".
     - `aws --endpoint-url https://s3.cloud.ru s3 ls s3://transcrib-itsalt-prod/` shows the uploaded object.
     - Worker logs (`pm2 logs transcrib-worker`) show ffmpeg → Deepgram → kie.ai pipeline ticking through.
     - After completion (a few minutes), the meeting detail page shows a transcript and a protocol.
   - PDF export from the detail page produces a downloadable PDF.
6. **T+45 min — Neighbour-impact check**:
   - `curl -sf https://learn.itsalt.ru/api/health` → 200.
   - `curl -sf https://mm.learn.itsalt.ru/` → 200 (or expected Mattermost response).
   - `free -h` shows >2 GB free, swap usage <50%.
   - `df -h /` shows disk usage stable (no log explosion).

## Rollback (if the smoke test fails)

| Failure | Action |
|---|---|
| Deploy workflow failed before pm2 reload | No production change — investigate logs, fix, re-run. Existing services unaffected. |
| Deploy reloaded pm2 but health check fails | `sudo -u deploy pm2 logs transcrib-api --err --lines 100`. Fix root cause, push fix, redeploy. App is broken but learn is intact. |
| Caddy reload broke another vhost | `sudo systemctl reload caddy` after reverting Caddyfile change via `git diff` in `/etc/caddy/`. (Caddyfile is not in git by default — keep a backup before editing in TECH-020 impl.) |
| Cloud.ru S3 inaccessible | Confirm the service-account key in `.env` matches the one in Cloud.ru panel. Regenerate if leaked. |
| Postgres role denied | Verify password in `.env` matches Postgres role; reset role password if drifted. |

## Definition of done

- [ ] DNS resolves correctly from at least two external resolvers (8.8.8.8, 1.1.1.1).
- [ ] HTTPS cert issued by Let's Encrypt for `transcriber.itsalt.ru`.
- [ ] First deploy workflow run succeeded end-to-end (green tick in GH UI).
- [ ] Full smoke test passed; PDF export downloadable.
- [ ] learn + Mattermost still healthy.
- [ ] `result.md` records: timestamp, deploy SHA, smoke-test artifacts (links/screenshots), memory + disk snapshot.
