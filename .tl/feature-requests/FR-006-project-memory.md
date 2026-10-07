# Feature Request: FR-006 — Project memory (tasks, decisions, summary) in Neo4j

## Metadata

| Field | Value |
|-------|-------|
| Created | 2026-10-07 |
| Status | spec-complete |
| Source | `/nacl-sa-feature` — program «Модернизация Transcrib до продукта», WP-BACKEND-06 (contract v1) |
| Impact method | Neo4j graph traversal (sa_impact_analysis) + program decisions + research Q-3 |
| Decision | `DEC-009`, `ADR-013` (program: D-11, D-13, D-14, D-16) |
| Implemented by | WP-INFRA-01 (Neo4j on prod), WP-WORKER-MEMORY-01 (pipeline, access layer, outbox), WP-API-MEMORY-01, WP-WEB-MEMORY-01 |

## Feature Description

After each protocol of a project meeting the worker extracts tasks and decisions with
verbatim quotes, resolves them against the project registry, applies them automatically
or through a confirmation queue (D-14), and versions the project summary. Storage is a
separate production Neo4j (ADR-013); deletions in Postgres reach it through a
transactional outbox.

## Impact Summary

| Area | Change | Details |
|------|--------|---------|
| Architecture | NEW MODULE | `mod-memory` (UC 600–699) |
| Domain | +5 entities, +4 enums | GraphOutbox (Postgres); Task, Decision, TaskEvent, ProjectMemory (Neo4j); MemoryTaskStatus, TaskMentionKind, TaskEventSource, TaskEventReviewState |
| Use Cases | +6 NEW | UC-600..UC-605 |
| Use Cases | ~2 MODIFIED | UC-003 (outbox row on delete), UC-300 (`<project_memory>` + completion event) |
| Requirements | RQ-054..RQ-057, ADR-013 | |

## Contract v1 (code)

- Prisma: `GraphOutbox`. Neo4j model: `.tl/external-contracts/neo4j.md`.
- `shared/src/api/memory.ts`: DTOs, `TASK_STATUS_TRANSITIONS` / `canTransitionTaskStatus`,
  `GraphOutboxEntry`, `PROJECT_MEMORY_QUEUE`, `ProjectMemoryJobPayload`.
- `shared/src/llm/ProjectMemoryProvider.ts`: interface, `NoProjectMemoryProvider` (default),
  `get/setProjectMemoryProvider`; `ILlmCompletionProvider` for the memory LLM steps.
- Worker module slot: `worker/src/memory/index.ts` → `register(ctx: WorkerModuleContext)`
  (`worker/src/job-processor.ts`): own queues/workers via `ctx.addWorker`, `ctx.events.on('protocolJobCompleted')`,
  `ctx.setProjectMemoryProvider`, `ctx.onShutdown`.
- Dependency: `neo4j-driver` (shared; not imported by `shared/src/index.ts`, so the web bundle is unaffected).

## New UCs to Plan

- UC-600: Обновить память проекта после протокола (SYSTEM). UC-601: Реестр задач и история.
- UC-602: Очередь подтверждения. UC-603: Ручная правка задачи. UC-604: Решения и сводка.
- UC-605: Синхронизировать удаления в граф памяти (SYSTEM).

## Decisions

- DEC-009 / ADR-013: separate production Neo4j behind `ProjectMemoryProvider`; Postgres is the system of record.

## Skills Invoked

- `nacl-sa-feature`.
