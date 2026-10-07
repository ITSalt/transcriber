# Проверка — WP-INFRA-02 на prod (`b8040ccb2dc0`) — 2026-10-07

**Вердикт: PASS** — пройдено проверок: 3

Ветка `main`, базовый URL https://transcriber.itsalt.ru, статус пакета на старте: VERIFIED_TEST.

## Run деплоя, отдаваемая версия и команды проверки

| # | Проверка | Команда или цель | Код | Вывод (первые строки) | Вердикт |
|---|----------|------------------|-----|-----------------------|---------|
| 1 | run деплоя | `deploy-production.yml` | — | deploy-production.yml: success https://github.com/ITSalt/transcriber/actions/runs/37665495025 | PASS |
| 2 | команда проверки | `curl -fsS https://transcriber.itsalt.ru/api/health` | 0 | {"status":"ok","version":"unknown","ts":"2026-10-07T18:18:55.029Z"} | PASS |
| 3 | команда проверки | `curl -fsS -o /dev/null -w '%{http_code}' https://transcriber.itsalt.ru/api/meetings` | 0 | 200 | PASS |

## Живой сценарий

Проверено read-only по логу деплоя `b8040ccb2d` (run 37665495025, Deploy to Production success):

| Критерий | Шаги | Ожидалось | Получено |
|----------|------|-----------|----------|
| C3 порядок в логе: migrate до build | `gh run view 37665495025 --log`, grep | `prisma migrate deploy` раньше `@transcrib/shared build` | строка 271 `Datasource "db": PostgreSQL … 127.0.0.1:5432`, 276 `No pending migrations to apply.`, 278 `> @transcrib/shared@0.0.0 build` — миграции раньше первой сборки |
| verify_prod | `/api/health`, `/api/meetings` → 200 | 200 | PASS (3 проверки orch.py verify) |
| health-check workflow | шаг Health check | Production healthy | run success |

Сбоев инструментов не было. Это первый деплой по новому порядку; первая реальная миграция под ним — WP-BACKEND-06.
