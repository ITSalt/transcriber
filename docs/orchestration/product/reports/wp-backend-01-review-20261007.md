# Сверка — WP-BACKEND-01 (PR https://github.com/ITSalt/transcriber/pull/15, `0f9f56171b` -> `main @ 2570d0a669`) — 2026-10-07

Раунд 1. Дифф: 58 files changed, 2345 insertions(+), 346 deletions(-) (файлов: 58).

**Решение: `REVISE WP-BACKEND-01`** — реализация полная и проверена (изоляция всех 9 маршрутов встреч через единый `preValidation`, lockout с атомарной резервацией, scrypt+HMAC, CLI из dist, миграция вперёд-назад-вперёд на старых данных без дрейфа, 9/9 мутаций ловятся, legacy-режим держит текущий web), но `DROP DEFAULT` в этой миграции даёт окно ~2 мин, в котором старый код на проде не может создать встречу (500 после сборки файла в S3) — это нарушает D-3; DEFAULT остаётся до отдельной миграции-уборки (D-22). Плюс тест на legacy-загрузку без `workspace_id` (контракт прод-окна).

## Пункты REVISE

1. `api/prisma/migrations/20261008120000_meeting_workspace_not_null/migration.sql:28-29` (`DROP DEFAULT`) + `down.sql:79` + `api/test/migrations.down.db.test.ts:201` -> деплой: `migrate deploy` → ~2 мин сборок → `pm2 start`; в этом окне старый код обрабатывает `POST /api/uploads/complete`: объект в S3 собран, `INSERT meetings` без `workspace_id` падает NOT NULL → 500, сирота в S3, пользователь грузит заново (ревьюер замерил окно и воспроизвёл отказ старой вставки) -> требование (D-22, следствие D-3): в этой миграции оставить `DEFAULT = «Роман»` (повторный бэкфилл + `SET NOT NULL` остаются — NOT NULL с DEFAULT совместим со старым кодом); `DROP DEFAULT` — в отдельную миграцию-уборку, когда FRONTEND-02 и новый код живут на проде; привести `down.sql` и тест к этому; в `.tl/deploy-plan.md` §10 убрать «деплой в тихое время» как обязательное условие; medium.
2. `api/test/auth-isolation.db.test.ts` -> контракт прод-окна (legacy-принципал грузит без `workspace_id`: init/complete/abort → «Роман», старый ключ `pending/…` принимается) не покрыт тестом PR — ревьюер проверил scratch-тестом (3/3), но тест должен жить в репозитории, иначе следующий пакет его молча сломает -> требование: три кейса в `auth-isolation.db.test.ts` (init/complete/abort без `workspace_id` под legacy, `pending/` ключ); low.

### Не требуется

- Не менять lockout (A-6; окно времени — P-14), cookie, CLI, хук доступа, коды ошибок.
- L-1 (`assertGatedShape` только для фич после `auth`) — backlog: проверка по полной таблице маршрутов в `onReady`.
- Глобальное предупреждение >100/ч без теста, чистка истёкших сессий — backlog.
- CLAUDE.md/AGENTS.md — D-17.

## Вопросы владельцу

- P-14 открыт (окно блокировки); пакет не ждёт.
- R-12 — бэкап БД прода перед merge (блокирует доставку): выполнять после ACCEPTED, непосредственно перед merge.

## Принято как есть / backlog

