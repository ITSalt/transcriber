# Сверка — WP-INFRA-02 (PR https://github.com/ITSalt/transcriber/pull/11, `8253fece3d` -> `main @ 9e5d534ca5`) — 2026-10-07

Раунд 1. Дифф: 1 file changed, 12 insertions(+), 5 deletions(-) (файлов: 1).

**Решение: `REVISE WP-INFRA-02`** — перестановка шагов верна и строго безопаснее базы (мультимножество команд ssh-блока идентично, `bash -n` и YAML ок, CI зелёный), но подсказка отката при упавшей миграции утверждает «откат кода не нужен», тогда как `pnpm install` и `db:generate` уже заменили Prisma-клиент до миграции; формулировку задал сам пакет (п. 3), правка в одну строку.

## Пункты REVISE

1. `.github/workflows/deploy-production.yml:126-128` -> миграция BACKEND-06 падает на проде на строке 59; оператор читает «dist/ не менялся, откат кода не нужен» и ничего не делает; на диске старый `dist` + Prisma-клиент, сгенерированный по новой схеме (строка 51 выполнилась раньше 59) + старая схема БД; pm2 `max_memory_restart` перезапускает api, старый код с новым клиентом выбирает `workspace_id` → `column does not exist` на каждом запросе встреч -> требование: переписать строку 126: «dist/ не менялся, но node_modules и Prisma-клиент уже новые; откат на <previous-sha> обязателен и должен включать `pnpm --filter @transcrib/api run db:generate`», и добавить `db:generate` в цепочку отката на строке 128 (после `pnpm install`); medium. Исходная формулировка п. 3 пакета была ошибочной — это замечание к пакету, не к сессии.

### Не требуется

- Порядок шагов и комментарий (строки 53-59) не трогать — приняты.
- `pm2 reload` в цепочке отката (I-1, предсуществующее) — не в этом пакете.
- Комментарий о Prisma-клиенте в строках 53-58 (I-2) — по желанию, одной фразой.

## Вопросы владельцу

нет

## Принято как есть / backlog

- I-1: цепочка отката использует `pm2 reload`, хотя сам деплой объясняет, почему нужен `delete + start` — предсуществующее, backlog для следующего пакета infra.
- Отклонения PR: «нет» и instructions check exit 1 (D-17) — приняты.
- graph: не требуется (пакет без спецификации).

## Автоматические находки

- не найдено

Дифф ревизии (пересдачи): —

---

## Отчёт рецензента (дословно)

# Review report — PR #11, WP-INFRA-02, head `8253fec` vs main `9e5d534`

## 1. Verdict: ACCEPT with condition

The reorder is exactly what the package asked for and is strictly safer than the base: `db:migrate:deploy` now runs between `db:generate` and the first build, `graph:migrate` did not move, the command multiset of the ssh heredoc is identical before and after (only order + comments changed), the heredoc passes `bash -n`, the YAML parses, and CI on the head SHA is green. The condition concerns the new rollback-hint text (scope item 3): its conclusion "no code rollback is needed" is not true. `dist/` is indeed untouched when the migration fails, but `pnpm install` (line 50) and `db:generate` (line 51) have already replaced `node_modules` and the generated Prisma client *before* the migration runs (line 59), and `@prisma/client@7.8.0` has no postinstall that would regenerate it. After a failed migration the host is in state "old dist + Prisma client generated from the new schema + old DB schema"; the next pm2 `max_memory_restart` boots old code with a client that selects columns that do not exist. The package itself dictated this wording (section 2 item 3), so the flaw originates in the package, not the session; the fix is one line inside the same `echo` block the package already touches.

## 2. Scope items and criteria (head `8253fece3d1265e61547391e81d1f42a195d7192`)

| Item | Where in code (head) | Status |
|---|---|---|
| S1: move `db:migrate:deploy` right after `db:generate`, before builds, with comment | `.github/workflows/deploy-production.yml:51` (`db:generate`), `:53-58` (comment), `:59` (`db:migrate:deploy`), `:62-65` (builds) | Done. Old placement removed (base lines 57-58). |
| S2: `graph:migrate` not moved (after worker build, before rsync) | `:64` worker build → `:72-91` graph:migrate block (`:89`) → `:94` rsync | Done, unchanged; verified by script-level diff. |
| S3: extend "Notify on failure" rollback hint | `:126` | Done as specified, but the specified text is misleading — see Finding M-1. |
| S4: nothing else changed (`ci.yml`, compose, scripts) | `git diff --stat 9e5d534..8253fec`: 1 file, +12/-5 | Done. |
| C1: diff order migrate between generate and first build; graph:migrate after worker; nothing else moved | Extracted heredoc, ordered command lines: `set`(1) → `git`(7-9) → `pnpm install`(12) → `db:generate`(13) → `db:migrate:deploy`(21) → builds(24-27) → `graph:migrate`(51) → `rsync`(56) → `pm2`(64-66). Sorted command multiset base vs head: IDENTICAL. | Met. |
| C2: workflow parses, heredoc passes `bash -n` | `python -I yaml.safe_load`: base OK, head OK; `bash -n head.sh`: OK (66 lines; base 59 lines OK). `actionlint` not installed. | Met. |
| C3: green Deploy to Production + health check after merge, log order migrate→build | Post-merge | Orchestrator's. |

