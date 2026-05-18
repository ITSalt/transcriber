# TECH-018 — Implementation brief

## 1. Postgres role + database

```bash
PW=$(openssl rand -base64 32 | tr -d '/+=' | head -c 32)
docker exec -i learn-postgres psql -U postgres <<SQL
CREATE ROLE transcrib LOGIN PASSWORD '${PW}';
CREATE DATABASE transcrib OWNER transcrib;
\c transcrib
GRANT ALL ON SCHEMA public TO transcrib;
SQL
echo "Save this password into /opt/transcrib/.env DATABASE_URL: ${PW}"
```

Notes:
- `transcrib` role has no SUPERUSER / CREATEDB / CREATEROLE — it can only operate inside its own DB.
- Prisma migrations write DDL inside `transcrib` DB; no cross-DB access is possible.

## 2. Redis: no server-side change

Redis isolation is enforced by clients:
- `REDIS_URL=redis://127.0.0.1:6379/1` (note the `/1`).
- BullMQ in `worker/` and `api/` is constructed with `{ prefix: 'transcrib:' }`.
- `IORedis` from queue clients picks up the DB index from the URL.

This is **TECH-019's** responsibility on the code side; TECH-018 only verifies isolation works.

## 3. Filesystem

```bash
sudo install -d -o deploy -g deploy -m 0755 /opt/transcrib
sudo install -d -o deploy -g www-data -m 0755 /var/www/transcrib
sudo install -d -o deploy -g www-data -m 0755 /var/www/transcrib/frontend
sudo install -d -o deploy -g www-data -m 0755 /var/www/transcrib/frontend/dist

# Clone as deploy
sudo -iu deploy bash -lc '
  cd /opt/transcrib
  git clone https://github.com/<ORG>/transcrib.git .
  git checkout main
'
```

`<ORG>` — to be confirmed before execution (likely `itsalt` based on learn's org).

## 4. `.env` template (`/opt/transcrib/.env`, mode 0600)

```dotenv
# === Runtime ===
NODE_ENV=production
API_PORT=3010
APP_URL=https://transcriber.itsalt.ru

# === Database (learn-postgres container, separate role + db) ===
DATABASE_URL=postgres://transcrib:<PW_FROM_STEP_1>@127.0.0.1:5432/transcrib

# === Redis (learn-redis container, logical DB index 1) ===
REDIS_URL=redis://127.0.0.1:6379/1
BULLMQ_PREFIX=transcrib:

# === S3 (Cloud.ru) — keys from TECH-016 service account 'transcrib-prod' ===
S3_ENDPOINT=https://s3.cloud.ru
S3_REGION=ru-central-1
S3_BUCKET=transcrib-itsalt-prod
S3_KEY=<paste-from-cloudru-panel>
S3_SECRET=<paste-from-cloudru-panel>
S3_FORCE_PATH_STYLE=true

# === ASR ===
DEEPGRAM_API_KEY=<prod-key>

# === LLM ===
KIE_API_KEY=<prod-key>

# === Puppeteer (TECH-021) ===
PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome  # path captured in TECH-017 result.md

# === Logging ===
LOG_LEVEL=info
```

Permissions:
```bash
sudo chown deploy:deploy /opt/transcrib/.env
sudo chmod 0600 /opt/transcrib/.env
```

Symlinks so api/worker pick up the same file:
```bash
sudo -iu deploy bash -lc '
  cd /opt/transcrib
  [ -e api/.env ] || ln -s ../.env api/.env
  [ -e worker/.env ] || ln -s ../.env worker/.env
'
```

Web (Vite) reads `VITE_API_URL` at build time, not runtime — TECH-023 sets it in the GH Actions deploy step (`VITE_API_URL=/api` since web is served from the same origin via Caddy).

## 5. Why this exact split

- **One `.env` for two pm2 processes** — keeps secret distribution simple and matches learn's pattern.
- **Symlinks instead of copies** — eliminates drift between api and worker views of the same secret.
- **Mode 0600** — only `deploy` can read; `magz` retains read via `sudo`.
- **No `.env` in repo, no `.env.prod` in repo** — single source of truth on the server.
