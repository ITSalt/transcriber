---
id: TECH-017
title: Server bootstrap (apt, swap, Node 20, pnpm, ffmpeg, chromium)
type: tech
wave: 7
priority: high
depends_on: []
owner: ops
---

# TECH-017 — Server bootstrap (apt, swap, Node 20, pnpm, ffmpeg, chromium)

## What

Prepare the existing PROD host (`82.202.156.157`, Ubuntu 24.04) with the system-level dependencies Transcrib needs. **Additive only** — must not change anything used by the existing `learn` deployment.

## Deliverables

1. **Swap file** (2 GB) at `/swapfile`, permanent via `/etc/fstab`. Server currently has 0 swap → worker spikes risk OOM-kill of neighbours.
2. **apt packages** installed system-wide: `ffmpeg`, `chromium-browser`, `unzip`, `rsync` (last two if missing). Verified versions captured in deploy log.
3. **Node 20 LTS** installed under `deploy` user's nvm: `nvm install 20 && nvm use 20`. The system Node 22 is **not touched** (used by learn).
4. **pnpm** activated for `deploy`: `corepack enable && corepack prepare pnpm@10.33.0 --activate`.
5. **pm2-logrotate** ensured (if not already): `pm2 install pm2-logrotate` as `deploy` (no-op if already installed).
6. Document the **absolute Node 20 path** for `deploy` (e.g. `/home/deploy/.nvm/versions/node/v20.X.Y/bin/node`) — TECH-019 pins it as the pm2 `interpreter`.

## Out of scope

- No changes to Docker, Postgres, Redis, Caddy, learn directories, or any other running service.
- No new firewall rules.
- No `.env` creation (TECH-018).

## Verification

Run these as `deploy` over SSH:

```bash
free -h               # shows 2.0Gi Swap
sudo swapon --show    # shows /swapfile
ffmpeg -version       # 6.x or newer
chromium-browser --version
source ~/.nvm/nvm.sh && nvm ls    # shows v20.X.Y installed
node --version        # under nvm shell: v20.X.Y
pnpm --version        # 10.33.0
which pnpm            # under deploy's PATH
pm2 ls                # learn-api + learn-worker still online; no transcrib entries yet
```

And check that learn is unaffected:

```bash
curl -sf https://learn.itsalt.ru/api/health
```

## Definition of done

- [ ] All deliverables produced.
- [ ] All verification commands pass.
- [ ] learn health check still returns 200.
- [ ] Absolute Node 20 path recorded in the task `result.md` for TECH-019 to consume.
