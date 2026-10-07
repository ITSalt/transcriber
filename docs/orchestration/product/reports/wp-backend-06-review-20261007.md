# Сверка — WP-BACKEND-06 (PR https://github.com/ITSalt/transcriber/pull/12, `8de4cd4b93` -> `main @ b8040ccb2d`) — 2026-10-07

Раунд 1. Дифф: 40 files changed, 3810 insertions(+), 44 deletions(-) (файлов: 40).

**Решение: `REVISE WP-BACKEND-06`** — миграция аддитивна и совместима со старым кодом (проверено на postgres:16 с данными старой схемы, старый код 219/219 на новой схеме, 5 мутаций ловятся), но Prisma применяет её не в транзакции: при сбое посередине объекты остаются, а единственная инструкция в `.tl/deploy-plan.md:144` (`migrate resolve --rolled-back` + повтор) не работает (`type "ParticipantSide" already exists`). Нужен проверенный down-скрипт и правило восстановления в репозитории до merge.

## Пункты REVISE

1. `api/prisma/migrations/20261007120000_program_product_schema/` + `.tl/deploy-plan.md:144` -> `migrate deploy` падает на проде посередине файла (таймаут блокировки, диск, неожиданная строка) → таблицы, колонки и значение enum остались, миграция помечена failed, деплой оборван со старым dist (нормально) → оператор по deploy-plan:144 делает `prisma migrate resolve --rolled-back` и повторяет деплой → `type "ParticipantSide" already exists` → прод застрял на старом коде с половиной схемы -> требование: положить в репозиторий down-скрипт (ревьюер написал и проверил его на полной и на частично применённой БД: после него базовая `schema.prisma` без дрейфа, миграция применяется заново; текст — в отчёте рецензента, Q2) как `api/prisma/migrations/20261007120000_program_product_schema/down.sql` и дописать в `.tl/deploy-plan.md` (раздел отката) правило: «при failed этой миграции — сначала `psql … -f down.sql`, затем `prisma migrate resolve --rolled-back` (или ничего: скрипт удаляет строку `_prisma_migrations`), затем `migrate deploy`; восстановление из pg_dump — только если down.sql не прошёл»; добавить в `program-schema.db.test.ts` (или отдельный db-тест) прогон down.sql после миграции с проверкой, что встречи/протоколы целы и `prisma migrate diff` против базовой схемы пуст; medium (условие merge по D-3 «обратимые миграции»).

### Не требуется

- Не менять саму миграцию, схему, контракты shared, автоподключение, зависимости — приняты.
- Не переписывать миграцию «в транзакцию» и не делить её: аддитивность и идемпотентность бэкфиллов уже дают безопасный повтор после down.sql.
- Не трогать FR-003/FR-005 ради обязанностей BACKEND-01/WORKER-01 (L1, L2): оркестратор вписывает их в тексты пакетов.
- Не создавать `shared/src/memory` (I1) — это WP-WORKER-MEMORY-01; не добавлять i18n-ключ `AWAITING_START` (I2) — поток frontend.

## Вопросы владельцу

нет (R-8 «бэкап БД прода» уже открыт и блокирует доставку)

## Принято как есть / backlog

- Отклонения PR 1–13 приняты (временный DEFAULT на `meetings.workspace_id` — верное решение для окна до BACKEND-01; фиксированный id «Роман»; `snapshotHash` nullable; snake_case/UPPER_CASE; добавки errors.ts/ILlmCompletionProvider/реестр провайдера; featuresDir; UC на уровне реестра; D-17; neo4j-driver в api/worker; порядок enum; проверки на embedded Postgres — ревьюер повторил на postgres:16.15).
- Автоматические находки review-start: `api/src/features/index.ts` — разрешён шапкой пакета; `worker/src/job-processor.modules.test.ts` — новый тест к общему файлу под замком пакета, нужен по AC-4; `worker/tsconfig.json` +1 (`paths` для `@transcrib/shared/memory`) — необъявлено, безвредно, учесть при WP-WORKER-01 (текстовый конфликт в блоке `paths` возможен).
- L1 (обязанность BACKEND-01: повторный бэкфилл `IS NULL → Роман`, `DROP DEFAULT`, `SET NOT NULL`) и L2 (сверка `ProtocolVersion` для протоколов, записанных старым кодом после миграции; SQL в FR-005:59-78) — оркестратор вписывает в WP-BACKEND-01 и WP-WORKER-01.
- I1 `exports["./memory"]` без файла — создаёт WP-WORKER-MEMORY-01; I2 i18n `catalog.status.AWAITING_START` — поток frontend (WP-FRONTEND-02 или web-projects); I3 CI не собирает api/worker (build-скрипты проверены ревьюером) — backlog infra.
- migrations: safe, reversible — при наличии down.sql (пункт 1).
- graph: checked — FR-003..FR-006 (spec-complete), DEC-006..009, ADR-013 (approved), TECH-027 (done) в графе (read-cypher 2026-10-07); `.tl/status.json`, `.tl/tasks/TECH-027/*`, `.tl/changelog.md` согласованы с PR (ревьюер, Q12).

