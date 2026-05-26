# TECH-026 — Test Spec

## Scenarios
- [ ] Migration applies on a fresh DB and on a DB with existing job rows (rows backfilled to attempt_count=0).
- [ ] Prisma client exposes `attempt_count` on both job models.
- [ ] `shared/` Zod schema accepts an integer >= 0 for attempt_count and rejects negatives/non-integers.
- [ ] `api/` and `worker/` typecheck against the regenerated client + shared types.
