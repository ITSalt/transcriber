---
id: TECH-022
title: /api/health endpoint + graceful shutdown
type: tech
wave: 7
priority: high
depends_on: ['TECH-005']
owner: dev
---

# TECH-022 — /api/health endpoint + graceful shutdown

## What

Add a deploy-grade `/api/health` endpoint (consumed by the deploy workflow's post-deploy probe) and graceful SIGTERM handling for both api and worker (consumed by pm2's `kill_timeout`).

## Deliverables

### 22a. `/api/health` (api)

1. Route: `GET /api/health`, public (no auth), no CSRF, no rate limit.
2. Returns `200 OK` with JSON `{ status: 'ok', version: <git-sha-or-package-version>, ts: <ISO> }` when:
   - HTTP server has accepted the request (trivially true).
   - **Liveness only** — does NOT probe Postgres or Redis (deploy workflow only needs to know the process is up; DB issues are surfaced by other endpoints).
3. `503` only if the app is in the middle of graceful shutdown (set a `shuttingDown` flag at SIGTERM).
4. Logged at `debug` level (not `info`) to keep prod logs noise-free.

### 22b. Graceful shutdown (api)

1. On `SIGTERM`:
   - Set `shuttingDown = true`.
   - `fastify.close()` — stops accepting new connections; lets in-flight requests finish (Fastify default).
   - Close Prisma client, Redis client.
   - Exit 0 within `kill_timeout - 5s` (= 25s).
2. On `SIGINT` (Ctrl-C in dev): same handler.

### 22c. Graceful shutdown (worker)

1. On `SIGTERM`:
   - Call `await worker.close()` on all BullMQ workers — current jobs are allowed to finish; new jobs are not picked up.
   - Drain ffmpeg child processes (if any) by killing them with SIGTERM and awaiting exit.
   - Close Prisma, Redis, S3 (S3 client doesn't need close, but log it).
   - Exit 0 within 25s.

## Out of scope

- Readiness endpoint (`/api/ready` that probes dependencies) — useful for K8s, not for our single-VM pm2 setup.
- Metrics endpoint (Prometheus) — separate task post-MVP.

## Verification

```bash
# Health
curl -sf http://localhost:3010/api/health | jq .
# → {"status":"ok","version":"...","ts":"..."}

# Graceful shutdown — start api locally, then send SIGTERM and observe clean exit
pnpm -F api dev &
PID=$!
sleep 2
kill -TERM $PID
wait $PID
echo "exit: $?"   # → 0 within 25s, no orphaned children
```

Also: simulate in-flight request:

```bash
# Slow endpoint scenario — open a slow request, then SIGTERM
# Expect: in-flight request completes; new requests get 503 or connection refused.
```

## Definition of done

- [ ] `/api/health` returns 200 + JSON.
- [ ] SIGTERM triggers clean exit in both api and worker within 25s.
- [ ] Tests cover both endpoints + a shutdown integration test.
- [ ] PR linked to this task.
