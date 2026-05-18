# TECH-019 — Implementation brief

## Why two ecosystem entries, not three (web)?

`web/` is a Vite SPA — it builds to static files in `web/dist/` and is then rsync'd into `/var/www/transcrib/frontend/dist/` where Caddy serves it (TECH-023). No Node process at runtime; no pm2 entry.

## Why `interpreter` pinned absolute?

pm2 is started under `deploy` as a systemd service (already running for learn). systemd sets a stable, sparse PATH that does **not** include `~/.nvm/versions/.../bin`. If we omit `interpreter`, pm2 falls back to whatever `node` it can find — which is system Node 22, not Node 20. We need Node 20 because the project's `.nvmrc` and `engines.node` say so, and worker dependencies have peer constraints we don't want to retest under 22.

Learn does the same thing — its ecosystem uses `/home/deploy/.nvm/versions/node/v22.22.2/bin/node` explicitly.

## Why `exec_mode: 'fork'` and `instances: 1`?

- **API:** single-process Fastify is enough for MVP traffic; SSE streams keep connections alive — clustering complicates SSE without a sticky-session proxy in front. Caddy alone won't provide that.
- **Worker:** BullMQ concurrency is set by `new Worker(name, processor, { concurrency: N })` — running multiple pm2 forks would force coordination via Redis and risk double-processing. Per ADR-009 (NFR-009), MVP processes one video at a time.

## Why `kill_timeout: 30000`?

pm2's default kill timeout is 1600 ms. Worker may be mid-ffmpeg or mid-LLM call — those take longer than 1.6 s to abort cleanly. 30 s gives the worker time to:
1. Mark the in-flight BullMQ job as "stalled" (so it gets retried, not lost).
2. Flush logs.
3. Close DB and Redis connections.

Graceful shutdown handlers themselves are TECH-022.

## Skeleton (target shape — actual values plugged from TECH-017 result.md)

```js
// ecosystem.config.cjs
module.exports = {
  apps: [
    {
      name: 'transcrib-api',
      cwd: '/opt/transcrib/api',
      script: './dist/server.js',
      interpreter: '/home/deploy/.nvm/versions/node/v20.20.2/bin/node', // ← TECH-017
      instances: 1,
      exec_mode: 'fork',
      env_file: '.env',
      max_memory_restart: '512M',
      kill_timeout: 30000,
      autorestart: true,
      watch: false,
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: './logs/api-error.log',
      out_file: './logs/api-out.log',
    },
    {
      name: 'transcrib-worker',
      cwd: '/opt/transcrib/worker',
      script: './dist/index.js',
      interpreter: '/home/deploy/.nvm/versions/node/v20.20.2/bin/node',
      instances: 1,
      exec_mode: 'fork',
      env_file: '.env',
      max_memory_restart: '1024M',
      kill_timeout: 30000,
      autorestart: true,
      watch: false,
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: './logs/worker-error.log',
      out_file: './logs/worker-out.log',
    },
  ],
};
```
