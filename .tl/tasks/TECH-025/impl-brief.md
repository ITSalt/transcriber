# TECH-025 — Implementation Brief

> FeatureRequest FR-001. Pure infra.

## Steps
1. `worker/src/queues.ts` — in `parseRedisUrl()`, read `new URL(redisUrl).pathname`, strip the leading `/`, parse to int; if valid, set `db` on the returned ConnectionOptions.
2. Mirror the same parse in `api/src/queue.ts`.
3. Guard: empty/absent path → leave `db` unset (ioredis default 0), preserving today's behaviour.
4. Extend `queues.test.ts` with the db-index cases.

## Notes
- Keep the change minimal — only thread the existing db-index through; do not alter host/port/auth parsing.