- Отклонения PR 1–15 приняты (AUTH_REQUIRED по D-20; `speaker_count` по A-5; scripts без зависимостей — lockfile не менялся; доступ как общий `preValidation`; 404 NOT_FOUND вместо кодов (web на них не завязан); изменения существующих тестов — спецификационные; `AUTH_NOT_CONFIGURED` только в api; `lastSeenAt` раз в минуту; CLI из dist; ветка от 2570d0a; накопительные неудачи; `AUTH_REQUIRED` в `.env.example`; порядок загрузки фич; правки `.tl`).
- Автоматические находки review-start (`.env.example`, `.worktreeinclude` без замка) — разрешены шапкой пакета, поток infra без активных пакетов, конфликтов нет.
- L-1 порядок регистрации фич vs `assertGatedShape` — backlog (`onReady`-проверка по всей таблице маршрутов); Info: предупреждение >100/ч без теста; истёкшие сессии не чистятся; `/me` с истёкшей cookie не сбрасывает cookie; нумерация Deviations в PR.
- migrations: safe, reversible — после пункта 1 (DEFAULT остаётся) миграция совместима со старым кодом в окне деплоя; down.sql проверен.
- graph: checked — UC-400..403 детализированы, RQ-058 (D-20), Task UC-400-BE done, FR-003 dev-complete (сессия, граф восстановлен; read-cypher при доставке).

## Автоматические находки

- **пути и замки**: WP-BACKEND-01: shared path .env.example changed without the lock
- **пути и замки**: WP-BACKEND-01: shared path .worktreeinclude changed without the lock

Дифф ревизии (пересдачи): —

---

## Отчёт рецензента (дословно)

# Отчёт рецензента — WP-BACKEND-01 (PR #15, head `0f9f56171b` → `main @ 2570d0a669`)

## 1. Verdict: **ACCEPT with condition** (`ACCEPTED WP-BACKEND-01` with one owner decision P-1 on the deploy window)

The package is implemented completely and defensively: a root-scope gate by matched route pattern, a single `preValidation` membership check for every `/api/meetings/:id…` route (foreign = nonexistent = `404 NOT_FOUND`, verified for all 9 meeting routes including SSE, PDF and download), race-free lockout with reservation before scrypt, scrypt+HMAC PIN storage, CLI from `dist`, and a NOT NULL migration with `down.sql` that I ran forward, back, forward on old-shaped data without drift. The isolation test enumerates routes from Fastify's own `onRoute` and nine mutations I applied (membership filter, preValidation hook, lockout off-by-one, missing version write, key check, list scope ×2, 401 gate, migration backfill) each turned a specific test red. The one real risk is the documented prod window (~1.5–2 min on the VM) in which the still-running old code cannot insert meetings — the package *mandated* `DROP DEFAULT` in this migration, so this is a package-level consequence rather than a session defect; the owner should decide between a quiet-time deploy (as documented) and splitting `DROP DEFAULT` into a later migration (P-1). No High finding. Legacy mode (`AUTH_REQUIRED` unset) keeps the current prod web working end-to-end — I proved it with a scratch test (init/complete/abort without `workspace_id`, old `pending/` keys, list, detail, PUT protocol, SSE, `/me`).

## 2. Scope item -> code -> status (head `0f9f56171b`)

