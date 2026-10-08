# External Contract — `neo4j` (project memory)

> **Scope.** The production Neo4j that stores **project memory** (FR-006, ADR-013, D-13).
> It is **not** the `transcrib-neo4j` container on `bolt://localhost:3627` that holds the
> nacl specification graph — that one is a dev tool for skills and never touched by the
> app. Postgres stays the system of record for workspaces, projects, meetings and
> protocols; Neo4j holds the derived task/decision graph.

## 1. Identity

| Field | Value |
|---|---|
| **Name** | `neo4j` |
| **Kind** | `provider` (self-hosted datastore) |
| **Owner skill** | `nacl-sa-feature` (FR-006) / `nacl-sa-architect` |
| **Consumed by** | `nacl-tl-plan`, `nacl-tl-dev-be`, `nacl-tl-sync`, `nacl-tl-qa` |
| **Created** | `2026-10-07` (WP-BACKEND-06, contract v1) |
| **Last updated** | `2026-10-08` (WP-API-MEMORY-01: graph model as implemented, API routes, DELETE_PROJECT producer) |
| **References** | FR-006, ADR-013, DEC-009, UC-600..UC-605, RQ-054..RQ-057; program decisions D-11, D-13, D-14, D-16; `shared/src/api/memory.ts`, `shared/src/llm/ProjectMemoryProvider.ts`, `worker/src/job-processor.ts` (`WORKER_MODULES`, `register(ctx)`), `api/prisma/schema.prisma` (`GraphOutbox`); runtime/ops: `scripts/README-neo4j.md` (WP-INFRA-01) |

## 2. Endpoint

| Field | Value |
|---|---|
| **Base URL** | `bolt://` / `neo4j://` URI from `MEMORY_NEO4J_URI` (bound to localhost on the prod VM; WP-INFRA-01) |
| **All endpoints** | Bolt sessions only, via `neo4j-driver@^6` — a dependency of `@transcrib/worker`, `@transcrib/api` **and** `@transcrib/shared` (all added by WP-BACKEND-06; `.npmrc` has `shamefully-hoist=false`, so each package that imports the driver declares it). No HTTP API is used. |
| **Discovery** | `static-catalog` |
| **Versioning** | Neo4j 5.x server; driver `neo4j-driver@^6`. Schema (constraints/indexes) applied by the `graph:migrate` script of `worker/` (WP-WORKER-MEMORY-01). |

## 3. Auth

| Field | Value |
|---|---|
| **Scheme** | Basic (user/password) over Bolt |
| **Secret env var** | `MEMORY_NEO4J_URI`, `MEMORY_NEO4J_USER`, `MEMORY_NEO4J_PASSWORD`, `MEMORY_NEO4J_DATABASE` |
| **Missing-secret behavior** | Memory is **off**: the worker module keeps `NoProjectMemoryProvider` (protocols are generated without `<project_memory>`), memory endpoints answer `503 MEMORY_UNAVAILABLE`. Nothing else in the app depends on Neo4j. |
| **Rotation** | Change the env, restart `transcrib-worker` and `transcrib-api` (pm2). |

## 4. Request shape

Where the code lives (WP-WORKER-MEMORY-01 decides the internals):

- **Shared queries** — `shared/src/memory/index.ts`, published as the separate entry point
  `@transcrib/shared/memory` (`shared/package.json` `exports["./memory"]`, added by
  WP-BACKEND-06). It is **never** re-exported from `shared/src/index.ts`, so the web bundle
  never pulls `neo4j-driver`. Both api and worker import their Cypher and mappers from here.
- **Worker side** — `worker/src/graph` (driver lifecycle, writes, outbox drain) and
  `worker/src/memory` (pipeline, `register(ctx)`).
- **API side** — `api/src/features/memory` (reads + confirm/reject/PATCH + meeting
  `memory-refs`) with its own lazily created driver from the same env
  (`api/src/features/memory/graph.ts`). The project/meeting scope comes from the auth plugin's
  access check (`request.projectAccess` / `meetingAccess`); `/api/task-events/:eventId/*`
  resolves the event with `findTaskEventScope(eventId, callerWorkspaceIds)`.

