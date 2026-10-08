# Проверка — WP-API-MEMORY-01 на prod (`b17ab2303fd0`) — 2026-10-08

**Вердикт: PASS** — пройдено проверок: 3

Ветка `main`, базовый URL https://transcriber.itsalt.ru, статус пакета на старте: VERIFIED_TEST.

## Run деплоя, отдаваемая версия и команды проверки

| # | Проверка | Команда или цель | Код | Вывод (первые строки) | Вердикт |
|---|----------|------------------|-----|-----------------------|---------|
| 1 | run деплоя | `deploy-production.yml` | — | deploy-production.yml: success https://github.com/ITSalt/transcriber/actions/runs/37782612239 | PASS |
| 2 | команда проверки | `curl -fsS https://transcriber.itsalt.ru/api/health` | 0 | {"status":"ok","version":"unknown","ts":"2026-10-08T13:17:08.254Z"} | PASS |
| 3 | команда проверки | `test "$(curl -s -o /dev/null -w '%{http_code}' https://transcriber.itsalt.ru/api/meetings)" = 401 && echo 'meetings without session -> 401 (AUTH_REQUIRED=true, R-16)'` | 0 | meetings without session -> 401 (AUTH_REQUIRED=true, R-16) | PASS |

## Живой сценарий

Read-only наблюдение после деплоя b17ab2303f (run 37782612239 success; api и worker перезапущены pm2 в 13:16:31Z). Вход по PIN владельца оркестратору недоступен, данные на проде не создавались; в БД прода 0 проектов, 0 встреч с проектом, 0 строк graph_outbox, 1 пользователь; граф памяти: только SchemaVersion v1 (SELECT/cypher через ssh, только чтение).

| Критерий | Шаги | Ожидалось | Получено |
|----------|------|-----------|----------|
| маршруты памяти задеплоены и подключены реестром фич | ssh: `git rev-parse HEAD` в /opt/transcrib; `ls api/dist/features/memory/`; лог api при старте | HEAD = b17ab2303f; `graph.js`, `routes.js` в dist; фича `memory` в списке зарегистрированных | b17ab2303f; graph.js/routes.js от 16:16 (+03); лог 13:16:32Z `"features":["auth","context","feedback","memory","projects"]`, `feature modules registered`; в `routes.js` все 8 шаблонов маршрутов (tasks, tasks/:code GET+PATCH, decisions, memory, review-queue, task-events/:eventId/${action}, meetings/:id/memory-refs) |
| изоляция/вход (AUTH_REQUIRED=true, R-16): все маршруты памяти без сессии → 401 | curl без cookie: GET/PATCH `/api/projects/<uuid>/{tasks,tasks/T-1,decisions,memory,review-queue}`, POST `/api/task-events/<uuid>/{confirm,reject}`, GET `/api/meetings/<uuid>/memory-refs` | 401 UNAUTHENTICATED | 401 `{"code":"UNAUTHENTICATED","message":"Нужно войти"}` на всех 9 запросах; `/api/health` 200 |
| до деплоя маршрут не существовал, после — обслуживается | лог api: тот же `GET /api/meetings/…/memory-refs` в 12:02Z (проверка WEB-MEMORY-01) и в 13:17Z | до: `Route … not found`; после: запрос принят без «not found» | до: `msg:"Route GET:/api/meetings/ff188189…/memory-refs not found"`; после: `incoming request` без записи «not found», ответ 401 (хук auth) |
| конфигурация памяти для api | ssh: ключи `MEMORY_NEO4J_*` в /opt/transcrib/.env (api/.env → ../.env), контейнер | URI на 7689 (D-26), пароль задан, контейнер healthy | `MEMORY_NEO4J_URI=bolt://127.0.0.1:7689`, USER/DATABASE=neo4j, PASSWORD задан (1 строка), `transcrib-memory-neo4j-1 Up (healthy) 127.0.0.1:7689->7687` |
| ошибок памяти/графа в логе api после рестарта нет | `pm2 logs transcrib-api --lines 300 --nostream`, grep memory/graph/neo4j/error | нет ошибок | только `incoming request` и регистрация фич; ошибок уровня 50 нет |
| DELETE_PROJECT outbox-продюсер | таблица graph_outbox | без удалений проектов строк нет | 0 строк (проектов на проде нет) |

Не проверялось на проде (нет данных и входа; требует проекта со встречами и PIN владельца): ответы 200 списков/сводки/очереди, confirm/reject, PATCH, `memory-refs` с проектом, путь 503 при отказе Neo4j. Покрыто тестами в CI и у рецензента (см. отчёт test). Первый живой случай — за владельцем: создать проект, запустить встречу с проектом, открыть вкладку «Память» проекта (WEB-MEMORY-01).