| § | Item | Where | Status / evidence |
|---|---|---|---|
| 2.1 | `.worktreeinclude` (D-1) | `/.worktreeinclude:1-3` (`.env`, `.env.local`) | done |
| 2.2 | PIN login: HMAC lookup, scrypt hash, constant-time, cookie 30 d, hash in DB | `api/src/features/auth/crypto.ts:21-41` (HMAC-SHA256, scrypt N=16384 r=8 p=1 maxmem 64 MiB, `timingSafeEqual`), `routes.ts:117-125` (HttpOnly/Secure/Lax/Path=/, maxAge 30 d), `routes.ts:205-207` (SHA-256 token hash) | done; AC-2 tests `auth-isolation.db.test.ts:151-225` |
| 2.3 | Lockout: XFF only from 127.0.0.1, 10 → 423 exact text, global >100/h warn | `lockout.ts:84,111-124` (trusted peers, last XFF element), `routes.ts:177,184-196`, `lockout.ts:135-151,165-173`, `lockout.ts:187-201` (global, warn once at 101) | done; tests `:173-210`; global warn **not tested** (Info) |
| 2.4 | Global preHandler, 401, `request.auth`, `assertMeetingAccess`/`assertWorkspaceAccess` | `routes.ts:135-162` (onRequest + preValidation), `access.ts:239-278` | done (preValidation instead of preHandler — Deviation 4, fine) |
| 2.5 | Isolation of every route; list by workspace; upload into workspace, `ws/<id>/` keys, presign after check; SSE/PDF/download | `uc-001.ts:24-31` + `uc-001.service.ts:32-34`; `upload-init.ts:49-55`; `upload-complete.ts:22-30,54-55,95-96`; gate covers `events`/`pdf`/`download` (route table printed from `dist`: all under `/api/meetings/:id`) | done; test `:306-367` |
| 2.6 | Hooks: `deferStart`, `ProtocolVersion(USER_EDIT)` same tx, `GraphOutbox` on delete | `uc-100.service.ts:147-260`; `uc-301.service.ts:128-199`; `uc-003.service.ts:99-108` (inside `tx`) | done; tests `:440-478`, `uc-301.test.ts` RQ-050 block |
| 2.7 | CLI create/grant/reset-pin/unblock/blocks; README; `.env.example` | `cli.ts:106-178`; `api/package.json` scripts only; `api/README.md`; `.env.example:+54-62` | done; I ran every command from `dist` (output below) |
| 2.8 | Not: UI, projects, `shared/` | `git diff --stat -- shared/ worker/ web/ pnpm-lock.yaml` → empty | respected |
| 8.a | Migration: re-backfill → DROP DEFAULT → NOT NULL | `migration.sql:22-29` | done; verified on old data (Q1) |
| 8.b | ProtocolVersion reconciliation FR-005 two steps, idempotent | `migration.sql:36-60` (`ON CONFLICT DO NOTHING`) | done; second run `INSERT 0 0` |
| 8.c | `down.sql` + deploy-plan line | `down.sql:74-82`; `.tl/deploy-plan.md:+146-147`, §10 | done; ran twice (idempotent) |

Acceptance criteria:

| AC | Evidence |
|---|---|
| 1 route list from Fastify, 401 everywhere, B→A 404 on every method incl. SSE/PDF/download | `auth-isolation.db.test.ts:33-43` (wraps `fastify()` with `onRoute`), `:295-321`; mutations M1/M2/M8 red |
| 2 login tests | `:151-225`; mutation M3 red (`expected 401 to be 423`) |
| 3 hooks | `:440-478`; mutation M5 red |
| 4 migration on DB with NULL workspace; `user:create --name Роман --workspace Роман` sees old meetings | `migrations.down.db.test.ts:174-213`, `auth-isolation.db.test.ts:422-430`; mutation M4 red |
| 5 typecheck/test green; PR lists routes, CLI, rollback SQL | `pnpm -r typecheck` exit 0; api 262/262 (23 files) locally and in CI; PR body has all three |

## 3. Answers to the risk questions

**Q1 Migration on real-shaped data.** On a second DB I replayed the six migrations through BACKEND-06 as raw SQL, seeded five meetings (one with explicit `workspace_id NULL`, four via DEFAULT), protocols with no version (`edit_count` 0 and 3, `last_edited_at NULL`), one stale (`edit_count 2`, v1 differs), then `prisma migrate deploy` applied only `20261008120000`. Result: all five rows → `00000000-…0001`; `information_schema` `is_nullable=NO, column_default NULL`; `pg_attrdef` has 0 rows for `workspace_id`; `speaker_count integer NULL` present; versions: `GENERATED n=1` for edit_count 0, `LEGACY n=1 created_at=generated_at` for edit_count 3, `LEGACY n=2 created_at=last_edited_at` for the stale one; old-shape `INSERT INTO meetings (id,title,updated_at)` → `null value in column "workspace_id"`. Re-running the body: `UPDATE 0`, steps 4a/4b `INSERT 0 0` (idempotent); the `ADD COLUMN` step errors on rerun, as expected for a non-idempotent DDL (Prisma never reruns; `down.sql` is the path). `prisma migrate diff --exit-code` → "No difference detected". `down.sql`: nullable again, DEFAULT restored, `speaker_count` dropped, 5 version rows kept (documented as intentional in `down.sql:68-70`), `_prisma_migrations` row deleted, old-shape insert works again (lands in «Роман»); second `down.sql` run is a no-op (NOTICE on `DROP COLUMN IF EXISTS`); re-apply → no drift. Partial-state analysis: statements run outside a transaction in order UPDATE → one `ALTER TABLE meetings` (atomic) → `ALTER transcription_jobs` → 4a → 4b. Possible partial states: NOT NULL set without `speaker_count` (handled: `migrations.down.db.test.ts:229-248` reproduces exactly this and proves deploy blocked → down → re-apply), or schema complete with partial reconciliation (re-apply is idempotent). Deploy-plan rollback row present (`.tl/deploy-plan.md:+146`).

