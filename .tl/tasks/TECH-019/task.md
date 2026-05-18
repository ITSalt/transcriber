---
id: TECH-019
title: pm2 ecosystem.config.cjs (api + worker)
type: tech
wave: 7
priority: high
depends_on: ['TECH-001']
owner: dev
---

# TECH-019 — pm2 ecosystem.config.cjs (api + worker)

## What

Add `ecosystem.config.cjs` at the repository root defining two pm2 apps — `transcrib-api` and `transcrib-worker` — pinned to the Node 20 interpreter installed under `deploy`'s nvm (TECH-017). Mirror learn's ecosystem patterns exactly.

## Deliverables

1. `/ecosystem.config.cjs` at repo root committed to `main`.
2. Two apps:

   | Name | cwd | script | port |
   |---|---|---|---|
   | `transcrib-api` | `/opt/transcrib/api` | `./dist/server.js` | listens 127.0.0.1:3010 (set via `API_PORT` env) |
   | `transcrib-worker` | `/opt/transcrib/worker` | `./dist/index.js` | none |

3. Both apps:
   - `interpreter`: absolute path to Node 20 under deploy (e.g. `/home/deploy/.nvm/versions/node/v20.X.Y/bin/node`) — exact path captured in TECH-017 result.
   - `instances: 1`, `exec_mode: 'fork'` (BullMQ worker concurrency is controlled in code, not by pm2 forks).
   - `env_file: '.env'` (relative — resolves to `api/.env` / `worker/.env` which are symlinks to `/opt/transcrib/.env`).
   - `max_memory_restart`: `512M` for api, `1024M` for worker.
   - `kill_timeout: 30000` — graceful SIGTERM window (worker needs time to finish current job).
   - `error_file`, `out_file`: under `./logs/`. Log dir created on first run.
   - `merge_logs: true`, `autorestart: true`, `watch: false`.

## Out of scope

- Touching the running pm2 daemon on the server (TECH-024 does first start).
- Graceful-shutdown code (TECH-022).
- Worker concurrency tuning (separate task post-MVP).

## Verification (local, CI)

- `node -e "require('./ecosystem.config.cjs')"` exits 0 — config parses.
- `node -e "console.log(require('./ecosystem.config.cjs').apps.length)"` → `2`.
- `node -e "const c=require('./ecosystem.config.cjs'); for (const a of c.apps) if (a.script.startsWith('/')) throw new Error('script must be relative')"` — sanity that scripts are relative to cwd, paths only absolute for interpreter/cwd.

## Definition of done

- [ ] File exists at `ecosystem.config.cjs`.
- [ ] Two apps with all required fields.
- [ ] Node 20 path matches TECH-017 result.
- [ ] PR linked to this task.