Hard rules for every query:

| Rule | Value |
|---|---|
| **Tenant scoping** | Every query is parameterised by **both** `$workspaceId` and `$projectId`; every node carries both as properties. An event looked up by id (`/api/task-events/:id`) adds `workspaceId IN $callerWorkspaceIds`. |
| **Parameters only** | No string-built Cypher; user text is always a parameter. |
| **Transactions** | One meeting's memory update = **one** write transaction (all-or-nothing). |
| **Projections** | `(:Project)`, `(:Meeting)`, `(:Participant)` mirror Postgres ids; they are projections, never edited in Neo4j first. |

Graph model (labels in the memory database; as implemented by `shared/src/memory`, schema
version 1). Every node except `SchemaVersion` carries `workspaceId` and `projectId`.

```
(:Project {id, workspaceId, projectId, createdAt, taskSeq, decisionSeq, meetingSeq})   -- projection + per-project counters; codes T-n / D-n are never reused
(:Meeting {id, workspaceId, projectId, seq, title, occurredAt})-[:OF_PROJECT]->(:Project)   -- projection
(:Participant {id, workspaceId, projectId, name})-[:OF_PROJECT]->(:Project)                -- projection (ProjectParticipant id)
(:Task {id, workspaceId, projectId, code 'T-n', seq, title, description, status, assigneeName, assigneeParticipantId,
        dueDate, mergedInto, createdInMeetingId, createdAt, updatedAt})   -- state is folded from the task's events
(:Decision {id, workspaceId, projectId, code 'D-n', seq, text, supersededBy, createdInMeetingId, createdAt})
(:TaskEvent {id, workspaceId, projectId, field, creation, oldValue, newValue, oldParticipantId, newParticipantId,
             validAt, recordedAt, appliedAt, supersededAt, ordinal, source LLM|USER, confidence, reason,
             reviewState AUTO|PENDING|CONFIRMED|REJECTED, reviewedAt, reviewedBy, quote, authorUserId, meetingId})
(:ProjectMemory {id, workspaceId, projectId, version, summaryMd, sourceMeetingId, createdAt})
(:Tombstone {id 'MEETING:<id>' | 'PROJECT:<id>', kind, targetId, workspaceId, projectId, deletedAt})   -- service node: a deletion in flight cannot be undone by a late memory update
(:SchemaVersion {id 'project-memory', version, ...})                                                     -- service node: applied graph:migrate version (no tenant ids)
(:Task)-[:MENTIONED_IN {quote, startMs, endMs, speakerLabel, kind CREATED|STATUS_UPDATE|REASSIGNED|DUE_CHANGED|MENTIONED}]->(:Meeting)
(:TaskEvent)-[:OF_TASK]->(:Task)   (:TaskEvent)-[:IN_MEETING]->(:Meeting)
(:Task)-[:ASSIGNED_TO]->(:Participant)   (:Task)-[:DUPLICATE_OF]->(:Task)
(:Decision)-[:MENTIONED_IN {quote, startMs, endMs, speakerLabel}]->(:Meeting)
(:Decision)-[:LEADS_TO]->(:Task)   (:Decision)-[:SUPERSEDES]->(:Decision)
(:ProjectMemory)-[:OF_PROJECT]->(:Project)   (:ProjectMemory)-[:PREVIOUS]->(:ProjectMemory)
```

Notes:

- `DEPENDS_ON` and `SUBTASK_OF` are **not produced in v1** (no pipeline writes them, no API
  reads them); only `DUPLICATE_OF` (from a confirmed `merged_into` event) exists.
- Manual edits (`PATCH /api/projects/:id/tasks/:code`) are stored as `TaskEvent`s with
  `source USER`, `reviewState CONFIRMED`, `authorUserId` = the editor (the legacy principal
  uses the stable `LEGACY_USER_ID`), `meetingId` null. A task's state is always the fold of
  its applied events (`AUTO`/`CONFIRMED`); `PENDING` and `REJECTED` never change it.
- `ProjectMemory` versions are append-only; `PREVIOUS` links to the prior version.

