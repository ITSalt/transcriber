# Сверка — WP-BACKEND-01 (PR https://github.com/ITSalt/transcriber/pull/15, `ba75536568` -> `main @ 2570d0a669`) — 2026-10-07

Раунд 2. Дифф: 58 files changed, 2413 insertions(+), 346 deletions(-) (файлов: 58).

**Решение: `ACCEPTED WP-BACKEND-01`** — пересдача 1 закрыла оба пункта (7 файлов, +95/−27): миграция ставит только NOT NULL, DEFAULT «Роман» остаётся (D-22) — старый код в окне деплоя создаёт встречи как прежде; down.sql, тесты миграции и `.tl/deploy-plan.md` §10 приведены; три теста legacy-загрузки без `workspace_id` добавлены; CI зелёный.

## Пункты REVISE

нет

### Не требуется

—

## Вопросы владельцу

R-12 — бэкап БД прода непосредственно перед merge (блокирует доставку). P-14 открыт (не блокирует).

## Принято как есть / backlog

- Как в раунде 1: отклонения 1–15 приняты; L-1 (`assertGatedShape` по полной таблице маршрутов в `onReady`), предупреждение >100/ч без теста, чистка истёкших сессий — backlog; `.env.example` без замка — разрешён шапкой.
- Следующему пакету backend: миграция-уборка `DROP DEFAULT` на `meetings.workspace_id` (D-22) после того, как FRONTEND-02 и новый код живут на проде.
- Доставка: сразу за ней — FRONTEND-02 (иначе прод без экрана входа при AUTH_REQUIRED=true; пока флаг выключен, web работает как раньше). После merge: владельцу шаги включения входа (PIN_PEPPER → user:create → AUTH_REQUIRED=true → pm2 restart) отдельными пунктами.
- migrations: safe, reversible — NOT NULL с сохранённым DEFAULT совместим со старым кодом; down.sql идемпотентен; частичное применение покрыто тестом.
- graph: checked (раунд 1; граф восстановлен).

## Автоматические находки

- **пути и замки**: WP-BACKEND-01: shared path .env.example changed without the lock
- **пути и замки**: WP-BACKEND-01: shared path .worktreeinclude changed without the lock

Дифф ревизии (пересдачи): git -C /home/cloudpc/projects/transcriber diff 0f9f56171b5bf5d9c2ad3a6fb7c712af73908803 ba7553656848d0e71a937fcebf1ffb59139b3b50

---

## Отчёт рецензента (дословно)

Пересдачу сверил оркестратор (без агента-рецензента).

Дифф ревизии `0f9f561..ba75536`: 7 файлов, +95/−27.
- `migration.sql`: `ALTER TABLE "meetings" ALTER COLUMN "workspace_id" SET NOT NULL` без `DROP DEFAULT`; заголовок переписан под D-22/D-3.
- `down.sql`: комментарий — DEFAULT сохраняется самой миграцией, `SET DEFAULT` в откате только повторяет его (идемпотентно).
- `schema.prisma`: `@default` на `workspaceId` сохранён (нет дрейфа между схемой и миграцией — db-тест `migrations.down.db.test.ts` проверяет `prisma migrate diff`).
- `.tl/deploy-plan.md` §10: окно миграции безопасно по D-22; «тихое время» — рекомендация, не условие.
- `auth-isolation.db.test.ts` +52: три кейса legacy-принципала без `workspace_id` (init/complete/abort → «Роман», ключ `pending/…`).
- `migrations.down.db.test.ts`, `program-schema.db.test.ts`: ожидания про DEFAULT приведены (DEFAULT присутствует после миграции).
CI: run 37696526481 pass (2m10s), db-тесты выполнены.
