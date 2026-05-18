# TECH-017 — Result

**Executed:** 2026-05-18 via autonomous SSH as `magz`.

## Captured paths (for TECH-018 and TECH-019)

| What | Path / Value |
|---|---|
| Node 20 (absolute, under deploy nvm) | `/home/deploy/.nvm/versions/node/v20.20.2/bin/node` |
| pnpm (under same nvm) | `/home/deploy/.nvm/versions/node/v20.20.2/bin/pnpm` |
| pnpm version | `10.33.0` |
| ffmpeg | `/usr/bin/ffmpeg` (6.1.1-3ubuntu5) |
| **Chrome for Puppeteer** | `/usr/bin/google-chrome` (Google Chrome 148.0.7778.167) |
| Swap | 2.0 GiB at `/swapfile`, `vm.swappiness=10` (persistent via `/etc/sysctl.d/99-transcrib-swap.conf`) |

## Decision: Chrome instead of Chromium

Ubuntu 24.04 ships `chromium-browser` as a snap wrapper which is incompatible with Puppeteer (sandbox confinement, broken xdg-settings, libpxbackend missing). Replaced with Google Chrome stable from `dl.google.com/linux/chrome/deb`:

```bash
wget -qO- https://dl.google.com/linux/linux_signing_key.pub | gpg --dearmor → /usr/share/keyrings/googlechrome-linux-keyring.gpg
echo "deb [arch=amd64 signed-by=...] https://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google-chrome.list
apt install -y google-chrome-stable
apt remove -y chromium-browser    # snap wrapper, unused
```

Headless smoke test (`google-chrome --headless --no-sandbox --print-to-pdf about:blank`) produced a valid 7707-byte PDF.

**Update propagated to:**
- `.tl/tasks/TECH-018/impl-brief.md` — `.env` line `PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome`.
- `.tl/tasks/TECH-019/impl-brief.md` — `interpreter: '/home/deploy/.nvm/versions/node/v20.20.2/bin/node'`.
- `.tl/tasks/TECH-021/impl-brief.md` — Chrome (not Chromium) is the prod binary; no code change needed beyond `PUPPETEER_EXECUTABLE_PATH`.

## Neighbour-impact check

```
learn-api    online uptime 109m  mem 298.4mb
learn-worker online uptime 109m  mem 189.7mb
curl https://learn.itsalt.ru/api/health → 200
```

Both processes never restarted during bootstrap. Mattermost not checked separately but Caddy was not touched.

## Notes

- Kernel update was queued by apt (6.8.0-87 → 6.8.0-111). **Reboot deferred** — not required for transcrib deployment; pm2/Caddy/Docker keep running on current kernel. User decides when to reboot for the kernel CVEs.
- Snap chromium leftover dependencies (libcuda, libnvidia-*) may show in `apt autoremove` — left alone for now to avoid disturbing system state.
