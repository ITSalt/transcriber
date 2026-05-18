# Deploy plan — Transcrib PROD

**Generated:** 2026-05-18
**Author:** TL planning (graph-aware, server inspection)
**Target:** single-VM PROD on `82.202.156.157` (Ubuntu 24.04), domain `transcriber.itsalt.ru`
**Coexistence:** server already hosts `learn.itsalt.ru` (production) and `mm.learn.itsalt.ru` (Mattermost). Plan is **strictly additive** — no mutations to existing services beyond a Caddyfile snippet and one new database role.

---

## 1. Findings from server inspection (read-only SSH as `magz`)

| Layer | Existing state | Decision for transcrib |
|---|---|---|
| OS | Ubuntu 24.04 LTS, 8 GB RAM, 19 GB free, **no swap** | Add swap file (2 GB) as part of TECH-017. Worker (`ffmpeg` + Chromium + LLM) is the biggest spender. |
| Reverse proxy | **Caddy 2** as systemd unit, `/etc/caddy/Caddyfile`, auto-HTTPS via ACME | Append a new `transcriber.itsalt.ru { … }` block; `caddy reload` is zero-downtime. |
| Firewall | UFW: only 22/80/443 open | No new rules. Both API (`:3010`) and worker stay on `127.0.0.1`. |
| PostgreSQL | Docker container `learn-postgres` (PG **17.9**), bound `127.0.0.1:5432`. Roles: `learn_course_platform`, `mmuser`, `postgres`. | New role `transcrib` + DB `transcrib` inside the same container. Prisma is PG17-compatible. |
| Redis | Docker container `learn-redis` (R7), bound `127.0.0.1:6379`. learn uses default `db=0`. | transcrib uses **logical DB `/1`** and BullMQ `prefix: "transcrib:"`. Total isolation at the key-namespace level. |
| Node.js | system: 22.22.2; deploy user: nvm with 22.22.2 | Install **Node 20 LTS** under `deploy`'s nvm; pm2 ecosystem pins `interpreter` to the absolute Node 20 path. |
| pnpm | not installed | Enable via `corepack enable && corepack prepare pnpm@10.33.0 --activate` under `deploy`. |
| pm2 | global v6.0.14, learn's processes (`learn-api`, `learn-worker`) run as `deploy` | Add two new pm2 apps: `transcrib-api`, `transcrib-worker`. Reuse the same systemd startup unit (`pm2-deploy.service`) — no new unit needed. |
| ffmpeg | not installed | `sudo apt install -y ffmpeg` (one global binary). |
| Chromium | not installed | `sudo apt install -y chromium-browser`. Worker switches `puppeteer` → `puppeteer-core` + `executablePath` env. |
| Filesystem pattern (learn) | `/opt/learn/` (repo, `deploy:deploy`), `/var/www/learn/frontend/dist` (static SPA), `.env` at `/opt/learn/.env` symlinked into backend | Mirror exactly: `/opt/transcrib/`, `/var/www/transcrib/frontend/dist`, `.env` at `/opt/transcrib/.env`. |
| Deploy pattern (learn) | GitHub Actions on push to `main` → SSH as `deploy` → `git reset --hard origin/main` → install/build/migrate → `pm2 reload ecosystem.config.cjs --update-env` → curl `/api/health` 200 | Mirror exactly; replace `npm` with `pnpm`, adapt to monorepo paths. |
| Cloud.ru S3 (learn) | endpoint `https://s3.cloud.ru`, region `ru-central-1`, SSL on, bucket `learn-itsalt-prod`, signature v4 | Same endpoint/region; **separate bucket** `transcrib-itsalt-prod` and **separate service-account credentials**. |
| Backups | (none planned for MVP) | No backups on MVP per explicit decision; S3 lifecycle (3 days) handles object hygiene. |

---

## 2. Target topology

