# Сверка — WP-BACKEND-06 (PR https://github.com/ITSalt/transcriber/pull/12, `3fa3500f47` -> `main @ b8040ccb2d`) — 2026-10-07

Раунд 2. Дифф: 42 files changed, 4083 insertions(+), 45 deletions(-) (файлов: 42).

**Решение: `ACCEPTED WP-BACKEND-06`** — пересдача 1 закрыла единственный пункт: `down.sql` рядом с миграцией (атомарный, идемпотентный, с защитой от AWAITING_START), правило восстановления в `.tl/deploy-plan.md`, db-тест на полный и частичный откат; CI зелёный (3/3 новых теста); код пакета не менялся.

## Пункты REVISE

нет

### Не требуется

—

## Вопросы владельцу

R-9 — бэкап БД прода через контейнер `learn-postgres` (на хосте нет `pg_dump`); блокирует доставку.

## Принято как есть / backlog

- Как в раунде 1 (reports/wp-backend-06-review-20261007.md): отклонения 1–13 приняты; L1/L2 вписаны в WP-BACKEND-01 и WP-WORKER-01; I1–I3 backlog.
- Автоматические находки review-start без изменений (api/src/features/index.ts — разрешён шапкой; worker/src/job-processor.modules.test.ts — принят).
- migrations: safe, reversible — down.sql в репозитории, проверен тестом и прогонами.
- graph: checked — FR-003..FR-006, DEC-006..009, ADR-013, TECH-027 (done) в графе (read-cypher 2026-10-07); `.tl` согласован (ревьюер, Q12).

## Автоматические находки

- **пути и замки**: WP-BACKEND-06: api/src/features/index.ts is outside the allowed paths
- **пути и замки**: WP-BACKEND-06: worker/src/job-processor.modules.test.ts is outside the allowed paths
- **пути и замки**: WP-BACKEND-06: worker/tsconfig.json is outside the allowed paths

Дифф ревизии (пересдачи): git -C /home/cloudpc/projects/transcriber diff 8de4cd4b9345ed4297748b1e261aa61d243fc2db 3fa3500f47b74e6473c19285bb65d4e27aa09e01

---

## Отчёт рецензента (дословно)

Пересдачу сверил оркестратор (без агента-рецензента).

Дифф ревизии `8de4cd4..3fa3500`: 4 файла, +273/−1 — только пункт REVISE.
- `api/prisma/migrations/20261007120000_program_product_schema/down.sql` (59 строк): одна транзакция; `DO`-блок отказывает, если есть встречи в `AWAITING_START`; снимает FK/индексы/колонки `meetings.workspace_id/project_id`; `DROP TABLE IF EXISTS` 13 таблиц, `DROP TYPE IF EXISTS` 6 enum; пересоздаёт `MeetingStatus` в доперемиграционном виде с переливкой `status`; удаляет строку `_prisma_migrations`. Совпадает со скриптом ревьюера раунда 1 плюс защита по AWAITING_START и IF EXISTS.
- `.tl/deploy-plan.md:144-145`: пометка, что `migrate resolve --rolled-back` недостаточно для многостейтментной миграции, и отдельная строка-правило для этой миграции (down.sql → `db:migrate:deploy`; pg_dump только если down.sql не прошёл).
- `api/test/program-schema.down.db.test.ts` (204 строки, `describe.skipIf(!DATABASE_URL)`): (1) полное применение → down.sql → каталог равен доперемиграционному, старые строки целы → повторное применение без дрейфа; (2) отказ при AWAITING_START атомарно; (3) частично применённая + failed миграция: deploy заблокирован, down.sql разблокирует, повтор успешен.
- `.tl/tasks/TECH-027/result.md` +8: запись о пересдаче.

CI: run 37670056258 pass (1m55s); в логе `test/program-schema.down.db.test.ts (3 tests) 14091ms` и `program-schema.db.test.ts (5 tests)` — зелёные на postgres-сервисе CI.

Живая проверка оркестратора (одноразовый клон 3fa3500, postgres:16 в docker): `migrate deploy` на пустой БД → down.sql → программных таблиц 0, колонки `workspace_id` нет, enum `MeetingStatus` = 9 старых значений, строки миграции нет → `migrate deploy` повторно: «All migrations have been successfully applied». Сид старых строк в моём сценарии не вставился (регистр значения enum языка), поэтому сохранность строк и точное равенство каталога подтверждены тестом CI и прогоном ревьюера раунда 1, а не моим прогоном; проверка `prisma migrate diff` в моём сценарии завершилась ошибкой флагов CLI и не учитывается.