## Автоматические находки

- **пути и замки**: WP-BACKEND-06: api/src/features/index.ts is outside the allowed paths
- **пути и замки**: WP-BACKEND-06: worker/src/job-processor.modules.test.ts is outside the allowed paths
- **пути и замки**: WP-BACKEND-06: worker/tsconfig.json is outside the allowed paths

Дифф ревизии (пересдачи): —

---

## Отчёт рецензента (дословно)

# Review report — PR #12, WP-BACKEND-06 (head `8de4cd4b9345ed4297748b1e261aa61d243fc2db`, base `main` @ `b8040ccb2dc02bd331322a260cb31ed998f5137d`)

## 1. Verdict: **ACCEPT with condition**

The migration is strictly additive (no DROP / ALTER COLUMN TYPE / NOT NULL / RENAME / constraint change on existing tables; the only enum change is `ADD VALUE`), applies cleanly on an empty DB and on a DB with old-shape rows, and both backfills produced exactly what the PR claims on the edge cases requested (edit_count>0 with NULL last_edited_at → LEGACY with created_at = generated_at; edit_count 0 → GENERATED; meeting without protocol → no version row; second `migrate deploy` is a no-op; `prisma migrate diff` DB→schema.prisma = "No difference detected"). The base commit's Prisma client, run against the migrated DB, creates meetings that land in «Роман» through the DB default (its INSERT/SELECT column lists never mention `workspace_id`), lists/reads/edits them, and a delete cascades into `protocol_versions`; the base api suite is 219/219 on the migrated DB. All suites are green in the clone (the single web failure reproduces identically on untouched base and is a 5 s Blob-allocation timeout), and all five mutations I made turned the relevant tests red. The runtime change on prod is nil: from the built `dist` layout `discoverFeatures()` returns `[]` and `loadWorkerModules()` returns no modules.

The condition: `prisma migrate deploy` on this stack does **not** run the migration in a transaction — I proved it by injecting a failing statement at the end: the 13 tables, both new `meetings` columns and the enum value stayed in the DB and the migration was marked failed; after `prisma migrate resolve --rolled-back` a plain retry fails with `type "ParticipantSide" already exists`. The repo's only runbook line (`.tl/deploy-plan.md:144`: "`prisma migrate resolve --rolled-back <name>` … restore from pg_dump") is therefore not a recovery procedure for this migration. D-3's "reversible" holds only with a down script; I wrote and tested one (below) — it removes every program object, keeps every meeting/protocol row and status, after it the **base** `schema.prisma` reports no drift and the new migration re-applies cleanly, and on the partially-applied DB it is the only path that makes `migrate deploy` succeed. Condition: record that script and the "retry requires the down script first" rule where the operator will find it (deploy-plan §Rollback or `api/prisma/migrations/20261007120000_program_product_schema/down.sql`) before or in the same merge slot; the owner's pre-merge pg_dump covers the window meanwhile.

**migrations: safe, reversible** — additive and compatible with old code (verified); reversible with the down script below (verified), not by `prisma migrate resolve` alone.

## 2. Scope → code → status