**Q2 Isolation.** Route table printed from the built app: `GET/HEAD /api/meetings`, `GET/HEAD/DELETE /api/meetings/:id`, `/events`, `/transcript`, `/transcript/download`, `GET/HEAD/PUT /protocol`, `/protocol/pdf`, `POST /retry`, `GET/HEAD /api/health`, `POST /api/uploads/{init,complete,abort}`, `POST /api/auth/{login,logout}`, `GET/HEAD /api/auth/me`. Every meeting route sits under `/api/meetings/:id`, so the single `preValidation` gate (`routes.ts:149-162`) applies before params/body validation and before `reply.hijack()` of SSE; foreign and nonexistent produce byte-identical `{code:'NOT_FOUND', message:'Не найдено'}` (`access.ts:228-247`; test `:315-316` compares the two bodies). Missing session with `AUTH_REQUIRED=true` → 401 on all 13 non-HEAD routes except health/login/logout (`:295-304`). Legacy principal has `workspaceIds=[Роман]` only (`types.ts:324-330`) and goes through the same `findFirst … workspaceId in` filter — my scratch test confirmed 404 for another workspace's meeting on detail/protocol/events/pdf/transcript/PUT/DELETE and a «Роман»-only list. Gaps in the PR's suite: (a) legacy principal on uploads *without* `workspace_id` is not tested in the PR (I tested it; recommend adding — it is the prod-window contract); (b) `abort` with a foreign key is covered only by code path sharing with `complete`; (c) HEAD variants are filtered out of the enumeration (same handler and gate — acceptable); (d) global 100/h warn untested. Mutation: removing the membership filter (M1) and disabling the hook (M2) each failed "user B on user A's meeting / project" with the 10 s SSE timeout tripping; removing the 401 (M8) failed two tests; list without membership (M7/M7b) failed both the db test and unit T03b.

**Q3 PIN handling.** `pinLookup = HMAC-SHA256(PIN, PIN_PEPPER)` (`crypto.ts:21-23`); `pinHash = scrypt$N$r$p$salt$key` with 16-byte random salt, N=16384/r=8/p=1, keylen 32, maxmem 64 MiB (`:10-29`); verify re-parses params, rejects malformed, `timingSafeEqual` (`:32-41`). Unknown lookup runs the same scrypt on a cached dummy hash (`:43-51`, `routes.ts:190`) — no timing oracle. Client key: raw `socket.remoteAddress`; XFF considered only when the peer is `127.0.0.1`/`::1`/`::ffff:127.0.0.1`, and then only the **last** element, only if `isIP` (`lockout.ts:84,111-124`); Caddy at `127.0.0.1:3010` (`.tl/scripts/transcrib-caddyblock.conf:23`) appends the client IP, so a forged earlier element cannot shift the key (test `:184`). IPv6 keyed by /64. Atomic reservation: one `INSERT … ON CONFLICT DO UPDATE … RETURNING` before any scrypt (`lockout.ts:135-151`); over-limit in-flight attempts get 423 and give the reservation back; the B1 test fires 30 parallel attempts and asserts ≤9 PINs tested (`:189-198`). 423 uses the exact D-8 text from `shared/src/api/errors.ts:53`; success gives back only its own reservation (`:179-185`, test M2 `:200-210`). Infra errors give back the reservation (`routes.ts:198-202`). Cookie: `transcrib_session`, HttpOnly, Secure, SameSite=Lax, Path=/, Max-Age 30 d, DB stores SHA-256 (`AuthSession.tokenHash @unique`); `expiresAt` fixed at login (absolute TTL, not sliding), `lastSeenAt` touched at most once/min via `updateMany`. Logout `deleteMany` by hash. Logging: only two `log.warn` in the feature, with `clientKey`/counts (`lockout.ts:169,199`); Pino redacts `req.headers.cookie`; the error handler logs `error` objects only (`errors.ts:75`), never bodies. CLI output contains no PIN/hash (grep count 0 over all my CLI runs).

