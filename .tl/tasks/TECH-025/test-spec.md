# TECH-025 — Test Spec

## Scenarios (queues.test.ts)
- [ ] `parseRedisUrl('redis://localhost:6379/1')` → connection options include `db: 1`.
- [ ] `parseRedisUrl('redis://localhost:6379/3')` → `db: 3`.
- [ ] `parseRedisUrl('redis://localhost:6379')` (no path) → db unset / 0 (current behaviour preserved).
- [ ] `parseRedisUrl('redis://localhost:6379/')` (empty path) → db unset / 0.
- [ ] Host, port, and auth parsing unchanged by the patch.
- [ ] Same assertions hold for the `api/src/queue.ts` parser.
