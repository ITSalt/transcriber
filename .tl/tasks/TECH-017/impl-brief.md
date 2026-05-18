# TECH-017 — Implementation brief

All commands run over SSH. Steps gated by user OK before any `sudo` action.

## 1. Swap file (2 GB)

```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
sudo sysctl vm.swappiness=10
echo 'vm.swappiness=10' | sudo tee /etc/sysctl.d/99-transcrib-swap.conf
```

Rationale: with 0 swap, a transient ffmpeg+Chromium memory spike under load would invoke the OOM killer on a random victim — potentially `learn-api`. `swappiness=10` keeps swap dormant unless RAM is truly exhausted.

## 2. System packages

```bash
sudo apt update
sudo apt install -y ffmpeg chromium-browser unzip rsync
```

`chromium-browser` on Ubuntu 24.04 is a snap-wrapper alias; verify resulting binary path:

```bash
which chromium-browser
chromium-browser --version
# Note the path — TECH-021 needs it for puppeteer-core's executablePath.
```

If the snap path is `/snap/bin/chromium`, prefer it (it's the real binary). Capture path into task result.

## 3. Node 20 LTS under deploy's nvm

Switch to `deploy` user (deploy already has nvm installed for learn):

```bash
sudo -iu deploy bash -lc '
  source ~/.nvm/nvm.sh
  nvm install 20
  nvm alias transcrib 20    # named alias, does not clobber learn (which uses 22)
  nvm use 20
  node --version            # capture exact patch
  which node                # absolute path → record for TECH-019
'
```

**Critical:** do NOT run `nvm alias default 20` — that would change the default for learn's processes too. Learn pins its own absolute path in `/opt/learn/backend/ecosystem.config.cjs`, but a `default` switch could surprise any future shell.

## 4. pnpm via Corepack

```bash
sudo -iu deploy bash -lc '
  source ~/.nvm/nvm.sh
  nvm use 20
  corepack enable
  corepack prepare pnpm@10.33.0 --activate
  pnpm --version
'
```

## 5. pm2-logrotate (if missing)

```bash
sudo -iu deploy bash -lc 'pm2 install pm2-logrotate'
sudo -iu deploy bash -lc '
  pm2 set pm2-logrotate:max_size 50M
  pm2 set pm2-logrotate:retain 14
  pm2 set pm2-logrotate:compress true
'
```

Idempotent: `pm2 install` is no-op if already installed.

## 6. Verification + record

Capture into `.tl/tasks/TECH-017/result.md`:

- `ffmpeg -version` (first line)
- `chromium-browser --version` and binary path
- Node 20 absolute path under deploy's nvm
- `pnpm --version`
- `learn-api` and `learn-worker` still `online` in `pm2 ls`
- `curl -sf -o /dev/null -w "%{http_code}" https://learn.itsalt.ru/api/health` → `200`