**Q4 Legacy mode.** `/me` without session → `{user:{id:'…0002', name:'Роман'}, workspaces:[{id:'…0001', name:'Роман', personal:true}]}` (`routes.ts:102-107`, test `:372-385`, my scratch test). Writes land in «Роман» via `resolveWorkspace` (`access.ts:273-278`). The «Роман» row is created by the BACKEND-06 migration with `ON CONFLICT DO NOTHING` (`20261007120000…/migration.sql:282-284`), has `onDelete: Restrict` from meetings and no CLI delete path; if it were ever missing, legacy uploads would fail with a 500 at the FK — Info only. Legacy mode does **not** widen access: `LEGACY_AUTH.workspaceIds=[Роман]` is frozen and copied per request (`routes.ts:146`); test `:387-405` plus my scratch test show other-workspace meetings are 404 and a session still gives full isolation in this mode. Anonymous flows on the deployed state: list/detail/init/complete/abort/PUT protocol/delete/SSE/`/me` all verified — see the scratch test in §6.

**Q5 Upload flow / deferStart.** `workspace_id` is optional in `UploadInitRequest`/`UploadCompleteRequest`/`UploadAbortRequest` (`shared/src/api/uc100.ts:71,100,112`); the routes call `resolveWorkspace(request, body.workspace_id)` which returns «Роман» for the legacy principal when absent — the current prod web keeps working (scratch test: init → 200 with key `ws/00000000-…0001/<uuid>.mp4`; complete without `workspace_id` → 200 `TRANSCRIBING`, enqueued once; old `pending/old.mp4` key → 200; a `ws/<other>/` key → 400; abort → 200). A signed-in user without `workspace_id` gets `400 WORKSPACE_REQUIRED` — only relevant after FRONTEND-02. `speaker_count` is written on the job always (`uc-100.service.ts:231-236`); `defer_start:true` → `AWAITING_START`, PENDING job, no enqueue, early return (`:244,257-260`); immediate start unchanged (test `:440-453`).

**Q6 CLI.** Scripts run `node dist/features/auth/cli.js <cmd>` (`api/package.json:+21-25`); `api/package.json` diff touches only `scripts`; `pnpm-lock.yaml` diff empty. I built the clone and ran from `dist` against the throwaway DB: without `PIN_PEPPER` → "PIN_PEPPER is not set … refusing" exit 1; `user:create --name Роман --pin … --workspace Роман` → membership on `…0001`; duplicate PIN → "already taken" exit 1; `--pin -` from stdin works; 5-digit PIN → exit 2; `--workspace` without value → exit 2; `grant`, `reset-pin`, `blocks`, `unblock` (unknown → exit 1) all behave as the README says. DB shows `pin_lookup` hex and `scrypt$16384$8$1$…` only. README documents the owner sequence (PIN_PEPPER → user:create Роман → AUTH_REQUIRED=true → pm2 restart), as does deploy-plan §10.

