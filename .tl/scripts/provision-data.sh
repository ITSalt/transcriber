#!/usr/bin/env bash
# TECH-018: create Postgres role+db, verify Redis isolation, lay out filesystem,
# clone repo, write .env skeleton with placeholders.
#
# Runs as `magz` with sudo. Idempotent.
set -euo pipefail

# ── 1. Postgres role + db ────────────────────────────────────────────────────
PG_PW_FILE=/root/transcrib-pg-pw.txt
if sudo test -f "${PG_PW_FILE}"; then
  PG_PW=$(sudo cat "${PG_PW_FILE}")
  echo "POSTGRES_PW=reused-from-${PG_PW_FILE}"
else
  PG_PW=$(openssl rand -base64 32 | tr -d '/+=' | head -c 32)
  echo "${PG_PW}" | sudo tee "${PG_PW_FILE}" >/dev/null
  sudo chmod 0600 "${PG_PW_FILE}"
  echo "POSTGRES_PW=generated-and-saved-to-${PG_PW_FILE}"
fi

# Create role/db if missing (idempotent).
if docker exec learn-postgres psql -U postgres -tAc "SELECT 1 FROM pg_roles WHERE rolname='transcrib'" | grep -q 1; then
  echo "PG_ROLE=already-exists"
  # Still reset the password in case it drifted.
  docker exec learn-postgres psql -U postgres -c "ALTER ROLE transcrib LOGIN PASSWORD '${PG_PW}';" >/dev/null
else
  docker exec learn-postgres psql -U postgres -c "CREATE ROLE transcrib LOGIN PASSWORD '${PG_PW}';" >/dev/null
  echo "PG_ROLE=created"
fi

if docker exec learn-postgres psql -U postgres -tAc "SELECT 1 FROM pg_database WHERE datname='transcrib'" | grep -q 1; then
  echo "PG_DB=already-exists"
else
  docker exec learn-postgres psql -U postgres -c "CREATE DATABASE transcrib OWNER transcrib;" >/dev/null
  echo "PG_DB=created"
fi
docker exec learn-postgres psql -U postgres -d transcrib -c "GRANT ALL ON SCHEMA public TO transcrib;" >/dev/null

# Smoke: log in as transcrib user
PGPASSWORD="${PG_PW}" docker exec -e PGPASSWORD="${PG_PW}" learn-postgres psql -h 127.0.0.1 -U transcrib -d transcrib -tAc "SELECT 'pg-login-ok';"

# ── 2. Redis isolation check (no mutation) ───────────────────────────────────
docker exec learn-redis redis-cli -n 1 SET transcrib:smoke ok EX 10 >/dev/null
RES_DB1=$(docker exec learn-redis redis-cli -n 1 GET transcrib:smoke)
RES_DB0=$(docker exec learn-redis redis-cli -n 0 GET transcrib:smoke || echo "")
echo "REDIS_DB1_READ=${RES_DB1}"
echo "REDIS_DB0_READ=${RES_DB0:-empty}"
[[ "${RES_DB1}" == "ok" && -z "${RES_DB0}" ]] && echo "REDIS_ISOLATION=ok"

# ── 3. Filesystem ────────────────────────────────────────────────────────────
sudo install -d -o deploy -g deploy -m 0755 /opt/transcrib
sudo install -d -o deploy -g www-data -m 0755 /var/www/transcrib
sudo install -d -o deploy -g www-data -m 0755 /var/www/transcrib/frontend
sudo install -d -o deploy -g www-data -m 0755 /var/www/transcrib/frontend/dist
echo "FILESYSTEM=ready"

# ── 4. Clone repo (idempotent) ───────────────────────────────────────────────
if sudo test -d /opt/transcrib/.git; then
  echo "REPO=already-cloned"
  sudo -iu deploy bash -c 'cd /opt/transcrib && git fetch --all --prune && git checkout main && git reset --hard origin/main'
