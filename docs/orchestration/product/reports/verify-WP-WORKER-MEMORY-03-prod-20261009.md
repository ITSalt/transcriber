# Проверка — WP-WORKER-MEMORY-03 на prod (`b482b0e79f93`) — 2026-10-09

**Вердикт: PASS** — пройдено проверок: 3

Ветка `main`, базовый URL https://transcriber.itsalt.ru, статус пакета на старте: VERIFIED_TEST.

## Run деплоя, отдаваемая версия и команды проверки

| # | Проверка | Команда или цель | Код | Вывод (первые строки) | Вердикт |
|---|----------|------------------|-----|-----------------------|---------|
| 1 | run деплоя | `deploy-production.yml` | — | deploy-production.yml: success https://github.com/ITSalt/transcriber/actions/runs/37927379797 | PASS |
| 2 | команда проверки | `curl -fsS https://transcriber.itsalt.ru/api/health` | 0 | {"status":"ok","version":"unknown","ts":"2026-10-09T12:15:27.140Z"} | PASS |
| 3 | команда проверки | `test "$(curl -s -o /dev/null -w '%{http_code}' https://transcriber.itsalt.ru/api/meetings)" = 401 && echo 'meetings without session -> 401 (AUTH_REQUIRED=true, R-16)'` | 0 | meetings without session -> 401 (AUTH_REQUIRED=true, R-16) | PASS |

## Живой сценарий

Встреча «Повтор G (память, метка спикера): Статус Госключ и TCB 26.05.26» `acc43e74-5fef-4e11-b99e-7fa866311c5c`, проект «Госключ-ПК и TCB», загружена с VM после деплоя b482b0e79f (2026-10-09 15:26 по VM), подтверждение спикеров пропущено (PUT skip → метки остаются неподтверждёнными), PROTOCOL_READY 15:27:40, память обновлена.
Критерий 2: read-only запрос к Neo4j памяти прода (`transcrib-memory-neo4j-1`, cypher-shell в контейнере): `MATCH ()-[r:MENTIONED_IN]->(m:Meeting {id:"acc43e74-…"})` → 11 упоминаний (T-1, T-2, T-3, T-4, T-6, T-10…T-13, D-1, D-3), `speakerLabel` — «Спикер 1/2/3» у всех, `STARTS WITH "Speaker"` = 0, `STARTS WITH "Спикер"` = 11.
Критерий 1 — ревью r1/r2 (мутации), CI PR #33.
