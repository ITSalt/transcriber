# Проверка — WP-BACKEND-06 на prod (`2570d0a66924`) — 2026-10-07

**Вердикт: PASS** — пройдено проверок: 3

Ветка `main`, базовый URL https://transcriber.itsalt.ru, статус пакета на старте: VERIFIED_TEST.

## Run деплоя, отдаваемая версия и команды проверки

| # | Проверка | Команда или цель | Код | Вывод (первые строки) | Вердикт |
|---|----------|------------------|-----|-----------------------|---------|
| 1 | run деплоя | `deploy-production.yml` | — | deploy-production.yml: success https://github.com/ITSalt/transcriber/actions/runs/37679417337 | PASS |
| 2 | команда проверки | `curl -fsS https://transcriber.itsalt.ru/api/health` | 0 | {"status":"ok","version":"unknown","ts":"2026-10-07T20:08:57.703Z"} | PASS |
| 3 | команда проверки | `curl -fsS -o /dev/null -w '%{http_code}' https://transcriber.itsalt.ru/api/meetings` | 0 | 200 | PASS |

## Живой сценарий

Проверено read-only после деплоя `2570d0a669` (run 37679417337, Deploy to Production success, 2026-10-07 20:08Z):

| Критерий | Шаги | Ожидалось | Получено |
|----------|------|-----------|----------|
| AC-1 миграция применена на проде | лог деплоя | `Applying migration 20261007120000_program_product_schema`, деплой success | найдено: «6 migrations found», «Applying migration `20261007120000_program_product_schema`»; миграция прошла до сборок (порядок WP-INFRA-02); run success |
| AC-2/5 старый функционал работает на новой схеме (поведение прода не меняется) | `GET /api/health`, `GET /api/meetings` | 200, список встреч не пуст | health `{"status":"ok"}`; meetings 200, записей в списке: 26 |
| шаг graph:migrate | лог деплоя | пропущен с предупреждением (Neo4j не запущен) | `##[warning] MEMORY_NEO4J_URI is not set - skipping graph:migrate` |
| verify_prod | health + meetings | 200 | PASS (3 проверки orch.py verify) |

Бэкфилл «Роман» и версии протоколов на проде по SELECT не проверялись (у оркестратора нет read-only доступа к БД прода): подтверждены тестами CI и прогонами ревьюера на postgres:16 с данными старой схемы. Бэкап перед merge: /home/deploy/backup/transcrib-before-backend06-20261007-2244.dump (R-9). Сбоев инструментов не было.
