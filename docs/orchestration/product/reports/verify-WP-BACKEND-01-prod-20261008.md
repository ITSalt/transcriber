# Проверка — WP-BACKEND-01 на prod (`fd9ca659f0f8`) — 2026-10-08

**Вердикт: PASS** — пройдено проверок: 3

Ветка `main`, базовый URL https://transcriber.itsalt.ru, статус пакета на старте: VERIFIED_TEST.

## Run деплоя, отдаваемая версия и команды проверки

| # | Проверка | Команда или цель | Код | Вывод (первые строки) | Вердикт |
|---|----------|------------------|-----|-----------------------|---------|
| 1 | run деплоя | `deploy-production.yml` | — | deploy-production.yml: success https://github.com/ITSalt/transcriber/actions/runs/37761646839 | PASS |
| 2 | команда проверки | `curl -fsS https://transcriber.itsalt.ru/api/health` | 0 | {"status":"ok","version":"unknown","ts":"2026-10-08T10:14:39.352Z"} | PASS |
| 3 | команда проверки | `curl -fsS -o /dev/null -w '%{http_code}' https://transcriber.itsalt.ru/api/meetings` | 0 | 200 | PASS |

## Живой сценарий

Проверено read-only после деплоя `fd9ca659f0` (run 37761646839, Deploy to Production success 2m57s, 2026-10-08 10:12Z; бэкап до merge: /home/deploy/backup/transcrib-before-backend01-20261008-1308.dump, 1 019 118 байт, R-12):

| Критерий | Шаги | Ожидалось | Получено |
|----------|------|-----------|----------|
| AC-4 миграция NOT NULL на БД со старыми встречами | лог шага «Deploy to Production Server» | `Applying migration 20261008120000_meeting_workspace_not_null` до сборок, деплой success | найдено: «7 migrations found», «Applying migration `20261008120000_meeting_workspace_not_null`», «have been applied»; run success |
| D-20 legacy-принципал без AUTH_REQUIRED | `GET /api/auth/me` без cookie | 200, синтетический пользователь «Роман» и личное пространство | 200 `{"user":{"id":"…0002","name":"Роман"},"workspaces":[{"id":"…0001","name":"Роман","personal":true}]}` |
| старые встречи доступны в пространстве «Роман» | `GET /api/meetings` | 200, список не пуст, `workspace_id` = legacy | 200, записей: 26; первая запись `workspace_id: 00000000-0000-4000-8000-000000000001`, `project_id: null` |
| вход до настройки PIN_PEPPER | `POST /api/auth/login {"pin":"000000"}` | явная ошибка конфигурации, не 500 | 503 `{"code":"AUTH_NOT_CONFIGURED","message":"Вход не настроен"}` |
| health | `GET /api/health` | 200 ok | `{"status":"ok"}` |
| шаг graph:migrate | лог деплоя | пропущен (переменные Neo4j на момент деплоя не заданы) | предупреждение «MEMORY_NEO4J_URI is not set - skipping graph:migrate» |

Не проверялось: изоляция между пользователями (401/404) на проде — нет второго пользователя, пока `AUTH_REQUIRED` выключен; покрыто интеграционным тестом AC-1 в CI (все маршруты) и сверкой ревьюера. Тест 423 (lockout) — только CI. SELECT по БД прода недоступен (нет read-only доступа), бэкфилл подтверждён логом миграции и `/api/meetings`. Сбоев инструментов не было.

Замечание на следующий деплой: владелец в R-14 уже дописал `MEMORY_NEO4J_*` в `/opt/transcrib/.env`, но контейнер memory-neo4j не поднялся (порт 7475 занят, R-15). Следующий деплой выполнит `graph:migrate` и получит `::error::graph:migrate failed` — по D-19 деплой не падает; API/worker текущего main эти переменные не читают.
