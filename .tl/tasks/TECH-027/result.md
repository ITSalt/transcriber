# TECH-027 — result

**Status:** ready_for_review → see review below. **Work package:** WP-BACKEND-06. **Branch:** `feature/wp-backend-06-contract`.

## Delivered

- Migration `api/prisma/migrations/20261007120000_program_product_schema/migration.sql` (additive; backfills «Роман» + ProtocolVersion v1; `AWAITING_START` placed before `TRANSCRIBING`).
- `api/prisma/schema.prisma` — 13 new models, 6 new enums, Meeting `workspaceId`/`projectId`.
- `shared/src/api/{errors,auth,workspace,project,context,feedback,memory}.ts`, `uc100.ts`, `enums.ts`, `asr/IAsrProvider.ts`, `llm/ILlmProvider.ts`, `llm/ProjectMemoryProvider.ts`; `shared/package.json` `exports["./memory"]`.
- Dependencies: api `@fastify/cookie`, `@fastify/multipart`, `jszip`, `fast-xml-parser`, `neo4j-driver`; worker `neo4j-driver`; shared `neo4j-driver`.
- `api/src/features/index.ts` + `api/src/server.ts` (`registerFeatures`, `featuresDir` option); `worker/src/job-processor.ts` (`loadWorkerModules`, `WorkerEventBus`, `shutdownTargets`, `protocolJobCompleted`) + `worker/src/index.ts`.
- `api`/`worker` build scripts clean `dist` first (auto-registration must never load stale output).

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
| 7 | Stale `dist` would be auto-registered | `rimraf dist tsconfig.tsbuildinfo` before `tsc --build` (api, worker) |
| 8 | Untested `completed` wiring / shutdown order / PATCH | tests added (`createWorkers → workerEvents`, `shutdownTargets` ordering, PATCH) |
| 9 | Deploy builds before migrating | outside this package's paths (`.github/**` = infra stream) — raised to the coordinator |
| 10 | MIME with parameters rejected | compare the base type |
| 11 | Enum value appended after FAILED | `ADD VALUE … BEFORE 'TRANSCRIBING'` |
| 12 | `completed` also fires on early-return | documented on `WorkerEvents` |
| 13 | stale test comment; cast | comment fixed; cast kept (`shutdown.ts` is worker-stream code), isolated in `shutdownTargets` |
