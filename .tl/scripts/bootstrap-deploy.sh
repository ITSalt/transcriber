#!/usr/bin/env bash
# Runs as `deploy` to install Node 20, pnpm, pm2-logrotate.
# Idempotent: safe to re-run.
set -e
source ~/.nvm/nvm.sh
nvm install 20
nvm alias transcrib 20
nvm use 20
echo "NODE_VERSION=$(node --version)"
echo "NODE_PATH=$(which node)"
corepack enable
corepack prepare pnpm@10.33.0 --activate
echo "PNPM_VERSION=$(pnpm --version)"
echo "PNPM_PATH=$(which pnpm)"
if pm2 list 2>/dev/null | grep -q pm2-logrotate; then
  echo "LOGROTATE=already-installed"
else
  pm2 install pm2-logrotate >/dev/null 2>&1 || true
  echo "LOGROTATE=installed-now"
fi
pm2 set pm2-logrotate:max_size 50M >/dev/null
pm2 set pm2-logrotate:retain 14 >/dev/null
pm2 set pm2-logrotate:compress true >/dev/null
echo "LOGROTATE_CONFIGURED=ok"
