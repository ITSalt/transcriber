# Проверка — WP-INFRA-03 на prod (`392ed2b8ac20`) — 2026-10-08

**Вердикт: PASS** — пройдено проверок: 3

Ветка `main`, базовый URL https://transcriber.itsalt.ru, статус пакета на старте: VERIFIED_TEST.

## Run деплоя, отдаваемая версия и команды проверки

| # | Проверка | Команда или цель | Код | Вывод (первые строки) | Вердикт |
|---|----------|------------------|-----|-----------------------|---------|
| 1 | run деплоя | `deploy-production.yml` | — | deploy-production.yml: success https://github.com/ITSalt/transcriber/actions/runs/37771861252 | PASS |
| 2 | команда проверки | `curl -fsS https://transcriber.itsalt.ru/api/health` | 0 | {"status":"ok","version":"unknown","ts":"2026-10-08T11:47:20.652Z"} | PASS |
| 3 | команда проверки | `test "$(curl -s -o /dev/null -w '%{http_code}' https://transcriber.itsalt.ru/api/meetings)" = 401 && echo 'meetings without session -> 401 (AUTH_REQUIRED=true, R-16)'` | 0 | meetings without session -> 401 (AUTH_REQUIRED=true, R-16) | PASS |

## Живой сценарий

Проверено на VM по ssh после деплоя `392ed2b8ac` (run 37771861252, Deploy to Production success; `git log -1` на VM = 392ed2b; `docker-compose.yml:91-92` — `127.0.0.1:7476:7474`, `127.0.0.1:7689:7687`). R-17 выполнен оркестратором (D-28):

| Критерий | Шаги | Ожидалось | Получено |
|----------|------|-----------|----------|
| AC-1 новые порты в compose на VM | `grep 7476\|7689 docker-compose.yml` | обе строки | есть |
| AC-3 контейнер поднимается на новых портах | `MEMORY_NEO4J_URI=bolt://127.0.0.1:7689` в `/opt/transcrib/.env`; `docker compose up -d memory-neo4j` | Recreated/Started → healthy | healthy через ~30 с (третья проверка); `ss -ltn`: 127.0.0.1:7476 и :7689 слушают |
| лимиты D-16 | `docker inspect -f {{.HostConfig.Memory}}` | 1610612736 | 1610612736 |
| подключение с паролем из .env | `docker exec … cypher-shell -u neo4j -p … "RETURN 1"` | ok / 1 | ok / 1 |
| память VM | `free -h` | не меньше ~1 GiB свободно | available 3.8 GiB |
| graph:migrate | `worker/package.json` на VM | скрипт появится с WORKER-MEMORY-01; деплой того пакета выполнит миграцию схемы | скрипта в main ещё нет (ожидаемо) |

Пароль Neo4j остался только в `/opt/transcrib/.env` (первый старт контейнера прошёл с ним: `NEO4J_AUTH` применён к пустому volume).
