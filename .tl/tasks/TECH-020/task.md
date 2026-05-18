---
id: TECH-020
title: Caddy server-block for transcriber.itsalt.ru
type: tech
wave: 8
priority: high
depends_on: ['TECH-018']
owner: ops
---

# TECH-020 — Caddy server-block for transcriber.itsalt.ru

## What

Append a new server block to `/etc/caddy/Caddyfile` that fronts `transcriber.itsalt.ru`. Reload Caddy with zero downtime. Existing `learn.itsalt.ru` and `mm.learn.itsalt.ru` blocks must be unchanged.

## Deliverables

1. New server block (see impl-brief) covering:
   - SSE route `/api/meetings/*/events` → `127.0.0.1:3010` with `flush_interval -1`.
   - TUS uploads `/api/uploads/*` → `127.0.0.1:3010` with **no request body buffering / no body limit**.
   - Catch-all `/api/*` → `127.0.0.1:3010`.
   - Static fallback → `file_server` from `/var/www/transcrib/frontend/dist` with SPA `try_files`.
   - Standard security headers (X-Content-Type-Options, X-Frame-Options, Referrer-Policy) copied from learn's block.
   - Access log at `/var/log/caddy/transcrib-access.log` with `roll_size 100mb`, `roll_keep 14`, JSON format.
2. `caddy validate --config /etc/caddy/Caddyfile` returns 0 before reload.
3. `sudo systemctl reload caddy` (zero-downtime) — never `restart`.

## Out of scope

- DNS A-record (TECH-024).
- TLS certificate provisioning — Caddy handles ACME automatically once DNS resolves to this host. **TECH-024 runbook explicitly orders DNS before first reload** to let ACME succeed.

## Verification

After TECH-024's DNS step, but the validation steps below can be confirmed in dry-run before DNS:

```bash
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
sudo systemctl status caddy --no-pager | head -10
sudo journalctl -u caddy -n 30 --no-pager
```

After DNS points correctly:

```bash
curl -sI https://transcriber.itsalt.ru/                 # 200 (static SPA index)
curl -sI https://transcriber.itsalt.ru/api/health       # 200 once API is running (TECH-022 + TECH-024)
curl -sI https://learn.itsalt.ru/api/health             # still 200 — neighbor untouched
```

## Definition of done

- [ ] Block appended to Caddyfile.
- [ ] `caddy validate` passes.
- [ ] `caddy reload` succeeds; learn still healthy.
- [ ] Certificate provisioning logged successfully after DNS cutover (TECH-024).
