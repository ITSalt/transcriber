# Проверка — WP-WORKER-06 на test (`a50f44d6b690`) — 2026-10-08

**Вердикт: PASS** — пройдено проверок: 3

Ветка `main`, базовый URL https://transcriber.itsalt.ru, статус пакета на старте: MERGED.

## Run деплоя, отдаваемая версия и команды проверки

| # | Проверка | Команда или цель | Код | Вывод (первые строки) | Вердикт |
|---|----------|------------------|-----|-----------------------|---------|
| 1 | run деплоя | `deploy-production.yml` | — | deploy-production.yml: success https://github.com/ITSalt/transcriber/actions/runs/37836591504 | PASS |
| 2 | команда проверки | `curl -fsS https://transcriber.itsalt.ru/api/health` | 0 | {"status":"ok","version":"unknown","ts":"2026-10-08T20:07:07.066Z"} | PASS |
| 3 | команда проверки | `test "$(curl -s -o /dev/null -w '%{http_code}' https://transcriber.itsalt.ru/api/meetings)" = 401 && echo 'meetings without session -> 401 (AUTH_REQUIRED=true, R-16)'` | 0 | meetings without session -> 401 (AUTH_REQUIRED=true, R-16) | PASS |

## Живой сценарий

Стенда нет (merge = прод). Живой сценарий через API под «Тест» после деплоя a50f44d6b6 (20:07Z): запись TCB загружена с контекстом проекта «Госключ-ПК и TCB» (`19a07aaa…`, previous_protocol: project) → через 21 с статус **AWAITING_SPEAKERS** (гейт сработал, задание генерации не создавалось); `GET /speakers` → 4 метки с длительностью/сегментами/образцами (SPEAKER_1 223,6 с / 93 сегмента…), 9 участников проекта; `PUT confirm` с картой на 4 участников → 200 `GENERATING_PROTOCOL`; повторный PUT → 409 `MEETING_NOT_AWAITING_SPEAKERS`; через 20 с **PROTOCOL_READY**. Протокол: «## Участники» — Роман Клин, Хаджимурад (РТЛабс), Ильнур (ИИТ), Павел (РТЛабс), ни одной метки «Speaker N»; задачи с исполнителями по именам; перенесённая T-10 из памяти с пометкой. `GET /transcript`: `full_text` 9 820 знаков, имена подставлены в каждую строку (Хаджимурад 93, Роман 54, Ильнур 51, Павел 7), меток «Speaker N» — 0; `GET /speakers` после подтверждения: `confirmed_at` 20:07:48Z, карта label→имя. Экран подтверждения (WP-FRONTEND-06) проверяется отдельно. Критерии 1–3 выполнены вживую.
