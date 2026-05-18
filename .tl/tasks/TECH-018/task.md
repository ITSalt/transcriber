---
id: TECH-018
title: Postgres role, Redis DB index, project layout, .env on server
type: tech
wave: 8
priority: high
depends_on: ['TECH-016', 'TECH-017']
owner: ops
---

# TECH-018 — Postgres role, Redis DB index, project layout, .env on server

## What

Create the isolated data slot (Postgres role + DB, Redis logical DB), the on-disk filesystem layout `/opt/transcrib` + `/var/www/transcrib`, and populate `/opt/transcrib/.env` with PROD values. Mirror the learn pattern exactly so the same operational habits transfer.

## Deliverables

1. Postgres:
   - Role `transcrib` (LOGIN, password generated and stored in `.env`).
   - Database `transcrib` owned by `transcrib`.
   - Created **inside the `learn-postgres` container** (`docker exec learn-postgres psql -U postgres`).
2. Redis:
   - No mutation — Transcrib uses logical DB `/1`. BullMQ prefix `transcrib:` is set in code (TECH-019 / api / worker).
3. Filesystem:
   - `/opt/transcrib/` — empty directory, owner `deploy:deploy`, mode `0755`.
   - `/var/www/transcrib/frontend/dist/` — empty, owner `deploy:www-data`, mode `0755`. Match learn's permissions exactly.
   - Repo cloned to `/opt/transcrib` via `git clone https://github.com/<org>/transcrib.git .` as `deploy`. **Branch:** `main`. (No initial build yet — TECH-024 does the first deploy through GH Actions.)
4. `/opt/transcrib/.env` (mode `0600`, owner `deploy:deploy`) with all required variables — see impl-brief for the full template.
5. Symlink `/opt/transcrib/api/.env -> /opt/transcrib/.env` and `/opt/transcrib/worker/.env -> /opt/transcrib/.env` (created after first clone; both packages read the same secrets).

## Out of scope

- Building or running the app (waits for TECH-024).
- Caddy configuration (TECH-020).
- pm2 ecosystem (TECH-019 + first start in TECH-024).

## Verification

```bash
# Postgres role + db
docker exec learn-postgres psql -U postgres -c '\du transcrib'   # role exists
docker exec learn-postgres psql -U postgres -c '\l transcrib'    # db exists, owner transcrib
PGPASSWORD=<pw> psql -h 127.0.0.1 -U transcrib -d transcrib -c 'SELECT 1'

# Redis isolation
redis-cli -h 127.0.0.1 -n 1 SET transcrib:test 1 EX 60
redis-cli -h 127.0.0.1 -n 1 GET transcrib:test     # → "1"
redis-cli -h 127.0.0.1 -n 0 GET transcrib:test     # → (nil)  — confirms learn (db 0) is untouched

# Filesystem
ls -la /opt/transcrib            # deploy:deploy, monorepo content present
ls -la /var/www/transcrib/       # exists, correct perms
stat -c '%a %U:%G' /opt/transcrib/.env   # 600 deploy:deploy

# learn unaffected
sudo -u deploy pm2 ls            # learn-api + learn-worker still online
curl -sf https://learn.itsalt.ru/api/health
```

## Definition of done

- [ ] All deliverables produced; verification commands pass.
- [ ] `.env` contains all keys from the template in impl-brief, with real values for: DB password, S3 keys (from TECH-016), DEEPGRAM_API_KEY, KIE_API_KEY, JWT secrets.
- [ ] `.env` is never committed; absence enforced by `.gitignore` (already present).
- [ ] learn services still healthy.
