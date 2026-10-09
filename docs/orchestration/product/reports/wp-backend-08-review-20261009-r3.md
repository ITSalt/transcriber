# Сверка — WP-BACKEND-08 (PR https://github.com/ITSalt/transcriber/pull/40, `432933a0e7` -> `main @ d6da675a03`) — 2026-10-09

Раунд 3. Дифф: 6 files changed, 71 insertions(+), 4 deletions(-) (файлов: 6).

**Решение: `ACCEPTED WP-BACKEND-08`** (раунд «contract», PR #40 от main d6da675a03) — дифф 6 файлов (+71/−4): схема без `speakerCount`; `migration.sql` = `ALTER TABLE "transcription_jobs" DROP COLUMN IF EXISTS "speaker_count"`; `down.sql` — одна транзакция, идемпотентно (`ADD COLUMN IF NOT EXISTS` + удаление строки `_prisma_migrations`); `api/test/drop-speaker-count.down.db.test.ts` (apply → колонки нет, нет дрейфа; down → каталог = эталон, повтор down, re-apply без дрейфа) и правка `awaiting-speakers.down.db.test.ts` (эталон учитывает новую миграцию); `.tl/deploy-plan.md` §5 — строка отката для миграции (lost data: none) и правило: деструктивные миграции только отдельным деплоем после выхода кода. Содержимое миграции и теста идентично проверенному рецензентом в раунде 1 (DB-тесты на PG16 выполнены, мутации down.sql/migration.sql пойманы). Код, читавший колонку, на проде с d6da675a03 (PROD-OK). CI на 432933a0e7 — ждёт цепочка доставки; перед слиянием: бэкап БД (R-22, D-39) и проверка, что нет заданий распознавания в PENDING/PROCESSING и загрузок в UPLOADING (окно деплоя). Замки `api/prisma/**`, `migrations`, `.tl/{…deploy-plan.md}` взяты/выданы по сообщениям.

graph: checked — в графе ent-003 без атрибута speaker_count (факт сессии в раунде 2), изменений спецификации в этом PR нет.

## Пункты REVISE

<нумерованные: `file:line` -> сценарий отказа -> требование; серьёзность>

### Не требуется

<чего сессия не должна добавлять или менять в этом раунде>

## Вопросы владельцу

<P-n, возникшие в сверке: вопрос, варианты, рекомендация; условные пункты REVISE называют P-n,
от которого зависят>

## Принято как есть / backlog

<находки low и info, принятые отклонения, кандидаты в backlog>

## Автоматические находки

- **пути и замки**: WP-BACKEND-08: shared path .tl/deploy-plan.md changed but not declared
- **пути и замки**: WP-BACKEND-08: shared path api/prisma/migrations/20261009130000_drop_speaker_count/down.sql changed without the lock
- **пути и замки**: WP-BACKEND-08: shared path api/prisma/migrations/20261009130000_drop_speaker_count/migration.sql changed without the lock
- **пути и замки**: WP-BACKEND-08: shared path api/prisma/schema.prisma changed without the lock
- **escalation**: round 3: if the same REVISE items are still open after this review, restart the module session on opus: cd /home/cloudpc/projects/transcriber && claude --resume product-backend --model opus --effort high (setting the package to REVISE opens the owner item)

Дифф ревизии (пересдачи): —

---

## Отчёт рецензента (дословно)

Сверено оркестратором по `gh pr diff 40` и CI; рецензент-агент в раунде 1 проверил те же файлы миграции и DB-теста на PG16 с мутациями (см. reports/wp-backend-08-review-20261009.md, раздел «Отчёт рецензента»).