| Item | Where | Status (my evidence) |
|---|---|---|
| 1 Prisma: 13 tables, 6 enums, `Meeting.workspaceId?` + backfill «Роман», `projectId?`, `AWAITING_START` | `api/prisma/migrations/20261007120000_program_product_schema/migration.sql` (351 lines: enums 26-44, columns 47-48, tables 51-227, indexes 230-278, backfill 1 282-290, FKs 293-338, backfill 2 343-351); `api/prisma/schema.prisma` | Done. Applied on `migtest` (5 old migrations + 3 meetings/2 protocols) and on empty `citest`; all 3 meetings → `00000000-0000-4000-8000-000000000001`; workspace row `Роман / personal=t`; versions `1111→LEGACY@2026-05-20 10:30`, `2222→GENERATED`; enum order `UPLOADED, AWAITING_START, TRANSCRIBING`; `migrate diff --from-config-datasource --to-schema --exit-code` → 0 |
| 1 Existing models unchanged | `schema.prisma` diff of Meeting/Recording/Transcript/Protocol | Only whitespace realignment plus the two new nullable fields/relations on Meeting (`schema.prisma:120-134`); no attribute, default, relation or `@map` of an existing field changed. `prisma migrate status` on the base worktree after the down script: "Database schema is up to date!" |
| 2 shared contracts | `shared/src/api/{errors,auth,workspace,project,context,feedback,memory}.ts`, `uc100.ts`, `enums.ts`, `asr/IAsrProvider.ts`, `llm/ILlmProvider.ts`, `llm/ProjectMemoryProvider.ts` | Done. All listed symbols present (PIN_PATTERN `auth.ts:15`, LOGIN_* 20-24, SESSION_COOKIE_NAME 27, LEGACY_WORKSPACE_ID `workspace.ts:16`, MeetingType `context.ts:20`, FeedbackFields `feedback.ts:85`, memory DTOs, provider registry `ProjectMemoryProvider.ts:26-35`, ILlmCompletionProvider `ILlmProvider.ts:129-139`, AudioInput.keyterms `IAsrProvider.ts:47`, LlmInput.context `ILlmProvider.ts:45`) |
| 3 Dependencies | `api/package.json`, `worker/package.json`, `shared/package.json`, `pnpm-lock.yaml` | Done; `pnpm install --frozen-lockfile` exit 0 in the clone, lock importers add only the 5 declared packages; see Q10 |
| 4 Auto-registration api | `api/src/features/index.ts`, `api/src/server.ts:31,37,83` | Done; `api/test/features-registry.test.ts` 7/7; mutations A and B red |
| 4 Auto-registration worker | `worker/src/job-processor.ts:96-343`, `worker/src/index.ts:24-38` | Done; `worker/src/job-processor.modules.test.ts` 13/13; mutations C and D red |
| 5 Prod behaviour unchanged | runtime diff is exactly `api/src/features/index.ts`, `api/src/server.ts`, `worker/src/index.ts`, `worker/src/job-processor.ts` | From built dist: `discoverFeatures()` → `[]`, `loadWorkerModules()` → `{names:[],failed:[],workers:[],shutdownHooks:[]}`; no existing test file changed (diff stat) |
| 5a Shared-path docs | `.tl/external-contracts/neo4j.md` (131 lines), `.tl/deploy-plan.md` §9 (+28), FR-003..006 files | Present and consistent with the code (env names, driver placement) |
| 5b Graph spec | ADR-013/FR-003/FR-006/DEC-009/TECH-027 existence verified by the orchestrator | `graph:` left to the orchestrator; `.tl` artifacts consistent (see Q12) |
| 6 Not done: login logic, access checks, endpoints, UI | — | Confirmed: no route handlers, no web changes |

Acceptance criteria:

| AC | Status | My evidence |
|---|---|---|
| 1 migrate deploy on DB with meetings/protocols; CI migration job green | Met | `migtest` run above; CI run 37666044596 pass (includes `db:migrate:deploy` step, `ci.yml:93-94`) |
| 2 old code on new schema | Met | base worktree (b8040cc) Prisma client against `migtest`: create → `workspace_id = «Роман»`; findMany/findUnique with includes OK; protocol create/update + status EDITED; delete of meeting 1111 cascaded its LEGACY version. SQL log: `INSERT INTO "public"."meetings" ("id","title","status","language","created_at","updated_at") … RETURNING …` — no `workspace_id`. Base api suite 219/219 on the migrated DB |
| 3 existing tests green unchanged; typecheck | Met | `pnpm -r typecheck` exit 0; shared 121/121, api 231/231 (DB), worker 249/249, web 155/156 (RQ-008 fails identically on base: "Test timed out in 5000ms") |
| 4 auto-registration tests | Met | features-registry 7/7 (temp folder via `buildApp({featuresDir})`), modules test 13/13 |
| 5 Zod parse tests | Met | `program-contract.test.ts` 44/44: PIN accept/reject incl. full-width digits and number type, context, feedback |
| 6 contract list in PR | Met | PR body section "Контракты для пакетов-потребителей" |

