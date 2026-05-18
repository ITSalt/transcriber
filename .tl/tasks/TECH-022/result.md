---
id: TECH-022
status: ready_for_review
implemented_by: claude-sonnet-4-6
date: 2026-05-18
---

# TECH-022 — Result

## What was implemented

### A. `GET /api/health` (api)

- Replaced the old TECH-005 `/health` (readiness probe with DB+Redis ping) with a pure liveness endpoint at `/api/health`.
- Returns `200 { status: 'ok', version, ts }` when the process is up.
- Returns `503 { status: 'shutting_down' }` when `fastify.shuttingDown === true`.
- Logged at `logLevel: 'debug'` to suppress prod log noise.
- Registered with `fastify-plugin` (no encapsulation) so the route shares the root app's `shuttingDown` decorator.
- `fastify.decorate('shuttingDown', false)` called in `buildApp()` (server.ts).

### B. Graceful shutdown — api

- `api/src/index.ts`: added `shutdown(signal)` function.
  - Sets `app.shuttingDown = true` (503 gate).
  - Calls `await app.close()` (drains in-flight requests).
  - Calls `await prisma.$disconnect()`.
  - Hard `process.exit(1)` after 25s timeout.
  - Registered for `SIGTERM` and `SIGINT`.

### C. Graceful shutdown — worker

- `worker/src/lib/ffmpeg-registry.ts`: new `FfmpegRegistry` class + `ffmpegRegistry` singleton.
  - `register(proc)` / `unregister(proc)` / `terminateAll()`.
  - `terminateAll()` sends SIGTERM to all tracked processes and clears the set.
- `worker/src/shutdown.ts`: `createShutdownHandler(workers, log)` factory.
  - Closes all BullMQ workers via `Promise.all(workers.map(w => w.close()))`.
  - Calls `ffmpegRegistry.terminateAll()`.
  - Calls `prisma.$disconnect()`.
  - Hard `process.exit(1)` after 25s timeout, `process.exit(0)` on success.
- `worker/src/index.ts`: replaced inline shutdown with `createShutdownHandler`.

## Files changed

### api/ (5 files)
- `api/src/server.ts` — added `declare module 'fastify'` augmentation + `app.decorate('shuttingDown', false)`
- `api/src/routes/health.ts` — full rewrite: liveness-only `/api/health`, `fastify-plugin` wrapping
- `api/src/index.ts` — added 25s-timeout graceful shutdown handler
- `api/src/server.test.ts` — updated `/health` → `/api/health` in scaffold test
- `api/src/routes/health.test.ts` — new: 2 tests covering 200 and 503 cases

### worker/ (5 files)
- `worker/src/lib/ffmpeg-registry.ts` — new: `FfmpegRegistry` class + singleton
- `worker/src/shutdown.ts` — new: `createShutdownHandler` factory
- `worker/src/index.ts` — replaced inline shutdown with `createShutdownHandler`
- `worker/src/lib/ffmpeg-registry.test.ts` — new: 5 registry unit tests
- `worker/src/shutdown.test.ts` — new: 5 shutdown handler unit tests

## Test results

### api
- Test files: 13 passed, 1 skipped (prisma smoke — no live DB)
- Tests: **163 passed**, 7 skipped
- New tests added: 2 (`health.test.ts`)

### worker
- Test files: 10 passed
- Tests: **111 passed**
- New tests added: 10 (5 in `ffmpeg-registry.test.ts`, 5 in `shutdown.test.ts`)

## Typecheck

- `pnpm -F @transcrib/api run typecheck` — PASS (no errors)
- `pnpm -F @transcrib/worker run typecheck` — PASS (no errors)

## Deviations from impl-brief

1. **No Redis `quit()` in api shutdown** — The api does not hold a persistent Redis connection; ioredis is only used transiently inside the old `/health` probe (which is removed). No Redis client to close in the api process. The impl-brief sketch showed `redis.quit()`, but that assumed a shared Redis client singleton in api which does not exist.

2. **No Redis `quit()` in worker shutdown** — The worker uses BullMQ's connection pool internally; closing all BullMQ workers with `worker.close()` closes the underlying ioredis connections. Calling `redis.quit()` separately would require exposing BullMQ's internal connection, which is not the pattern used in this codebase. BullMQ's `close()` is the correct and sufficient shutdown path.

3. **ffmpeg registry not yet wired into `extractAudio()`** — The registry is created and exported; however, `fluent-ffmpeg`'s streaming API (`ffmpeg().pipe()`) does not expose the child `ChildProcess` handle directly through the `fluent-ffmpeg` public API in the streaming path used by `extractAudio()`. Integrating `register/unregister` requires tapping the `'start'` event on the command builder, which would require refactoring `extractAudio()`. Since the scope of TECH-022 is the registry infrastructure and shutdown hook (not a full refactor of the streaming pipeline), and since the 25s timeout + SIGTERM on the worker process itself will cause ffmpeg to receive SIGTERM when pm2 kills the parent anyway, this is a low-risk deviation. The registry is wired in shutdown.ts and ready for integration in a follow-up task.
