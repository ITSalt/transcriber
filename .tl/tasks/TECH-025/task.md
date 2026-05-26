---
id: TECH-025
title: Redis URL db-index dropped by parseRedisUrl()
type: tech
category: infra
wave: 11
priority: medium
intake_id: FR-001
depends_on: []
blocks: []
---

# TECH-025 — Redis URL db-index dropped by parseRedisUrl()

> Source: FeatureRequest FR-001 (recommended TECH ticket). Pure infra; no spec/graph change.

## Problem

`worker/src/queues.ts:parseRedisUrl()` (and `api/src/queue.ts`) drop the URL path db-index, so the
worker connects to Redis DB 0 even when `REDIS_URL` ends in `/1`. Harmless today (producer + consumer
agree on DB 0), but a latent foot-gun once envs diverge (e.g. a `/1` URL silently lands on DB 0).

## What to do

1. In `parseRedisUrl()`, parse the URL path db-index (the trailing `/<n>`) and pass `db: <n>` through
   to the BullMQ `ConnectionOptions`. Do the same in `api/src/queue.ts`.
2. Default to DB 0 when no db-index is present (preserve current behaviour).
3. Add/extend the unit test — `queues.test.ts` already covers `parseRedisUrl`; add a case asserting
   `redis://host:6379/3` yields `db: 3` and a no-db URL yields `db: 0` (or undefined).

## Scope
- Independent of the rest of FR-001 (no DEPENDS_ON edge). Pure infra; no domain/graph change.

## Acceptance
- [ ] `parseRedisUrl('redis://host:6379/1')` produces ConnectionOptions with `db: 1`.
- [ ] No-db URL preserves the current DB-0 behaviour.
- [ ] Both producer (`api/src/queue.ts`) and consumer (`worker/src/queues.ts`) honour the db-index.
- [ ] Unit test added in `queues.test.ts`.