```
DNS:  transcriber.itsalt.ru  A  82.202.156.157   (TTL 300, AAAA optional)

Internet ──► :443/Caddy ──► transcriber.itsalt.ru {
                              handle /api/meetings/*/events  → 127.0.0.1:3010   (SSE, flush_interval -1)
                              handle /api/uploads/*           → 127.0.0.1:3010   (TUS, request_body unlimited)
                              handle /api/*                   → 127.0.0.1:3010   (Fastify)
                              handle                          → file_server /var/www/transcrib/frontend/dist
                            }

/opt/transcrib/                       (deploy:deploy, git checkout)
├── api/dist/server.js                ← pm2 app: transcrib-api    (listens 127.0.0.1:3010)
├── worker/dist/index.js              ← pm2 app: transcrib-worker (no port; BullMQ consumer)
├── web/dist/  →  rsync ──►  /var/www/transcrib/frontend/dist
├── shared/dist/                      ← TS project ref output (built before api/worker/web)
├── ecosystem.config.cjs              ← pm2 config (api + worker)
└── .env                              ← 0640 deploy:deploy, NOT in git

PostgreSQL (in learn-postgres container):
   role transcrib  (LOGIN, CREATEDB on its own DB only)
   db   transcrib
   URL  postgres://transcrib:<pw>@127.0.0.1:5432/transcrib

Redis (in learn-redis container):
   url        redis://127.0.0.1:6379/1
   prefix     transcrib:                      (set in BullMQ Queue options)

S3 (Cloud.ru):
   endpoint           https://s3.cloud.ru
   region             ru-central-1
   bucket             transcrib-itsalt-prod
   service account    transcrib-prod (access_key / secret_key — separate from learn's)
   lifecycle rule     "expire-after-3d" — delete all objects 3 days after creation
```

### Memory budget (8 GB host, currently ~1.4 GB used)

| Process | `max_memory_restart` |
|---|---|
| transcrib-api | 512 MB |
| transcrib-worker | 1024 MB (ffmpeg + Puppeteer headroom) |
| learn-api (existing) | 512 MB |
| learn-worker (existing) | 512 MB |
| Mattermost | ~400 MB |
| Postgres + Redis containers | ~600 MB combined |
| **Headroom** | ~3–4 GB |

Plus 2 GB swap file (added in TECH-017) as failsafe for transient ffmpeg/Chromium spikes.

---

## 3. Bucket creation instruction (USER ACTION — `TECH-016`)

