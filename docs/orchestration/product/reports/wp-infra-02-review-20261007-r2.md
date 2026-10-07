# Сверка — WP-INFRA-02 (PR https://github.com/ITSalt/transcriber/pull/11, `6694e5e172` -> `main @ 9e5d534ca5`) — 2026-10-07

Раунд 2. Дифф: 1 file changed, 15 insertions(+), 6 deletions(-) (файлов: 1).

**Решение: `ACCEPTED WP-INFRA-02`** — пересдача 1 закрыла единственный пункт точечно (один файл, подсказка и цепочка отката, одна фраза в комментарии), порядок шагов ssh-блока не изменился.

## Пункты REVISE

нет

### Не требуется

—

## Вопросы владельцу

нет

## Принято как есть / backlog

- Как в раунде 1: I-1 `pm2 reload` в цепочке отката (предсуществующее) — backlog следующего пакета infra.
- graph: не требуется (пакет без спецификации).

## Автоматические находки

- не найдено

Дифф ревизии (пересдачи): git -C /home/cloudpc/projects/transcriber diff 8253fece3d1265e61547391e81d1f42a195d7192 6694e5e172d330b5c7cd1404dc38cd5c30fb17a9

---

## Отчёт рецензента (дословно)

Пересдачу сверил оркестратор (без агента-рецензента).

Дифф ревизии `8253fec..6694e5e`: 1 файл, `.github/workflows/deploy-production.yml`, +5/−3.
- Строка 128 (подсказка «Notify on failure»): теперь говорит, что `dist/` не менялся, но `node_modules` и Prisma-клиент уже новые, откат на `<previous-sha>` обязателен и должен включать `db:generate`.
- Строка 130 (цепочка отката): добавлен `pnpm --filter @transcrib/api run db:generate` после `pnpm install --frozen-lockfile`; `pm2 reload` не тронут (как требовалось).
- Строки 57-60 (комментарий перед миграцией): одна фраза о том же.
- Извлечённый ssh-блок: порядок команд `db:generate` → `db:migrate:deploy` → сборки shared/api/worker/web → `graph:migrate` → rsync → pm2 delete/start/save — без изменений относительно 8253fec.

CI: run 37665170733 на `6694e5e` — результат в журнале/гейте G3 перед доставкой.