## 3. Risk questions

**Q1 Migration SQL.** Every statement is `CREATE TYPE`, `CREATE TABLE`, `CREATE INDEX`, `ALTER TABLE … ADD COLUMN` (nullable), `ADD CONSTRAINT … FOREIGN KEY`, `INSERT … ON CONFLICT`, `UPDATE … WHERE workspace_id IS NULL`, and one `ALTER TYPE "MeetingStatus" ADD VALUE 'AWAITING_START' BEFORE 'TRANSCRIBING'` (line 44). No DROP, no column type change, no NOT NULL on an existing column, no RENAME, no enum recreation, no constraint change on existing tables. `AWAITING_START` is not referenced by any later statement (grep: only line 44); the backfills do not depend on it. The transaction question is moot: Prisma runs this file non-transactionally (proved in Q2). Applied cleanly on an empty DB (6 migrations, `Роман` row created, 0 versions) and on the seeded DB.

**Q2 Backfill correctness, idempotence, operator path, reversibility.** `protocols.meeting_id` is UNIQUE since the init migration (`20260518093851_init/migration.sql:110`), so duplicate `(meeting_id, 1)` is impossible; `generated_at` is NOT NULL (`uc301` migration line 15), so `COALESCE(last_edited_at, generated_at)` can never be NULL; a meeting without a protocol gets no row; `ON CONFLICT DO NOTHING` + `WHERE … IS NULL` make both backfills idempotent (second `migrate deploy` = "No pending migrations"; the DB test re-runs the INSERT twice). Partial failure: Prisma leaves everything applied up to the failing statement and marks the migration failed; `migrate resolve --rolled-back` then plain retry fails (`type "ParticipantSide" already exists`). Operator path that works (tested on the partially-applied DB): run the down script → `migrate resolve --rolled-back` (or nothing, the script also deletes the `_prisma_migrations` row) → `migrate deploy` → "up to date". Down script (tested on the fully migrated DB: 2 meetings/2 protocols/statuses preserved, base `schema.prisma` → no drift, new migration re-applies):

```sql
BEGIN;
ALTER TABLE "meetings" DROP CONSTRAINT IF EXISTS "meetings_workspace_id_fkey";
ALTER TABLE "meetings" DROP CONSTRAINT IF EXISTS "meetings_project_id_fkey";
DROP INDEX IF EXISTS "idx_meetings_workspace_created";
DROP INDEX IF EXISTS "idx_meetings_project_created";
ALTER TABLE "meetings" DROP COLUMN IF EXISTS "workspace_id";
ALTER TABLE "meetings" DROP COLUMN IF EXISTS "project_id";
DROP TABLE IF EXISTS "protocol_feedback","protocol_versions","protocol_generations","meeting_contexts",
  "glossary_terms","project_participants","projects","login_blocks","auth_sessions","memberships",
  "workspaces","users","graph_outbox" CASCADE;
DROP TYPE IF EXISTS "ProtocolFeedbackCategory","ProtocolFeedbackKind","ProtocolVersionKind",
  "ProtocolGenerationKind","MeetingType","ParticipantSide";
-- Postgres cannot drop an enum value: recreate the type (only meetings.status uses it; old code never writes AWAITING_START)
ALTER TYPE "MeetingStatus" RENAME TO "MeetingStatus_old";
CREATE TYPE "MeetingStatus" AS ENUM ('CREATED','UPLOADING','UPLOADED','TRANSCRIBING','TRANSCRIBED','GENERATING_PROTOCOL','PROTOCOL_READY','FAILED','EDITED');
ALTER TABLE "meetings" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "meetings" ALTER COLUMN "status" TYPE "MeetingStatus" USING "status"::text::"MeetingStatus";
ALTER TABLE "meetings" ALTER COLUMN "status" SET DEFAULT 'CREATED';
DROP TYPE "MeetingStatus_old";
DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261007120000_program_product_schema';
COMMIT;
```
It is lossy only for program data (versions/feedback/users written after the migration); old data is untouched.