## 3. Answers to the risk questions

**Q1 — does `db:migrate:deploy` depend on build output?** No. `api/package.json` at `9e5d534`: `"db:migrate:deploy": "prisma migrate deploy"`, `"db:generate": "prisma generate"`, `"prisma": {"schema": "prisma/schema.prisma"}`. `api/prisma.config.ts` imports only `prisma/config` and `node:process` and sets `schema: 'prisma/schema.prisma'` and `datasource.url` from `DATABASE_URL`. Inputs: `api/prisma/schema.prisma`, `api/prisma/migrations/**` (git-tracked), the `prisma` CLI from `node_modules` (installed at line 50), and the DB. Nothing from `shared/dist` or `api/dist`. Corroborating: `db:generate`, which loads the same config through the same CLI, already ran before the builds on the base.

**Q2 — DATABASE_URL source.** `prisma.config.ts` does `loadEnvFile('.env')` relative to cwd, falling back to `process.env`. `pnpm --filter @transcrib/api run …` executes with cwd `/opt/transcrib/api`, so it reads `/opt/transcrib/api/.env` — the same file pm2 uses (`ecosystem.config.cjs`: `cwd: '/opt/transcrib/api'`, `env_file: '.env'`). `.env` is gitignored and no build script creates or touches it. Command, cwd and env are identical before and after the move.

**Q3 — comment accuracy / what is already replaced before migrate.** `set -euo pipefail` is script line 1, so a non-zero `prisma migrate deploy` aborts at line 59 before lines 62-65 run; `dist/` is unchanged. `dist/` and `build/` are gitignored and `git ls-tree -r 9e5d534 | grep dist/` returns nothing, so `git reset --hard origin/main` replaces sources only. However, `node_modules` (line 50) and the generated Prisma client (line 51; no `output` override, lands under `node_modules`) are replaced before the migration. `@prisma/client@7.8.0` has no `postinstall`, and root `pnpm.onlyBuiltDependencies` allows only `esbuild`, `@prisma/engines`, `prisma`, so nothing regenerates the client on a later `pnpm install` either. The comment at lines 53-58 is accurate as written; the rollback hint's conclusion at line 126 is not — see M-1.

**Q4 — no step lost.** Counts in the extracted heredoc, base vs head: `pnpm` 7/7, `rsync` 1/1, `pm2` 3/3, `git` 3/3, `set` 1/1, `cd` 2/2. Sorted non-comment line diff is empty. `Health check` and `Configure SSH` steps untouched.

**Q5 — CI.** run 37664461597: headSha `8253fece…`, `pull_request`, completed, success (18:08:00Z → 18:09:49Z). `mergeable: MERGEABLE`.

## 4. Findings

**M-1 (Medium) — `.github/workflows/deploy-production.yml:126`: rollback hint tells the operator no rollback is needed when one is.**
Scenario: WP-BACKEND-06's migration (adds `meetings.workspace_id`) fails on prod at line 59. Deploy aborts; operator reads "dist/ on disk was not changed … so no code rollback is needed" and leaves the host alone. State on disk: old `api/dist` + `node_modules` Prisma client generated from the new schema + old DB schema. pm2 `max_memory_restart: '512M'` restarts `transcrib-api` later; old code calls `prisma.meeting.findMany()`; the new client selects `workspace_id` → `column "workspace_id" does not exist` on every meeting query. Not a regression against the base (base was worse), but the new text actively steers the operator away from the fix. The pre-existing rollback command on line 128 also lacks `db:generate`.
Require: reword line 126 to state that `dist/` is unchanged but `node_modules`/the Prisma client are already new, and that a rollback to `<previous-sha>` must include `pnpm --filter @transcrib/api run db:generate`; add that command to the line-128 rollback chain. Must land before WP-BACKEND-06 merges.

**I-1 (Info) — `:128`: rollback chain uses `pm2 reload ecosystem.config.cjs`** while the deploy itself explains why `delete + start` is needed. Pre-existing, out of scope.

**I-2 (Info) — `:53-58` comment** says nothing about the Prisma client being regenerated earlier; cosmetic once M-1 is addressed.

No regressions against the base: every command present in the base heredoc is present in the head heredoc with the same arguments; steps outside the heredoc are byte-identical.

## 5. Deviations declared in the PR body

1. "None" — accepted: the diff touches only the one permitted file and matches section 2 items 1-4 literally.
2. `orch.py instructions check` exit 1, files untouched — accepted per D-17.

The PR body's line-number table (51, 53-59, 62-65, 89, 94, 126) matches the head file exactly.

## 6. CI, size, tests, mutations

- CI: run 37664461597 on `8253fec` — success.
- Size: 1 file, +12/-5.
- Checks run (scratchpad, from `git show`): heredoc extraction for base and head; `bash -n` both OK; `yaml.safe_load` both OK; ordered command listing; per-prefix step counts; sorted-multiset diff (empty); `git ls-tree` for tracked `dist/` (none); installed `@prisma/client@7.8.0` `package.json` read for postinstall (none).
- Mutations: not applicable (no test exercises the workflow). `actionlint` not available.
- No disposable clone was created; production host not touched.

## 7. Cleanup

Scratch files removed. No clone to remove; the main checkout was read only via `git show`/`git diff`/`gh`.

