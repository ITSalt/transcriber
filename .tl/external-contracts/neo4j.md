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
| **Last updated** | `2026-10-07` |
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
- **API side** — `api/src/features/memory` (reads + confirm/reject/PATCH) with its own
  driver instance from the same env.

Hard rules for every query:

| Rule | Value |
|---|---|
| **Tenant scoping** | Every query is parameterised by **both** `$workspaceId` and `$projectId`; every node carries both as properties. An event looked up by id (`/api/task-events/:id`) adds `workspaceId IN $callerWorkspaceIds`. |
| **Parameters only** | No string-built Cypher; user text is always a parameter. |
| **Transactions** | One meeting's memory update = **one** write transaction (all-or-nothing). |
| **Projections** | `(:Project)`, `(:Meeting)`, `(:Participant)` mirror Postgres ids; they are projections, never edited in Neo4j first. |

Graph model (labels in the memory database):

```
(:Task {id, workspaceId, projectId, code 'T-n', title, description, status, dueDate, mergedInto, updatedAt})
(:Decision {id, workspaceId, projectId, code 'D-n', text, supersededBy, createdAt})
(:TaskEvent {id, workspaceId, projectId, field, oldValue, newValue, validAt, recordedAt, supersededAt,
             source LLM|USER, confidence, reason, reviewState AUTO|PENDING|CONFIRMED|REJECTED, quote, authorUserId})
(:ProjectMemory {workspaceId, projectId, version, summaryMd, sourceMeetingId, createdAt})
(:Task)-[:MENTIONED_IN {quote, startMs, endMs, speakerLabel, kind CREATED|STATUS_UPDATE|REASSIGNED|DUE_CHANGED|MENTIONED}]->(:Meeting)
(:TaskEvent)-[:OF_TASK]->(:Task)   (:TaskEvent)-[:IN_MEETING]->(:Meeting)
(:Task)-[:ASSIGNED_TO]->(:Participant)   (:Task)-[:DEPENDS_ON|DUPLICATE_OF|SUBTASK_OF]->(:Task)
(:Decision)-[:MENTIONED_IN {quote}]->(:Meeting)   (:Decision)-[:LEADS_TO]->(:Task)   (:Decision)-[:SUPERSEDES]->(:Decision)
(:ProjectMemory)-[:OF_PROJECT]->(:Project)   (:ProjectMemory)-[:PREVIOUS]->(:ProjectMemory)
```

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
| Deletions (meeting with a project, project) | `graph_outbox` row in the same Postgres transaction → drained by the worker, `DETACH DELETE`, retried while Neo4j is down (`attempts`, `last_error`, `done_at`) |
| API reads (tasks, decisions, memory, review queue) | sync; Neo4j down → `503 MEMORY_UNAVAILABLE` |

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
