# Проверка — WP-API-MEMORY-01 на test (`b17ab2303fd0`) — 2026-10-08

**Вердикт: PASS** — пройдено проверок: 3

Ветка `main`, базовый URL https://transcriber.itsalt.ru, статус пакета на старте: MERGED.

## Run деплоя, отдаваемая версия и команды проверки

| # | Проверка | Команда или цель | Код | Вывод (первые строки) | Вердикт |
|---|----------|------------------|-----|-----------------------|---------|
| 1 | run деплоя | `deploy-production.yml` | — | deploy-production.yml: success https://github.com/ITSalt/transcriber/actions/runs/37782612239 | PASS |
| 2 | команда проверки | `curl -fsS https://transcriber.itsalt.ru/api/health` | 0 | {"status":"ok","version":"unknown","ts":"2026-10-08T13:16:46.059Z"} | PASS |
| 3 | команда проверки | `test "$(curl -s -o /dev/null -w '%{http_code}' https://transcriber.itsalt.ru/api/meetings)" = 401 && echo 'meetings without session -> 401 (AUTH_REQUIRED=true, R-16)'` | 0 | meetings without session -> 401 (AUTH_REQUIRED=true, R-16) | PASS |

## Живой сценарий

Стенда нет (P-3: merge в main = прод), поэтому «test» и «prod» — один и тот же деплой b17ab2303f. Критерии приёмки пакета — тестовые (AC-1 Neo4j, AC-2 изоляция, AC-3 typecheck/тесты); они подтверждены до merge: CI run 37777007848 на fb632c5091 (pass; `memory.neo4j.test.ts` 7/7 на сервисе neo4j, `auth-isolation.db.test.ts` 24/24, `routes.test.ts` 19/19) и прогон рецензента в одноразовом клоне с одноразовыми PG16 и Neo4j (api 28 файлов / 337 тестов, мутации M1/M2/M3/M6 красные) — reports/wp-api-memory-01-review-20261008.md. Живая read-only проверка деплоя — в отчёте prod (reports/verify-WP-API-MEMORY-01-prod-20261008.md).