**Q3 Run.** Done exactly as asked on container `orchrev-pg` (postgres:16.15, 127.0.0.1:55432): 5 old migrations → seed (M1 EDITED, protocol edit_count 3 + last_edited_at NULL; M2 PROTOCOL_READY, edit_count 0 + NULL; M3 FAILED, no protocol; old columns only) → new migration → results as in the table above → second deploy "No pending migrations" → `migrate status` "up to date" → `migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code` → "No difference detected", exit 0 (Prisma 7 CLI rejects `--from-migrations` with `--shadow-database-url`, so the datasource comparison is the check available).

**Q4 Old code on new schema.** Base worktree with its own generated client (Q4 evidence in AC-2). No `$queryRaw`/`$executeRaw`/`SELECT *` in `api/src` or `worker/src` at base or head outside tests (grep empty). Old client's Meeting select list = `id,title,status,language,created_at,updated_at`.

**Q5 Temporary DEFAULT.** Right call for the window: without it a meeting created by old code between `migrate deploy` and WP-BACKEND-01 would have `workspace_id NULL` and WP-BACKEND-01's `SET NOT NULL` would have to re-backfill anyway. The risk (new code silently writing «Роман») is real but bounded to new code shipped before WP-BACKEND-01; the obligation "re-run `IS NULL → Роман` backfill, DROP DEFAULT, SET NOT NULL" is written in the PR contract list, `migration.sql:14` and `schema.prisma:116` — but **not** in `.tl/feature-requests/FR-003-login-workspaces.md` (grep empty). The orchestrator should put it into the WP-BACKEND-01 package text.

**Q6 Drift.** None (Q3). Existing models: see table row "Existing models unchanged".

**Q7 Auto-registration api.** `registerFeatures` runs last (`server.ts:83`), after `errorHandlerPlugin`/`ssePlugin` (58-59) and all core routes; the root error handler and validator/serializer compilers apply to feature routes; each feature is an encapsulated `app.register` (root hooks need `fastify-plugin`, documented `features/index.ts:12-14`); no prefix (`:15`); duplicate routes are rejected by Fastify at registration and surface as a startup error; a missing `dist/features` → `existsSync` false → `[]` (`:37`); in prod `dist/features` holds only `index.js`, which is a file and filtered out (verified from dist: `[]`). Missing default export throws (`:58-60`); `api/src/index.ts:12` awaits `buildApp()` at top level without try/catch, so the rejection crashes the process (exit 1, pm2 restarts) — loud, not a log. `featuresDir` is a plain option only tests pass. Mutation A (drop `routes.ts` from `ROUTE_FILES`) → 2/7 red; mutation B (throw → log+continue) → "fails loudly" red.

**Q8 Auto-registration worker.** The diff inside `createWorkers` is one addition: `protocolWorker.on('completed', …)` emitting `protocolJobCompleted` (`job-processor.ts:96-98`); retries/backoff, kie classification, language and size cap code is untouched (hunks are imports + that listener + new code after `return`). BullMQ `completed` fires after the processor promise resolves, i.e. after the protocol transaction has committed — the event is outside the transaction and cannot roll it back; `WorkerEventBus.emit` wraps sync and async listener failures (`:154-164`), tested. `index.ts`: `onListenerError` → `loadWorkerModules` → `createWorkers` → `shutdownTargets` (module hooks after all workers close, before Prisma disconnect; `shutdown.ts` only calls `close()`, so the `as Worker[]` cast is safe). Module import+register is bounded by `MODULE_REGISTER_TIMEOUT_MS = 15 s` and rolled back on failure. Mutation C (skip every module) → 7/13 red; mutation D (remove the `completed` listener) → event test red.

**Q9 Shared contracts.** Enum values match Prisma 1:1 (ParticipantSide, MeetingType, ProtocolVersionKind, ProtocolFeedbackKind, ProtocolFeedbackCategory, MeetingStatus incl. AWAITING_START); wire is snake_case, DB camelCase via `@map`; nullable-vs-optional is deliberate (`.nullable().default(null)` in PUT bodies, `.nullable()` in responses). Existing exports: `uc100.ts` adds only optional fields and widens `UploadFinalizeResponse.status` from literal to enum — web/worker typecheck green; `enums.ts` adds one value; `IAsrProvider`/`ILlmProvider` add optional fields and new exports only. Backward compatible. Consumers get every item the brief lists (table row 2).