**Q7 PUT protocol versions.** `saveProtocol` opens an interactive transaction, locks the protocol row `FOR UPDATE` and re-reads it, records the replaced text as v1 `GENERATED`/`LEGACY` or next `LEGACY` when history lacks it, then updates protocol+meeting and inserts `USER_EDIT` with `authorUserId` (`uc-301.service.ts:128-199`); `P2002` → `409 PROTOCOL_EDIT_CONFLICT` (`:209-212`). Legacy principal passes `null` (`uc-301.ts:62`) — my scratch test produced `[1 GENERATED null],[2 USER_EDIT null]`; the user path produces author ids (`:455-467`). The row lock serialises concurrent saves, so the unique `(meeting_id,n)` conflict can only come from an external writer — handled anyway.

**Q8 Removed behaviour.** The −346 lines are: `program-schema.down.db.test.ts` (−204) moved verbatim into `migrations.down.db.test.ts:33-143` with helpers extracted to `test/helpers/db.ts`; all three WP-06 cases remain (full/down/re-apply, AWAITING_START refusal, partial) and now roll back the newer migration first. Changed assertions, all declared in Deviation 6: `uc-001.test.ts` T03 (was "no `where`" → now `where:{workspaceId}` + new T03b), `program-schema.db.test.ts` "pre-program insert lands in Роман" → "is rejected" (spec change), `uc-301.test.ts` T06 mock adapted to the interactive transaction (expectations unchanged), `prisma.smoke.test.ts` adds `workspaceId`. Everything else in tests is additive (`meeting.findFirst` mocks, title renames NFR-007 → D-20). Base behaviours removed on purpose: `pending/` keys for new uploads (still accepted on complete/abort for «Роман»), `MEETING_NOT_FOUND`-style codes for nonexistent meetings (web does not match on them — grep of `web/src` empty; `schema.parse` strips extra list fields so the old web parses the new list DTO).

**Q9 Shared paths.** `.env.example` +9: `PIN_PEPPER=` (allowed) and `AUTH_REQUIRED=false` with comments (declared Deviation 13, follows D-20) — safe, no secrets. `.worktreeinclude` new, 3 lines, matches D-1. `.tl/**`: `status.json` +1 task (UC-400-BE, wave 15), new `tasks/UC-400/{task-be,result-be,api-contract}.md`, contract rows "none (NFR-007)" → "session (FR-003)" in UC-001/002/003/100/200/201/300/301/302 plus the 409 for UC-301 and `ws/` keys + `defer_start` in the S3 external contract — coherent with the code.

**Q10 Prod window.** `deploy-production.yml:61-67,103-105`: `migrate deploy`, then four builds, rsync, `pm2 delete` + `start`. In the clone the three builds took 1 m 34 s wall (2 m 18 s CPU); on the 7.8 GiB VM expect ~2 min, plus `pm2 delete/start` (~2 s). During that window the running old code's `finalizeUpload` INSERT has no `workspace_id` and no DEFAULT → `null value … violates not-null` → 500 after `completeMultipartUpload` (orphan S3 object, user must re-upload). Reads, SSE, protocol edits, delete and the worker are unaffected (explicit column selects; `speaker_count` nullable). Note the workflow's own comment "Safe because migrations are additive and compatible with the old code (D-3)" is violated by this one migration — but the package's item 8 explicitly ordered `DROP DEFAULT` here, and the session documented the window in `migration.sql:14-18`, the PR body and `deploy-plan.md` §10 ("deploy in a quiet time"). Judgement: acceptable for a single-owner MVP if deployed in a quiet window; a zero-window alternative exists (keep the DEFAULT now, drop it in the next backend migration — the new code always passes `workspaceId`, Prisma makes it required), which the orchestrator/owner may prefer (P-1).

**Q11 CI.** Run 37693224970 success (1 m 39 s). `ci.yml:64` sets `DATABASE_URL` and `:94` runs `migrate deploy`; the CI log shows `auth-isolation.db.test.ts (20 tests)`, `program-schema.db.test.ts (5)`, `prisma.smoke.test.ts (7)`, `migrations.down.db.test.ts (6)` all ✓, `23 passed (23)`; shared 4 files, worker 18, web 9 — nothing skipped.

