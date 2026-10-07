# TECH-027 — result

**Status:** approved (review below). **Work package:** WP-BACKEND-06. **Branch:** `feature/wp-backend-06-contract`.

## Delivered

- Migration `api/prisma/migrations/20261007120000_program_product_schema/migration.sql` (additive; backfills «Роман» + ProtocolVersion v1; `AWAITING_START` placed before `TRANSCRIBING`).
- `api/prisma/schema.prisma` — 13 new models, 6 new enums, Meeting `workspaceId`/`projectId`.
- `shared/src/api/{errors,auth,workspace,project,context,feedback,memory}.ts`, `uc100.ts`, `enums.ts`, `asr/IAsrProvider.ts`, `llm/ILlmProvider.ts`, `llm/ProjectMemoryProvider.ts`; `shared/package.json` `exports["./memory"]`.
- Dependencies: api `@fastify/cookie`, `@fastify/multipart`, `jszip`, `fast-xml-parser`, `neo4j-driver`; worker `neo4j-driver`; shared `neo4j-driver`.
- `api/src/features/index.ts` + `api/src/server.ts` (`registerFeatures`, `featuresDir` option); `worker/src/job-processor.ts` (`loadWorkerModules`, `WorkerEventBus`, `shutdownTargets`, `protocolJobCompleted`) + `worker/src/index.ts`.
- `api`/`worker` build scripts clean the auto-loaded `dist/features` / `dist/memory` first (auto-registration must never load stale output; prompts and the PDF template stay in place).

## Verification evidence

- `pnpm -r typecheck` green; lint 0 errors.
- Tests (DB migrated from scratch): shared 121/121, api 231/231, worker 247/247, web 155/156 — the one web failure (`RQ-008` 2.5 GiB Blob timeout) reproduces on untouched `origin/main` on this machine.
- Migration on pre-program data (disposable PostgreSQL 16): meetings → «Роман», protocols → v1 GENERATED/LEGACY; `prisma migrate diff` → no drift; enum order `…UPLOADED, AWAITING_START, TRANSCRIBING…`.
- Pre-program code (`origin/main` export, own Prisma client) on the migrated DB: UC-100/001/002/301/004/003 + worker-shaped writes — 6/6; old worker suite 236/236, old api files all green.
- Mutations caught: backfill CASE swap (`program-schema.db.test.ts`), removed `completed` listener (`job-processor.modules.test.ts`).

## Review (nacl-tl-review, read-only reviewer) — CHANGES REQUESTED → fixed

| # | Finding | Resolution |
|---|---|---|
| 1 | `.partial()` of defaulted schemas resets fields on PATCH | update schemas built from default-free fields + `refine(nonEmpty)`; tests assert only sent keys come out |
| 2 | `neo4j-driver` unreachable from worker/api (no hoisting) | added to worker and api; `@transcrib/shared/memory` entry point; neo4j.md §2/§4 updated |
| 3 | Old UC-301 edits leave the current text outside any version | FR-005: two-step reconciliation SQL for the first consumer migration (verified on a scratch DB) |
| 4 | Module load after workers start; a failing module kills the process | modules load before `createWorkers`; failing module rolled back (workers closed, listeners off, provider restored) and skipped |
| 5 | Tag escaping only exact-match | regex: case/whitespace-tolerant, opening tags too; tests |
| 6 | DB test backfill scans the smoke test's rows | backfill SQL narrowed to the case's ids |
| 7 | Stale `dist` would be auto-registered | clean build of the auto-loaded folders (narrowed in R1 below) |
| 8 | Untested `completed` wiring / shutdown order / PATCH | tests added (`createWorkers → workerEvents`, `shutdownTargets` ordering, PATCH) |
| 9 | Deploy builds before migrating | outside this package's paths (`.github/**` = infra stream) — raised to the coordinator |
| 10 | MIME with parameters rejected | compare the base type |
| 11 | Enum value appended after FAILED | `ADD VALUE … BEFORE 'TRANSCRIBING'` |
| 12 | `completed` also fires on early-return | documented on `WorkerEvents` |
| 13 | stale test comment; cast | comment fixed; cast kept (`shutdown.ts` is worker-stream code), isolated in `shutdownTargets` |

## Re-review — CHANGES REQUESTED → fixed

| # | Finding | Resolution |
|---|---|---|
| R1 | `rimraf dist` during deploy deletes prompts / PDF template under running processes | clean only the auto-loaded folders: api `rimraf dist/features tsconfig.tsbuildinfo`, worker `rimraf dist/memory tsconfig.tsbuildinfo`; `tsc --build` overwrites the rest in place |
| R2 | `@transcrib/shared/memory` not resolvable through the `paths` wildcard under Node16 | explicit `"@transcrib/shared/memory": ["../shared/src/memory/index.ts"]` in api and worker tsconfig (verified with a temporary module: typecheck + runtime import via `exports`) |
| R3 | a hanging `register()` would block the core workers | `MODULE_REGISTER_TIMEOUT_MS = 15 s`; timed-out module rolled back, its late ctx calls refused, late workers closed |
| R4 | hooks of a failed module dropped without running | run once, best effort, during rollback |
| R5 | migration file edited after first local applies | the branch was never merged or deployed; any local/dev DB that applied the earlier `20261007120000` must be reset (`prisma migrate reset`) — checksum mismatch otherwise |

## Final review — APPROVED

Third pass: R1–R4 verified fixed. Its two nits are applied: a shutdown hook registered after a timeout rollback is released immediately (like a late worker); the "hangs" test is driven by a gate the test opens itself, no wall-clock races. Gate: web `RQ-008` fails identically on untouched `origin/main` (2.5 GiB Blob allocation on this machine) — not caused by this branch.

## REVISE 1 (orchestrator review, 2026-10-07) — reversible migration

Finding: Prisma applies `migration.sql` non-transactionally; a mid-file failure leaves objects behind and `migrate resolve --rolled-back` + retry fails (`type "ParticipantSide" already exists`).

- `api/prisma/migrations/20261007120000_program_product_schema/down.sql` — the reviewer's verified script, plus a guard: refuses atomically while a meeting is in `AWAITING_START`. One transaction, `IF EXISTS` everywhere, recreates `MeetingStatus` in its old form, deletes the migration's `_prisma_migrations` row.
- `.tl/deploy-plan.md` §5 Rollback model — rule: on a failed/undone run of this migration, `psql -f down.sql` first, then `migrate deploy`; `pg_dump` restore only if `down.sql` fails.
- `api/test/program-schema.down.db.test.ts` (3 tests, own throw-away databases): full apply → down → catalog identical to a reference DB built from the 5 earlier migrations, old meetings/protocols kept, idempotent second run, re-apply + `migrate diff` exit 0, backfills re-done; AWAITING_START guard leaves the schema untouched; partially applied + failed migration blocks `migrate deploy`, down unblocks it, re-apply succeeds. Mutations caught: no enum recreation (2 red), no `_prisma_migrations` delete (3 red).
