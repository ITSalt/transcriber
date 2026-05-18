# TECH-019 — Result

## What was done

Created `ecosystem.config.cjs` at the repository root defining two pm2 apps:

- `transcrib-api` — cwd `/opt/transcrib/api`, script `./dist/server.js`, `max_memory_restart: 512M`
- `transcrib-worker` — cwd `/opt/transcrib/worker`, script `./dist/index.js`, `max_memory_restart: 1024M`

Both apps share:
- `interpreter: /home/deploy/.nvm/versions/node/v20.20.2/bin/node` (Node 20.20.2, pinned per TECH-017)
- `instances: 1`, `exec_mode: 'fork'`
- `env_file: '.env'` (relative — resolves to symlink pointing at `/opt/transcrib/.env`)
- `kill_timeout: 30000`
- `autorestart: true`, `watch: false`, `merge_logs: true`
- `log_date_format: 'YYYY-MM-DD HH:mm:ss Z'`
- Logs under `./logs/` (api-error.log, api-out.log, worker-error.log, worker-out.log)

## Node version pinned

`/home/deploy/.nvm/versions/node/v20.20.2/bin/node` — exact absolute path confirmed by TECH-017.

## Verification output

```
$ node -e "require('./ecosystem.config.cjs')" && echo "EXIT_0_OK"
EXIT_0_OK

$ node -e "console.log(require('./ecosystem.config.cjs').apps.length)"
2

$ node -e "const c=require('./ecosystem.config.cjs'); for (const a of c.apps) if (a.script.startsWith('/')) throw new Error('script must be relative'); console.log('SCRIPTS_RELATIVE_OK')"
SCRIPTS_RELATIVE_OK
```

All three verification checks pass.