## 4. Findings by severity

**Medium**
- **M-1 Prod window after migrate (Q10).** `api/prisma/migrations/20261008120000_meeting_workspace_not_null/migration.sql:28-29` + `.github/workflows/deploy-production.yml:61-105`. Scenario: an upload whose `POST /api/uploads/complete` reaches the old process between `migrate deploy` and `pm2 start` (~2 min) → S3 object assembled, then `INSERT meetings` fails NOT NULL → 500, orphan object, re-upload needed. Not a regression of the code; a consequence of package item 8. Require: owner decision P-1 — (a) accept, deploy in a quiet window with the pre-merge `pg_dump` (documented), or (b) a one-line revision keeping `DEFAULT` in this migration and dropping it in the next backend package's migration (then `down.sql` line 79 and the migration test at `migrations.down.db.test.ts:201` need the matching change). Recommendation: (a) is acceptable given one owner and documented behaviour; (b) is cheaper than it looks and removes the only prod-breaking path.

**Low**
- **L-1 `assertGatedShape` only guards routes registered after the auth plugin** (`routes.ts:133`; feature folders load alphabetically, `features/index.ts:41`). A feature folder sorting before `auth` with `/api/meetings/:meetingId/...` would not be refused at startup and would not be gated by `inScope`. Safety net: the AC-1 test throws on an unknown param name (`auth-isolation.db.test.ts:253-258`), and the known consumer packages (`projects`, `feedback`, `memory`) sort after `auth`. Backlog: also validate at `onReady` over the full route table.
- **L-2 Cumulative lockout without time window** (`lockout.ts:63-66`): a legitimate user who mistypes 10 times over months from one IP is locked until the owner runs `user:unblock`. Declared (Deviation 12, P-14); literal reading of D-8/A-6. Accept; owner question stands.
- **L-3 The PR suite does not cover the legacy upload path without `workspace_id`** (the prod-window contract). I verified it with a scratch test (§6); recommend adding the three cases (init/complete/abort without `workspace_id`, `pending/` key) to `auth-isolation.db.test.ts` in a follow-up, not as a revise condition.

**Info**
- Global ">100 failures/hour" warning (`lockout.ts:187-201`) has no test.
- Expired `auth_sessions` rows are never purged; absolute 30-day TTL, not sliding. Fine at this scale; backlog.
- `GET /api/auth/me` with an expired cookie answers 401 without clearing the cookie — harmless.
- Deviation list numbering in the PR body is out of order (12,13,14,15,9a,9,10,11) — cosmetic.

## 5. Deviations (PR body)

| # | Deviation | Verdict |
|---|---|---|
| 1 | `AUTH_REQUIRED` flag default false (D-20) | accepted — matches D-20 in the brief; verified both modes |
| 2 | `transcription_jobs.speaker_count` in this migration (A-5) | accepted — nullable, additive, in `down.sql` |
| 3 | `api/package.json` scripts only | accepted — verified no dependency/lockfile change |
| 4 | Access check as a common `preValidation` hook, not per-handler | accepted — stronger than per-handler; covers SSE before hijack; verified by mutation |
| 5 | Nonexistent meeting now `404 NOT_FOUND` instead of `MEETING_NOT_FOUND` etc. | accepted — web does not rely on codes (grep); required by "foreign = nonexistent" |
| 6 | Existing tests changed | accepted — every change listed is either a spec change (NFR-007 → NFR-011) or a mock adaptation; old WP-06 down tests fully subsumed |
| 7 | `AUTH_NOT_CONFIGURED` api-only code | accepted — `shared/` untouched is the stronger constraint |
| 8 | `lastSeenAt` touched ≤ once/min via `updateMany` | accepted |
| 9/9a | CLI from `dist`; `closeDb()` export | accepted — verified CLI runs from `dist`; `db.ts:+23-29` is additive |
| 10 | CLAUDE.md/AGENTS.md untouched, `orch.py instructions check` exit 1 "per coordinator" | **claim for the orchestrator to confirm** — out of my scope |
| 11 | Branch from local `origin/main` = `2570d0a` | confirmed — merge-base is `2570d0a669` |
| 12 | Cumulative failures (A-6) | accepted (L-2) |
| 13 | `AUTH_REQUIRED` line in `.env.example` beyond `PIN_PEPPER` | accepted — necessary for D-20; shared-path auto-finding closed |
| 14 | Feature load order vs root `onRequest` | accepted as documented; see L-1 for the `onRoute` corollary |
| 15 | `.tl/` contract edits | accepted — coherent with code |
| — | Undeclared | none found: `.worktreeinclude`/`.env.example` are allowed by the package header; no other shared path touched |