Status values, transitions and the wire DTOs are pinned in `shared/src/api/memory.ts`
(`MemoryTaskStatus`, `TASK_STATUS_TRANSITIONS`, `TaskEvent`, …). Status values are stored
in the same UPPER_CASE form as on the wire.

## 5. Response shape

Driver records are mapped by the access layer into the `shared/src/api/memory.ts` DTOs
(snake_case on the wire). Integers come back as `neo4j.Integer` — convert with
`toNumber()` (all counters here are far below 2^53). Temporal values are stored as ISO
strings to avoid driver temporal types on the wire.

## 6. Lifecycle: sync vs async

| Path | Mode |
|---|---|
| Memory update after a protocol | async: `protocolJobCompleted` worker event → BullMQ queue `project-memory` (`PROJECT_MEMORY_QUEUE`, payload `ProjectMemoryJobPayload`) owned by `worker/src/memory` |
| Prompt memory for a protocol | sync read inside protocol generation through `getProjectMemoryProvider().getPromptMemory(projectId, workspaceId)` (≲ 5 000 tokens; `null` → section omitted) |
| Deletions (meeting with a project, project) | `graph_outbox` row in the same Postgres transaction → drained by the worker, `DETACH DELETE`, retried while Neo4j is down (`attempts`, `last_error`, `done_at`). Producers: `DELETE /api/meetings/:id` (`DELETE_MEETING`, `uc-003.service.ts`, only for a meeting that has a project) and `DELETE /api/projects/:projectId` (`DELETE_PROJECT`, `features/projects/routes.ts`) — the row is written in the same transaction as the delete. |
| API reads (tasks, decisions, memory, review queue, meeting refs) | sync; Neo4j off or down → `503 MEMORY_UNAVAILABLE` |
| API writes (confirm / reject a PENDING event, manual task edit) | sync, one scoped write transaction each; repeat confirm/reject → `409 TASK_EVENT_ALREADY_REVIEWED`; forbidden status change → `400 TASK_STATUS_TRANSITION` (same `canTransitionTaskStatus` as the worker); foreign or unknown project / event / participant → the same `404 NOT_FOUND` |

## 7. File-URL reachability assumptions

N/A — no files are exchanged with Neo4j.

## 8. Failure codes

| Condition | Handling |
|---|---|
| `ServiceUnavailable` / connection refused | API: `503 MEMORY_UNAVAILABLE`; worker memory job: BullMQ retry (`JOB_RETRY_OPTIONS`); protocol generation continues without `<project_memory>` |
| `TransientError` (deadlock, leader switch) | retried by the driver's managed transactions (`executeWrite`) |
| Constraint violation (duplicate `code` in a project) | bug — fail the job, keep the meeting's protocol |
| OOM of the container | container restarts (`-XX:+ExitOnOutOfMemoryError`, D-16); outbox rows wait |

## 9. Model namespace / catalog

N/A (not an LLM provider).

## 10. Fixture-test path

Unit tests run without Neo4j: the access layer is injected; `NoProjectMemoryProvider`
and fakes implement `ProjectMemoryProvider`. Integration tests that need a server gate on
`MEMORY_NEO4J_URI` and skip otherwise (same pattern as `prisma.smoke.test.ts` with
`DATABASE_URL`).

## 11. Smoke-test path

On the VM (owner / WP-INFRA-01): `cypher-shell -a "$MEMORY_NEO4J_URI" -u "$MEMORY_NEO4J_USER"
-p "$MEMORY_NEO4J_PASSWORD" 'RETURN 1'`. App level: with memory enabled, a project meeting
whose protocol is generated gets `T-n` codes in `GET /api/projects/:id/tasks`.

## Optional fields

- **Limits (D-16):** heap 512m (initial = max), pagecache 256m, transaction total max 256m,
  container cap 1536m, `-XX:+ExitOnOutOfMemoryError`; gzip backups, 3 copies rotated, free
  space checked. Revisit after the disk clean-up (R-2) and the first month of operation.
- **Deploy:** `.tl/deploy-plan.md` § «Neo4j памяти проекта».
