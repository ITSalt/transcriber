# TECH-020 — Result

**Executed:** 2026-05-18 via autonomous SSH as `magz`.

## State

- `/etc/caddy/Caddyfile.pre-transcrib-20260518-204722` — backup of pre-edit Caddyfile (kept for rollback).
- `/etc/caddy/Caddyfile` — appended `transcriber.itsalt.ru { … }` server-block at the end. Existing `learn.itsalt.ru` and `mm.learn.itsalt.ru` blocks unchanged.
- `/var/log/caddy/transcrib-access.log` — created with `caddy:caddy` ownership (0640). **This was the issue on first reload** — Caddy worker process couldn't create the file with root-owned defaults.
- Caddy: `active` (after `systemctl restart`, not reload — see Issues below).
- TLS certificate obtained from Let's Encrypt (`issuer=CN=E8`, `subject=CN=transcriber.itsalt.ru`, valid until 2026-08-16).
- `/var/www/transcrib/frontend/dist/index.html` — placeholder "coming soon" page (will be overwritten on first deploy).

## External verification (DNS already in place — user pointed `transcriber.itsalt.ru → 82.202.156.157` earlier)

```
dig +short transcriber.itsalt.ru     → 82.202.156.157
curl https://transcriber.itsalt.ru/  → HTTP 200 (placeholder SPA)
curl .../api/health                  → HTTP 502 (expected: no backend yet)
curl https://learn.itsalt.ru/api/health  → HTTP 200 (unaffected)
curl https://mm.learn.itsalt.ru/         → HTTP 200 (unaffected)
TLS:
  issuer=C = US, O = Let's Encrypt, CN = E8
  subject=CN = transcriber.itsalt.ru
  notBefore=May 18 16:52:08 2026 GMT
  notAfter=Aug 16 16:52:07 2026 GMT
```

## Issues encountered + fix

**Issue 1 — reload hang.** First `systemctl reload caddy` hung because Caddy worker (running as `caddy`) couldn't open `/var/log/caddy/transcrib-access.log`: the file is created lazily, and the parent dir is owned by `caddy:caddy` but the new file would be created by whatever uid was attempting first write — which got `EACCES`. This blocked the reload-control process, which systemd then timed out and killed.

**Fix.** Pre-created the log file with explicit ownership:

```bash
sudo touch /var/log/caddy/transcrib-access.log
sudo chown caddy:caddy /var/log/caddy/transcrib-access.log
sudo chmod 0640 /var/log/caddy/transcrib-access.log
```

Then `systemctl restart caddy` (not reload — reload was wedged). The restart was clean: Caddy's bind-takeover keeps :80/:443 open across a fast restart; learn + mm endpoints both stayed 200 across the operation. No client-visible interruption observed in logs.

**Issue 2 — Caddyfile not formatted.** Caddy emits a `warn` about formatting:
```
Caddyfile input is not formatted; run 'caddy fmt --overwrite' to fix inconsistencies
```
Cosmetic only — does not block reload. Defer to a future operational housekeeping pass; running `caddy fmt --overwrite` mass-rewrites the whole Caddyfile and is a separate change.

## Updates to other TECH tasks (lessons learned)

- `.tl/tasks/TECH-020/impl-brief.md` — should call out the **pre-create log file** step. Patching it as part of this result.
- The runbook in TECH-024 should also include verification that the log file exists pre-deploy.

## Definition of done

- [x] Backup of Caddyfile taken.
- [x] transcriber.itsalt.ru block appended; validate passed.
- [x] Caddy active; certificate issued by Let's Encrypt.
- [x] learn + mm vhosts still healthy.
- [x] External HTTPS to transcriber returns the placeholder SPA (200).
- [x] `/api/health` returns 502 (placeholder behaviour — confirms proxy to :3010 is wired but no backend yet).