**migrations:** safe/reversible — forward applied on old-shaped data (NULL row backfilled, DEFAULT dropped per `pg_attrdef`, NOT NULL, `speaker_count`, versions reconciled, idempotent steps, no drift); `down.sql` restores the exact post-BACKEND-06 catalog, is idempotent, keeps all rows (backfilled ids and reconciled versions intentionally stay — documented), re-apply clean; partial-failure recovery proven by the PR test. Non-transactional window: ~2 min of old-code meeting INSERT failures (M-1).

## 6. CI, size, tests, mutations

- CI: run 37693224970 pass, 1 m 39 s; db suites executed (not skipped).
- Size: 58 files, +2345/−346; merge-base `2570d0a669` = `origin/main`.
- Commands (disposable clone `/tmp/orch-review.ifchvk/repo` at `0f9f5617`): `pnpm install --frozen-lockfile` → 0; `db:generate` → 0; `shared build` → 0; `pnpm -r typecheck` → 0; `eslint src/features/auth src/routes src/services` → 0 errors; `prisma migrate deploy` on `transcrib_rev` → 7 migrations applied; `vitest run --pool=forks --maxWorkers=2 --testTimeout=60000` (api, with `DATABASE_URL`) → **23 files / 262 tests passed** (`auth-isolation` 20 in 23 s, `migrations.down` 6 in 79 s, `program-schema` 5, `smoke` 7). Builds api+worker+web → 1 m 34 s. Reviewer scratch test `zz-legacy-window.db.test.ts` (legacy principal, no `workspace_id`, `pending/` key, PUT with null author, SSE stream open, `/me`, 503 without pepper) → 3/3 passed.
- Old-data migration scenario on DB `olddata`: documented in Q1 (forward → verify → rerun body → diff → down → verify → down again → re-apply → diff).
- Mutations (each reverted; `git status` clean afterwards):
  - M1 drop `workspaceId in` filter in `assertMeetingAccess` → "user B on user A's meeting" **red**
  - M2 disable `preValidation` hook → same test **red**
  - M3 lockout `>=` → `>` → "10th failure → 423" **red** (`expected 401 to be 423`)
  - M4 delete re-backfill `UPDATE` from `migration.sql` → AC-4 migration test **red** (deploy exit 1 on NOT NULL)
  - M5 remove `USER_EDIT` version create → "PUT protocol appends" **red**
  - M6 disable `assertKeyInWorkspace` → "never gets a 2xx" **red** (`expected 200 to be 400`)
  - M7 list without `resolveWorkspace` → "never gets a 2xx" **red** (list returned A's secret meeting); M7b unit T03b **red**
  - M8 remove `AUTH_REQUIRED` 401 → "without a session: 401 everywhere" and "/me … with true → 401" **red**

## 7. Cleanup

Clone `/tmp/orch-review.ifchvk` removed via `review_clone.sh --cleanup` (`ls` → no such directory); container `orchrev-pg2` removed with `docker rm -f -v` (`docker inspect orchrev-pg2` → `[]`, `docker ps -a` filter → 0 rows). Nothing pushed, no PR comment, no merge; the main checkout `/home/cloudpc/projects/transcriber` was used read-only (`git fetch`, `git show`, `gh` reads).

