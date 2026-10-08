# Проверка — WP-WORKER-MEMORY-01 на prod (`39555b542baa`) — 2026-10-08

**Вердикт: PASS** — пройдено проверок: 3

Ветка `main`, базовый URL https://transcriber.itsalt.ru, статус пакета на старте: VERIFIED_TEST.

## Run деплоя, отдаваемая версия и команды проверки

| # | Проверка | Команда или цель | Код | Вывод (первые строки) | Вердикт |
|---|----------|------------------|-----|-----------------------|---------|
| 1 | run деплоя | `deploy-production.yml` | — | deploy-production.yml: success https://github.com/ITSalt/transcriber/actions/runs/37772801692 | PASS |
| 2 | команда проверки | `curl -fsS https://transcriber.itsalt.ru/api/health` | 0 | {"status":"ok","version":"unknown","ts":"2026-10-08T11:54:43.207Z"} | PASS |
| 3 | команда проверки | `test "$(curl -s -o /dev/null -w '%{http_code}' https://transcriber.itsalt.ru/api/meetings)" = 401 && echo 'meetings without session -> 401 (AUTH_REQUIRED=true, R-16)'` | 0 | meetings without session -> 401 (AUTH_REQUIRED=true, R-16) | PASS |

## Живой сценарий

Проверено по ssh и read-only запросами после деплоя `39555b542b` (run 37772801692, Deploy to Production success; `git log -1` на VM = 39555b5; pm2 `transcrib-api`/`transcrib-worker` online, 0 рестартов):

| Критерий | Шаги | Ожидалось | Получено |
|----------|------|-----------|----------|
| схема графа памяти накатывается деплоем (ADR-013, D-19) | лог шага «Deploy to Production Server» | `graph:migrate` против memory-neo4j (7689) без `::error` | «graph:migrate: applied 1 (schema version 0 → 1)»; ошибок нет |
| схема в Neo4j | `cypher-shell SHOW CONSTRAINTS` / `MATCH (n) RETURN count(n)` в контейнере | constraints созданы; узлы — только служебный узел версии схемы | 12 constraints; 1 узел |
| воркер стартует с переменными Neo4j | pm2 | online, без ошибок в error-log | online; error-log без новых записей |
| API жив | health, 401 без сессии | 200 / 401 | PASS (3 проверки orch.py verify) |

Не проверялось на проде (запись данных): извлечение памяти из реальной встречи, сопоставление, сводка — появится при первой транскрипции встречи проекта после доставки API-MEMORY-01/WEB-MEMORY-01 (данные пишутся воркером при генерации протокола). Покрыто тестами воркера и `memory-graph.neo4j.test.ts` на реальном Neo4j в CI, сверкой раундов 1–2.
