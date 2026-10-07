# Проверка — WP-INFRA-01 на prod (`9e5d534ca56a`) — 2026-10-07

**Вердикт: PASS** — пройдено проверок: 3

Ветка `main`, базовый URL https://transcriber.itsalt.ru, статус пакета на старте: VERIFIED_TEST.

## Run деплоя, отдаваемая версия и команды проверки

| # | Проверка | Команда или цель | Код | Вывод (первые строки) | Вердикт |
|---|----------|------------------|-----|-----------------------|---------|
| 1 | run деплоя | `deploy-production.yml` | — | deploy-production.yml: success https://github.com/ITSalt/transcriber/actions/runs/37661241627 | PASS |
| 2 | команда проверки | `curl -fsS https://transcriber.itsalt.ru/api/health` | 0 | {"status":"ok","version":"unknown","ts":"2026-10-07T17:45:49.898Z"} | PASS |
| 3 | команда проверки | `curl -fsS -o /dev/null -w '%{http_code}' https://transcriber.itsalt.ru/api/meetings` | 0 | 200 | PASS |

## Живой сценарий

Проверено read-only после деплоя `9e5d534ca5` (2026-10-07 ~17:5xZ):

| Критерий | Шаги | Ожидалось | Получено |
|----------|------|-----------|----------|
| AC-2 деплой без `MEMORY_NEO4J_URI` проходит, шаг пропущен с предупреждением | `gh run view 37661241627 --log`, grep `graph:migrate` в job «Deploy to Production» | `::warning::MEMORY_NEO4J_URI is not set - skipping graph:migrate`, деплой success | предупреждение найдено, run success |
| AC-3 CI с сервисом Neo4j на main | `gh run list --workflow ci.yml --branch main` | success на 9e5d534 | success |
| verify_prod | `/api/health`, `/api/meetings` → 200 | 200 | PASS (3 проверки orch.py verify) |
| AC-1, AC-4 (compose, бэкап/восстановление) | — | на проде Neo4j ещё не запущен (R-n владельца после R-6/R-7) | проверено в одноразовом клоне на ревизии 1f33af8 (отчёт ревью r2); на проде — после запуска сервиса владельцем |

Вывод grep лога деплоя:
```
2026-10-07T17:45:01.1714986Z ^[[36;1m    echo "::warning::MEMORY_NEO4J_URI is not set - skipping graph:migrate"^[[0m
2026-10-07T17:45:01.1716029Z ^[[36;1m    pnpm --filter @transcrib/worker run --if-present graph:migrate \^[[0m
2026-10-07T17:45:01.1716696Z ^[[36;1m      || echo "::error::graph:migrate failed - run it manually"^[[0m
2026-10-07T17:45:01.1721704Z ^[[36;1m  # `pm2 reload` only updates env vars and code — it keeps the stale^[[0m
```
Сбоев инструментов не было. Neo4j памяти проекта на проде не запущен: это отдельный шаг владельца (пароль в /opt/transcrib/.env, `docker compose up -d memory-neo4j`), он будет выписан как R-n перед доставкой WP-WORKER-MEMORY-01.