**Q10 Dependencies.** Lock importers add exactly `@fastify/cookie 11.1.2`, `@fastify/multipart 10.1.2`, `fast-xml-parser 5.11.2`, `jszip 3.10.2`, `neo4j-driver 6.2.0` (api), `neo4j-driver` (shared, worker); transitives are pure JS; caret ranges as the repo convention; no change to `pnpm.onlyBuiltDependencies`; `--frozen-lockfile` exit 0. Build scripts: `api`: `rimraf dist/features tsconfig.tsbuildinfo && tsc --build && <copy pdf template>`, `worker`: `rimraf dist/memory tsconfig.tsbuildinfo && tsc --build && <copy prompts>`; `rimraf` was already a devDependency of both at base. Targets are only the auto-loaded folders — safe for running processes; verified both builds twice in a clone, template and prompt folders survive. Note CI builds only `shared` (`ci.yml:99`), so these scripts run for the first time on the prod VM — I ran them for that reason.

**Q11 Prod window.** Between `migrate deploy` and `pm2 start`: old code on new schema (Q4). After `pm2 start`: `server.ts:83` registers nothing (dist has no feature folders); `index.ts` loads no module (`dist/memory` absent) and starts the same two workers; the only new runtime effect is the `completed` listener publishing to a bus with zero subscribers. No new routes, queues or env requirements.

**Q12 .tl consistency.** `.tl/status.json`: TECH-027 `status: approved`, `review_result: approved`, counters +1 tech/+1 task/+1 approved, `in_progress: 0`; the single `"in_progress"` string is the summary key. `.tl/tasks/TECH-027/{task,result}.md` match the PR (review rounds, R1–R5). `.tl/changelog.md` entry dated 2026-10-07 describes the same scope. `graph:` line left to the orchestrator.

**Q13 Security.** `users.pin_lookup` is documented as HMAC-SHA256(PIN, pepper) and `pin_hash` as scrypt (`schema.prisma` User comment), `auth_sessions.token_hash` as SHA-256 of the cookie token — nothing is designed to be stored plain; nothing in this PR writes those tables. Fixtures: `'000000'/'123456'/'987654'` only in Zod parse tests (`program-contract.test.ts:50-61`), `pinHash: 'scrypt$x'`, `pinLookup: 'same'` in the DB test; the PR body contains no PIN or secret.

**Q14 Files outside paths.** `api/src/features/index.ts` — explicitly allowed by the package header: accepted. `worker/src/job-processor.modules.test.ts` — new file testing the locked shared file; required by AC-4; no overlap with worker-stream edits: accepted. `worker/tsconfig.json` +1 line (`"@transcrib/shared/memory": ["../shared/src/memory/index.ts"]`) — undeclared, harmless, needed so memory packages don't edit tsconfig later; collides with WP-WORKER-01 only if that package edits the same `paths` block (textual conflict, not semantic): accepted with the note.

## 4. Findings

**Medium — M1. Non-transactional migration without a recovery runbook.** `api/prisma/migrations/20261007120000_program_product_schema/migration.sql` (whole file), `.tl/deploy-plan.md:144`. Scenario: `migrate deploy` fails mid-file on prod (lock timeout, disk, a surprising row) → tables/columns/enum value remain, migration marked failed, deploy aborts with old dist (fine) → operator follows deploy-plan:144 (`resolve --rolled-back`) → next deploy fails `type "ParticipantSide" already exists` → prod stuck on the old code with a half schema. Require: the down script above (or equivalent) stored in the repo/runbook with the rule "down script first, then resolve, then deploy". This is the merge condition.

**Low — L1. WP-BACKEND-01 obligation not in the FR-003 spec file.** `.tl/feature-requests/FR-003-login-workspaces.md` (grep for drop default/NOT NULL empty); present only in PR body, `migration.sql:14`, `schema.prisma:116`. Scenario: WP-BACKEND-01 written from FR-003 alone ships without `DROP DEFAULT`/`SET NOT NULL` and later code silently files meetings under «Роман». Require: the orchestrator writes it into the WP-BACKEND-01 package text.

**Low — L2. Protocols written by old code after the migration have no ProtocolVersion.** Observed: my old-code script created and edited a protocol on the migrated DB; `protocol_versions` gained no row. Covered by the PR's Risks section and the reconciliation SQL in `FR-005-protocol-versions-feedback.md:59-78`; the first consumer (WP-BACKEND-01 or WP-WORKER-01) must run it. Require: carry it into both package texts.

