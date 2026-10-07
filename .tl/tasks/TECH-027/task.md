---
id: TECH-027
title: Program contract v1 — Postgres schema + backfills, shared contracts, dependencies, feature auto-registration
type: tech
category: database+contracts
wave: 14
priority: high
intake_id: FR-003, FR-004, FR-005, FR-006
work_package: WP-BACKEND-06
depends_on: []
blocks: ['WP-BACKEND-01', 'WP-API-PROJECTS-01', 'WP-API-FEEDBACK-01', 'WP-API-MEMORY-01', 'WP-WORKER-01', 'WP-WORKER-MEMORY-01', 'WP-WEB-*']
---

# TECH-027 — Program contract v1

> Source: Neo4j graph — FR-003..FR-006, DEC-006..DEC-009, ADR-013; entities ent-007..ent-023,
> Meeting-A07/A08; enumerations ENUM-ParticipantSide … ENUM-TaskEventReviewState,
> ENUM-MeetingStatus-V08 (AWAITING_START); requirements RQ-040..RQ-057, NFR-010, NFR-011.

## What to do

1. **Prisma** (`api/prisma/schema.prisma`) — every Postgres table of the program; one
   strictly additive migration `20261007120000_program_product_schema`:
   - User, Workspace, Membership, AuthSession, LoginBlock;
   - Meeting.workspaceId (nullable, temporary DB default = LEGACY_WORKSPACE_ID), Meeting.projectId,
     MeetingStatus.AWAITING_START;
   - Project, ProjectParticipant, GlossaryTerm, MeetingContext;
   - ProtocolGeneration, ProtocolVersion, ProtocolFeedback; GraphOutbox.
   - Backfills: workspace «Роман» (fixed id) owns every meeting; every Protocol → ProtocolVersion v1
     (LEGACY if edit_count > 0, else GENERATED). Idempotent.
2. **shared/** — Zod contracts `shared/src/api/{errors,auth,workspace,project,context,feedback,memory}.ts`;
   `uc100.ts` gains `workspace_id`, `defer_start`; `AudioInput.keyterms`; `LlmInput.context` +
   section renderer; `ILlmCompletionProvider`; `ProjectMemoryProvider` + `NoProjectMemoryProvider`.
3. **Dependencies** — `@fastify/cookie`, `@fastify/multipart`, `jszip`, `fast-xml-parser` (api);
   `neo4j-driver` (shared).
4. **Auto-registration** — `api/src/features/index.ts` registers every `api/src/features/<name>/routes.ts`
   from `buildApp()`; `worker/src/index.ts` loads `worker/src/memory/index.ts` `register(ctx)` via
   `loadWorkerModules` (`worker/src/job-processor.ts`).

## Scope

No login logic, access checks, endpoints or UI — schemas and wiring only. Production
behaviour unchanged (all pre-existing tests green without changing expectations).

## Acceptance

- [ ] `prisma migrate deploy` on a DB with meetings + protocols: meetings → «Роман», protocols → v1.
- [ ] Pre-program code (origin/main) works on the migrated schema.
- [ ] All existing api/worker/web/shared tests green; `pnpm -r typecheck` green.
- [ ] Auto-registration tests (API feature folder, worker module).
- [ ] Zod parsing tests (PIN, context, feedback).
