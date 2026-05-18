# TECH-018 — Result

**Executed:** 2026-05-18 via autonomous SSH as `magz`.

## State on server

```
/opt/transcrib                    → ITSalt/transcriber.git @ main (deploy:deploy)
/opt/transcrib/.env               → 0600 deploy:deploy, contains placeholders for S3 + Deepgram + kie keys
/opt/transcrib/api/.env           → symlink to ../.env
/opt/transcrib/worker/.env        → symlink to ../.env
/opt/transcrib/api/logs/          → empty, ready for pm2
/opt/transcrib/worker/logs/       → empty, ready for pm2
/var/www/transcrib/frontend/dist/ → empty, ready for first rsync
/root/transcrib-pg-pw.txt         → 0600 root-only, contains generated Postgres password
```

## Postgres

- Role `transcrib` (LOGIN, no SUPERUSER/CREATEDB/CREATEROLE) created in container `learn-postgres`.
- Database `transcrib` owned by `transcrib`.
- `GRANT ALL ON SCHEMA public` to `transcrib`.
- Smoke: login as `transcrib` succeeded.

## Redis

- Logical DB `/1` reachable; key `transcrib:smoke` set in DB 1, NOT visible in DB 0. Isolation confirmed.
- No mutation to server-side Redis state (only client-side namespacing).

## What the user (you) needs to do

SSH to the server and fill in `/opt/transcrib/.env`:

```bash
ssh magz@82.202.156.157
sudo -u deploy nano /opt/transcrib/.env       # or vi / vim
# Replace <PASTE-CLOUDRU-ACCESS-KEY>, <PASTE-CLOUDRU-SECRET-KEY>,
# <PASTE-DEEPGRAM-API-KEY>, <PASTE-KIE-AI-API-KEY> with real values.
# Save (Ctrl-O Enter Ctrl-X) — perms (0600) are preserved.
```

**Do NOT** change `DATABASE_URL` — the password in it matches the Postgres role I just created. If you reset the Postgres password manually, also paste the new one here.

After all keys are filled — you don't need to restart anything yet. TECH-024 (first deploy) will pick them up.

## .env keys checklist

| Key | Status | Action |
|---|---|---|
| `NODE_ENV`, `API_PORT`, `APP_URL`, `LOG_LEVEL` | filled | — |
| `DATABASE_URL` | filled (generated PG password) | — |
| `REDIS_URL`, `BULLMQ_PREFIX` | filled | — |
| `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_FORCE_PATH_STYLE` | filled | — |
| `S3_KEY`, `S3_SECRET` | **placeholder** | paste from Cloud.ru |
| `DEEPGRAM_API_KEY` | **placeholder** | paste your Deepgram key |
| `KIE_API_KEY` | **placeholder** | paste your kie.ai key |
| `PUPPETEER_EXECUTABLE_PATH` | filled (`/usr/bin/google-chrome`) | — |
