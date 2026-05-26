---
id: TECH-026
title: attempt_count Prisma migration (TranscriptionJob + ProtocolGenerationJob)
type: tech
category: database
wave: 11
priority: high
intake_id: FR-001
depends_on: []
blocks: ['UC-200-BE', 'UC-300-BE', 'UC-004-BE']
---

# TECH-026 — attempt_count Prisma migration

> Source: Neo4j domain layer. Attributes TranscriptionJob-A08 (ent-003) and
> ProtocolGenerationJob-A09 (ent-005), both `attempt_count:Int`. FeatureRequest FR-001.

## What to do

Add the `attempt_count` column to two Prisma models and ship the migration. This is the domain
prerequisite the UC-200/UC-300 failure-path refinements depend on (per FR-001 dependencies).

1. **Prisma schema** — add `attempt_count Int @default(0)` to:
   - `TranscriptionJob` (ent-003 → TranscriptionJob-A08)
   - `ProtocolGenerationJob` (ent-005 → ProtocolGenerationJob-A09)
2. **Migration** — generate the Prisma migration (`attempt_count` on both job tables, default 0,
   backfill existing rows to 0).
3. **Shared types** — extend the Zod schemas / DTOs in `shared/` so `attempt_count: number` is
   carried through to BE and FE (fastify-type-provider-zod consumers + FE inferred types).
4. The worker failure handler (UC-200-BE / UC-300-BE refinements) will set `attempt_count` to mirror
   BullMQ `attemptsMade`; UC-004-BE resets it to 0 on retry. This task only lands the column + types.

## Scope
- Pure schema/migration + shared types. No business logic, no worker behaviour change here.

## Acceptance
- [ ] `attempt_count Int @default(0)` present on both models.
- [ ] Migration applies cleanly and backfills existing rows to 0.
- [ ] `shared/` schemas expose `attempt_count: number`.
