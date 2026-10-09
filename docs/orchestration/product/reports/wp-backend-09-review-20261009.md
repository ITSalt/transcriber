# Сверка — WP-BACKEND-09 (PR https://github.com/ITSalt/transcriber/pull/40, `432933a0e7` -> `main @ d6da675a03`) — 2026-10-09

Раунд 1. Дифф: 6 files changed, 71 insertions(+), 4 deletions(-) (файлов: 6).

**Решение: `ACCEPTED WP-BACKEND-09`** — тот же PR #40 и sha 432933a0e7, что приняты в `reports/wp-backend-08-review-20261009-r3.md` (contract-раунд WP-BACKEND-08): схема без `speakerCount`, миграция `DROP COLUMN IF EXISTS`, идемпотентный `down.sql`, DB-тест apply/down/re-apply, правка эталона `awaiting-speakers.down.db.test.ts`, `.tl/deploy-plan.md` §5. Содержимое миграции и теста проверено рецензентом на PG16 с мутациями в раунде 1 WP-BACKEND-08. CI на 432933a0e7 зелёный. Пакет выделен только потому, что очередь слияний не допускает второе слияние одного пакета (PLUGIN-BUG-5).

graph: checked — спецификация в PR не меняется; ent-003 без атрибута speaker_count (WP-BACKEND-08, раунд 2).

## Пункты REVISE

нет

### Не требуется

—

## Вопросы владельцу

нет

## Принято как есть / backlog

- Три записи `protocol_generation_jobs` в статусе PROCESSING с 2026-06-02, 2026-06-03, 2026-08-11 (встречи TRANSCRIBED, ничего не выполняется) — остатки старых сбоев; backlog: привести в FAILED (действие владельца, запись в БД).

## Автоматические находки

- **пути и замки**: WP-BACKEND-09: shared path .tl/deploy-plan.md changed without the lock
- **пути и замки**: WP-BACKEND-09: shared path api/prisma/migrations/20261009130000_drop_speaker_count/down.sql changed without the lock
- **пути и замки**: WP-BACKEND-09: shared path api/prisma/migrations/20261009130000_drop_speaker_count/migration.sql changed without the lock
- **пути и замки**: WP-BACKEND-09: shared path api/prisma/schema.prisma changed without the lock

Дифф ревизии (пересдачи): —

---

## Отчёт рецензента (дословно)

См. `reports/wp-backend-08-review-20261009.md` (раздел «Отчёт рецензента», проверка миграции/down.sql/DB-теста на PG16 и мутации) и `reports/wp-backend-08-review-20261009-r3.md` (сверка диффа PR #40 оркестратором).
