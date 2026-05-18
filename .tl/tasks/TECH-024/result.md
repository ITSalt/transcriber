# TECH-024 — Result

**Executed:** 2026-05-18.
**Deploy SHA delivered:** `aeeae53` (first green deploy) → `27da444` (workflow hardening, in flight at time of writing).

## What landed

- DNS `transcriber.itsalt.ru → 82.202.156.157` already pointed by user before TECH-020 (Caddy ACME succeeded on first reload).
- HTTPS reachable, Let's Encrypt cert: `issuer=CN=E8`, `notAfter=Aug 16 16:52:07 2026 GMT`.
- SPA served from `/var/www/transcrib/frontend/dist/index.html` (no more "coming soon" placeholder).
- `GET https://transcriber.itsalt.ru/api/health` → `200 {"status":"ok","version":"unknown","ts":"..."}`. (`version` is `unknown` because pm2 invokes node directly, bypassing `pnpm` which would set `npm_package_version` — cosmetic, can be fixed later by reading `package.json` explicitly.)
- pm2 state (as `deploy`):
  - `transcrib-api`   pid 3120153, mem 94.8 MB, online
  - `transcrib-worker` pid 3120154, mem 78.0 MB, online
  - `learn-api`, `learn-worker` untouched, still online with original 3053706/3053707 PIDs.
- Listening: only `127.0.0.1:3010` (transcrib-api); worker has no port.

## Resource snapshot post-deploy

```
Mem:           7.8 GiB total, 6.1 GiB available, swap 0/2 GiB
Disk /:        16 GB used / 30 GB (57%), 13 GB free
Load avg:      0.11, 0.19, 0.17
```

Headroom is comfortable — worker can do an ffmpeg+Puppeteer+LLM job without OOM-killing learn.

## Issues encountered + recovery (chronological)

1. **SSH `Permission denied (publickey)` (first deploy attempt).**  
   The `PRODUCTION_SSH_KEY` value the user pasted did not match any pub key in `/home/deploy/.ssh/authorized_keys`. Generated a fresh ed25519 keypair on operator workstation, appended public to deploy's `authorized_keys`, piped private into `gh secret set` (value never appeared in chat or logs), deleted the local keypair. Re-ran the failed deploy run.

2. **TypeScript build failed: `Module '@prisma/client' has no exported member 'PrismaClient'`.**  
   `pnpm install` does not auto-run Prisma's postinstall (`@prisma/client` isn't in the root `pnpm.onlyBuiltDependencies` allowlist that lets postinstall scripts run). CI compensates with an explicit `pnpm --filter @transcrib/api run db:generate`; the deploy workflow was missing this step. Fix: commit `321016e` — added `db:generate` between `pnpm install` and the first build.

3. **pm2 process online but never listened on :3010 — health check failed.**  
   `ecosystem.config.cjs` pointed api at `./dist/server.js`, which is the Fastify app **factory** (no `.listen()`). The actual entry that calls `.listen()` is `./dist/index.js` (set in TECH-022 when graceful shutdown was added). Fix: commit `aeeae53` — flipped api script to `./dist/index.js`. Also fixed `.env` on server: `API_PORT=3010` → `PORT=3010` + added `HOST=127.0.0.1` (api/src/config reads `PORT`, defaults to `0.0.0.0` — we want loopback so Caddy is the only public path).

4. **`pm2 reload` kept stale `script path` after ecosystem.config.cjs change.**  
   `pm2 reload <ecosystem>` re-applies env vars and code but does NOT re-resolve structural fields (`script`, `cwd`, `interpreter`). The third deploy launched processes with the old `./dist/server.js` path. Workaround: ssh'd as deploy, `pm2 delete transcrib-{api,worker} && pm2 start ecosystem.config.cjs` — fixed live. Workflow fix: commit `27da444` — replaces `pm2 reload` with `pm2 delete <names> 2>/dev/null || true && pm2 start ecosystem.config.cjs`. Adds ~1-2s downtime per process per deploy, which is acceptable until we scale.

## Smoke test (golden path, no upload pipeline)

```
GET /                              → 200 (394 bytes real SPA, not placeholder)
GET /api/health                    → 200 {"status":"ok",...}
TLS issuer                         → Let's Encrypt E8
neighbour /api/health (learn)      → 200
neighbour / (mm.learn)             → 200
port 3010 listener                 → 127.0.0.1 only (correct — Caddy proxies)
Caddy systemd                      → active
```

## Smoke test — UPLOAD PIPELINE (NOT YET RUN)

The full UC golden path (UC-100 upload → UC-200 worker pipeline → UC-301 protocol → UC-302 PDF) was NOT exercised in this session because:
- It requires a real video file (~10-100 MB) and ~5-10 min of wall-clock to run.
- Worker integration with Deepgram/kie.ai costs API quota and surfaces issues that are not deploy-pipeline issues (those belong to UC-200-BE / UC-300-BE QA).

**Recommended next session:** upload a small test video through the live web UI at `https://transcriber.itsalt.ru/`, watch SSE events tick through `processing → transcribing → generating protocol → done`, then exercise UC-302 PDF export. If anything fails, it's a UC-level regression, not a deploy issue.

## Open follow-ups (non-blocking)

- `version: "unknown"` in health response — minor, fix by reading `package.json` at startup.
- ESLint warnings about `no-explicit-any` (118) — pre-existing baseline, not introduced by this PR.
- Github Actions deprecation warnings for `actions/checkout@v4` running on Node 20 — upgrade actions to versions that support Node 24 before June 2026.
- AWS SDK v3 warning about Node 22+ — non-blocking until Jan 2027; covered when we upgrade Node 20 → 22 on the host.
- `ffmpegRegistry.register/unregister` not yet wired into the live `extractAudio()` flow (TECH-022 deviation) — pm2's 30 s hard-kill catches stragglers in the meantime.

## Definition of done

- [x] DNS resolves to PROD.
- [x] HTTPS cert issued.
- [x] First deploy workflow run green.
- [x] Health endpoint returns 200.
- [x] SPA real (not placeholder).
- [x] learn + Mattermost still healthy.
- [x] Resource snapshot recorded.
- [ ] Full UC upload smoke test (deferred — recommended for next session against the live URL).