You need to do this once via the Cloud.ru web panel (https://console.cloud.ru/) **before** TECH-018 can finish (its `.env` needs the keys).

### 3.1. Create bucket
1. Object Storage → **Buckets** → **New bucket**.
2. Name: `transcrib-itsalt-prod`.
3. Region: `ru-central-1` (Moscow), same as `learn-itsalt-prod`.
4. Access: **Private**. Versioning: off. Object lock: off.

### 3.2. Add lifecycle rule (3-day expiration)
1. Open the bucket → **Lifecycle** → **Add rule**.
2. Name: `expire-after-3d`.
3. Filter: applies to all objects (empty prefix).
4. Action: **Delete (expire) objects 3 days after creation**.
5. Also enable: **Delete incomplete multipart uploads after 1 day** (cleans up failed TUS uploads).
6. Save.

### 3.3. Create scoped service account
1. IAM → **Service accounts** → **New**.
2. Name: `transcrib-prod`.
3. Attach a policy granting only `transcrib-itsalt-prod` access. Required actions: `s3:GetObject`, `s3:PutObject`, `s3:DeleteObject`, `s3:ListBucket`, `s3:AbortMultipartUpload`, `s3:ListBucketMultipartUploads`, `s3:ListMultipartUploadParts`. Resource: `arn:aws:s3:::transcrib-itsalt-prod` and `arn:aws:s3:::transcrib-itsalt-prod/*`.
4. Generate access key + secret key. **Save securely** — they will be pasted into `/opt/transcrib/.env` on the server in TECH-018.

### 3.4. Hand-off to me
After saving the keys, ping me — I'll resume with TECH-017 onward and put the keys into the server `.env` (you paste, I structure the file).

---

## 4. Implementation roadmap (TECH-016 → TECH-024)

| Task | Type | Owner | Wave | Depends on |
|---|---|---|---|---|
| TECH-016 — Cloud.ru bucket + service account | **manual** | user (you) | 7 | — |
| TECH-017 — Server bootstrap (apt, swap, Node 20, pnpm, ffmpeg, chromium) | server | ops/me | 7 | — |
| TECH-018 — Postgres role + Redis DB index + filesystem layout + `.env` | server | ops/me | 8 | TECH-016, TECH-017 |
| TECH-019 — `ecosystem.config.cjs` in repo (api + worker, Node 20 absolute path) | code | dev | 7 | TECH-001 |
| TECH-020 — Caddy server-block `transcriber.itsalt.ru` (SSE + TUS + static) | server | ops/me | 8 | TECH-018 |
| TECH-021 — S3 adapter Cloud.ru profile + Puppeteer→puppeteer-core | code | dev | 7 | TECH-007, TECH-014 |
| TECH-022 — `/api/health` endpoint + graceful shutdown (SIGTERM) | code | dev | 7 | TECH-005 |
| TECH-023 — GitHub Actions `deploy-production.yml` + repo secrets | code + CI | dev | 9 | TECH-018, TECH-019, TECH-022 |
| TECH-024 — DNS A-record + first deploy runbook + smoke test | manual + ops | user + me | 10 | all above |

### Wave summary

- **Wave 7 — Prepare in parallel**: TECH-016 (you), TECH-017 (server), TECH-019, TECH-021, TECH-022 (code).
- **Wave 8 — Wire it up on the server**: TECH-018, TECH-020.
- **Wave 9 — Automate the pipeline**: TECH-023.
- **Wave 10 — Production cutover**: TECH-024.

Existing waves 0–5 (Transcrib feature development) are unchanged. Deploy waves start at 7 because they only become meaningful after the app itself is built; UC waves 0–5 must be green before TECH-024.

---

## 5. Rollback model

| Failure mode | Action |
|---|---|
| `pm2 reload` failed but old process still running | pm2 keeps the old version (zero-downtime reload). No action. |
| New build crashes after reload | `pm2 stop transcrib-*; cd /opt/transcrib && git reset --hard <prev-sha>; pnpm i; pnpm -r build; pm2 reload ecosystem.config.cjs` |
| Prisma migration broke DB | `prisma migrate resolve --rolled-back <name>` (data not destroyed because we don't do destructive migrations); restore from manual `pg_dump` snapshot taken pre-deploy (added as a manual step in TECH-024 runbook). |
| Caddy block invalid | `caddy validate` is run by deploy workflow before reload; failure aborts deploy before any change to running config. |
| S3 keys leaked | Revoke service account on Cloud.ru panel → generate new pair → update `.env` → `pm2 reload`. No code change. |

Backups are explicitly **out of scope for MVP** (per your decision). When traffic begins, add `pg_dump` cron → separate bucket `transcrib-backups`.

---

## 6. Risks & mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| Worker memory spike OOM-kills neighbours (no swap) | medium | TECH-017 adds 2 GB swap; pm2 `max_memory_restart=1024M` on worker. |
| TUS upload >100 MB exhausts Caddy default request body | low | Caddy has no default body limit; Fastify needs `bodyLimit` raised in TUS plugin. Documented in TECH-022 impl-brief. |
| Chromium apt upgrade breaks Puppeteer | low | puppeteer-core decouples Chrome version from npm; `executablePath` is stable across apt minor updates. |
| Postgres role collision with future learn migration | low | Role `transcrib` is namespaced; learn's role stays separate. |
| GitHub Actions deploy races with learn's deploy | very low | Each repo has its own concurrency group; both target different paths. |

---

## 7. What you (the human) own vs what I/the agent owns

| Domain | You | Me |
|---|---|---|
| Cloud.ru panel (bucket, lifecycle, IAM) | ✔ | — |
| DNS A-record (`transcriber.itsalt.ru` → `82.202.156.157`) | ✔ | — |
| Server changes that require `sudo` (apt install, swap, Caddyfile edit, Postgres role) | review/approve | execute via SSH after your OK |
| `.env` on server (pasting secrets) | ✔ (paste values) | structure the file, set perms |
| Repository changes (code, ecosystem, GH workflow) | review PRs | implement |
| GitHub Actions secrets (`PROD_SSH_KEY`, `PROD_HOST`, `PROD_USER`) | ✔ (paste in GH UI) | provide values to paste |

---

## 8. Open questions to confirm before TECH-018 starts

1. Можно ли мне ходить на сервер как `magz` с `sudo`, или вы хотите выполнять root-команды сами? (если сами — я отдаю чек-листы, как раньше)
2. Имя GitHub-секрета: разделять `TRANSCRIB_*` от `PRODUCTION_*` (learn), или переиспользовать? Рекомендую разделять — учётка `deploy` одна, но ключ можно один и тот же скопировать в две переменные.
3. Поднимать ли свой `pm2 logrotate` (учитывая, что learn уже его запустил) — обычно один экземпляр на сервер обслуживает всех пользователей deploy.

Эти вопросы не блокируют TECH-016 (создание bucket) — можно начинать сейчас параллельно.