**Info — I1.** `shared/package.json` `exports["./memory"]` and both tsconfig `paths` point at `shared/src|dist/memory/index.*`, which do not exist in this PR; nothing imports it, so no effect; WP-WORKER-MEMORY-01 must create it. **I2.** Web has no i18n key `catalog.status.AWAITING_START` (raw value fallback) — unreachable until a package writes that status; frontend stream follow-up, as the PR says. **I3.** CI does not build `api`/`worker`; the new build scripts were verified here, but the gap stays (pre-existing, infra stream).

No regressions against the base found: every base capability (upload→meeting, list, detail, delete+cascade, protocol edit, retry status writes, graceful shutdown order) is still present and exercised either by the base suite on the migrated DB or by the unchanged tests.

## 5. Deviations (PR body 1–13)

1 temporary DEFAULT — accepted (Q5), with L1. 2 fixed «Роман» id — accepted; same literal in SQL, schema and `LEGACY_WORKSPACE_ID` (test asserts it). 3 `snapshotHash` nullable + `updatedAt` — accepted; draft/snapshot lifecycle documented in schema. 4 snake_case / UPPER_CASE — accepted; matches existing API. 5 extras (errors.ts, ILlmCompletionProvider, provider registry, GET context/memory-refs, outbox ops) — accepted; additive. 6 files outside paths — accepted (Q14). 7 `featuresDir` — accepted; test-only seam. 8 UC at registry level — accepted; orchestrator's graph line. 9 D-17 instructions check exit 1 — accepted per coordinator. 12 neo4j-driver in api/worker, `./memory` entry, narrowed clean build — accepted; verified builds. 13 `ADD VALUE … BEFORE` — accepted; enum order verified. 10 spec-first order inside the package — accepted as declared. 11 embedded Postgres instead of docker — accepted; I re-ran the checks on real postgres:16.15. Undeclared: `worker/tsconfig.json` +1 line (mentioned in deviation 12's text but not in the header's shared paths) — accepted with the Q14 note.

## 6. CI, size, tests, mutations

- CI: "Lint + Typecheck + Test" pass, 1m57s (run 37666044596); PR OPEN, MERGEABLE, base main, 6 commits, merge-base = b8040cc.
- Size: 40 files, +3810/−44 (runtime code: 4 files, +579/−6; migration 351 lines; schema +397/−44 of which existing models only re-aligned).
- Clone 1 (`/tmp/orch-review.KvgF7U`): `pnpm install --frozen-lockfile` 0; `db:generate` 0; shared build 0; `pnpm -r typecheck` 0; shared 121/121; api (DATABASE_URL=citest) 231/231 incl. `program-schema.db.test.ts` 5/5, `prisma.smoke.test.ts` 7/7, `features-registry.test.ts` 7/7; worker 249/249; web 155/156 (RQ-008 timeout, identical on base). Base worktree b8040cc in the same clone: api 219/219 against the migrated DB (`migtest`), old-client script 4/4 steps.
- DB experiments on `orchrev-pg` (postgres:16.15): old-then-new migration with seeded rows; empty-DB migration; double deploy; `migrate diff` no drift; injected-failure run (non-transactional, tables left); down script on full and partial DBs; base-schema drift check after down (exit 0); re-apply.
- Mutations (all restored, `git status` clean afterwards): A `ROUTE_FILES` without `routes.ts` → 2 failed/7; B missing-default throw → log → 1 failed; C `loadWorkerModules` skips all → 7 failed/13; D remove `completed` listener → 1 failed; E swap LEGACY/GENERATED in the backfill CASE → `program-schema.db.test.ts` 1 failed/5.
- Clone 2 (`/tmp/orch-review.4kXwiy`): api and worker `build` twice, exit 0; dist discovery `[]` / no modules.

## 7. Cleanup

Removed: worktree `/tmp/orch-review.KvgF7U/old`, clone `/tmp/orch-review.KvgF7U` (via `review_clone.sh --cleanup`), clone `/tmp/orch-review.4kXwiy` (same), container `orchrev-pg` with its anonymous volume (`docker rm -f -v`; `docker ps -a --filter name=orchrev` → 0). `ls /tmp/orch-review.*` → none. Nothing was pushed, commented, approved or merged; the main checkout and the module worktree were only read.

