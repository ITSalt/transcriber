# Проверка — WP-BACKEND-07 на prod (`2e131fe2873e`) — 2026-10-08

**Вердикт: PASS** — пройдено проверок: 3

Ветка `main`, базовый URL https://transcriber.itsalt.ru, статус пакета на старте: VERIFIED_TEST.

## Run деплоя, отдаваемая версия и команды проверки

| # | Проверка | Команда или цель | Код | Вывод (первые строки) | Вердикт |
|---|----------|------------------|-----|-----------------------|---------|
| 1 | run деплоя | `deploy-production.yml` | — | deploy-production.yml: success https://github.com/ITSalt/transcriber/actions/runs/37834584270 | PASS |
| 2 | команда проверки | `curl -fsS https://transcriber.itsalt.ru/api/health` | 0 | {"status":"ok","version":"unknown","ts":"2026-10-08T19:51:33.578Z"} | PASS |
| 3 | команда проверки | `test "$(curl -s -o /dev/null -w '%{http_code}' https://transcriber.itsalt.ru/api/meetings)" = 401 && echo 'meetings without session -> 401 (AUTH_REQUIRED=true, R-16)'` | 0 | meetings without session -> 401 (AUTH_REQUIRED=true, R-16) | PASS |

## Живой сценарий

Стенда нет (merge = прод). Деплой 2e131fe287 с миграцией `20261009120000_awaiting_speakers`: `_prisma_migrations` — применена (finished_at не NULL), `enum_range(MeetingStatus)` содержит `AWAITING_SPEAKERS` перед `GENERATING_PROTOCOL`, колонки `transcripts.speaker_mapping`, `speakers_confirmed_at` есть; api и worker online. Read-only проба маршрутов под «Тест» (19:52Z): `GET /api/meetings/d5a4ef93…/speakers` без сессии → 401; с сессией → 200: status PROTOCOL_READY, 8 меток с длительностью/числом сегментов/образцами (SPEAKER_1: 1335 с, 375 сегментов), 9 участников проекта, confirmed_at null; `PUT … {action: skip}` на PROTOCOL_READY → 409 `MEETING_NOT_AWAITING_SPEAKERS`, статус встречи не изменился. Полный цикл confirm → GENERATING_PROTOCOL проверяется после WP-WORKER-06 (воркер начнёт ставить AWAITING_SPEAKERS) в итоговой живой проверке волны 4. **Дополнение 20:08Z:** полный цикл проверен после WP-WORKER-06 (см. reports/verify-WP-WORKER-06-prod-20261008.md): AWAITING_SPEAKERS → PUT confirm 200 → повтор 409 → PROTOCOL_READY с именами спикеров. Бэкап БД перед миграцией — R-21 (D-39).