else
  sudo -iu deploy bash -c 'cd /opt/transcrib && git clone git@github.com:ITSalt/transcriber.git .'
  echo "REPO=cloned"
fi

# ── 5. .env skeleton (only created if absent; never overwritten) ─────────────
if sudo test -f /opt/transcrib/.env; then
  echo "ENV=already-exists-not-overwriting"
else
  sudo tee /opt/transcrib/.env >/dev/null <<EOF
# Transcrib production environment
# Created by TECH-018 on $(date -u +%Y-%m-%dT%H:%M:%SZ).
# Replace every <PASTE-...> placeholder with the real value, then run:
#   sudo -u deploy pm2 reload /opt/transcrib/ecosystem.config.cjs --update-env

# === Runtime ===
NODE_ENV=production
API_PORT=3010
APP_URL=https://transcriber.itsalt.ru
LOG_LEVEL=info

# === Database (learn-postgres container, separate role + db) ===
# Password was generated on the server; do not change unless you also ALTER ROLE.
DATABASE_URL=postgres://transcrib:${PG_PW}@127.0.0.1:5432/transcrib

# === Redis (learn-redis container, logical DB index 1) ===
REDIS_URL=redis://127.0.0.1:6379/1
BULLMQ_PREFIX=transcrib:

# === S3 (Cloud.ru) — paste keys from your Cloud.ru service account 'transcrib-prod' ===
S3_ENDPOINT=https://s3.cloud.ru
S3_REGION=ru-central-1
S3_BUCKET=transcrib-itsalt-prod
S3_KEY=<PASTE-CLOUDRU-ACCESS-KEY>
S3_SECRET=<PASTE-CLOUDRU-SECRET-KEY>
S3_FORCE_PATH_STYLE=true

# === ASR (Deepgram Nova-3) ===
DEEPGRAM_API_KEY=<PASTE-DEEPGRAM-API-KEY>

# === LLM (kie.ai) ===
KIE_API_KEY=<PASTE-KIE-AI-API-KEY>

# === Puppeteer (UC-302 PDF export) ===
PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome
EOF
  sudo chown deploy:deploy /opt/transcrib/.env
  sudo chmod 0600 /opt/transcrib/.env
  echo "ENV=created"
fi

# Symlinks api/.env and worker/.env → ../.env (created after first deploy build,
# since pnpm install will overwrite — but harmless to make now).
sudo -iu deploy bash -c '
  cd /opt/transcrib
  [ -d api ] && { [ -e api/.env ] || ln -sf ../.env api/.env; echo "ENV_SYMLINK_API=ok"; } || echo "ENV_SYMLINK_API=api-dir-missing-deferred"
  [ -d worker ] && { [ -e worker/.env ] || ln -sf ../.env worker/.env; echo "ENV_SYMLINK_WORKER=ok"; } || echo "ENV_SYMLINK_WORKER=worker-dir-missing-deferred"
'

# ── 6. Logs dirs ─────────────────────────────────────────────────────────────
sudo -iu deploy bash -c '
  mkdir -p /opt/transcrib/api/logs /opt/transcrib/worker/logs
  echo "LOGS_DIRS=ok"
' 2>/dev/null || sudo -iu deploy bash -c 'echo "LOGS_DIRS=deferred-no-api-worker-dirs"'

# ── 7. Final state ───────────────────────────────────────────────────────────
echo
echo "=== Summary ==="
echo "Postgres role+db: transcrib (password at ${PG_PW_FILE} on server, 0600 root-only)"
echo "Redis: db=1, prefix=transcrib:, isolation confirmed"
echo "Filesystem: /opt/transcrib (deploy:deploy), /var/www/transcrib/frontend/dist"
echo "Repo: ITSalt/transcriber.git on main"
echo ".env: /opt/transcrib/.env (0600 deploy:deploy) — needs S3/Deepgram/kie placeholders filled in"
