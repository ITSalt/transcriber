# Проверка — WP-API-PROJECTS-01 на prod (`bf75f694f241`) — 2026-10-08

**Вердикт: PASS** — пройдено проверок: 3

Ветка `main`, базовый URL https://transcriber.itsalt.ru, статус пакета на старте: VERIFIED_TEST.

## Run деплоя, отдаваемая версия и команды проверки

| # | Проверка | Команда или цель | Код | Вывод (первые строки) | Вердикт |
|---|----------|------------------|-----|-----------------------|---------|
| 1 | run деплоя | `deploy-production.yml` | — | deploy-production.yml: success https://github.com/ITSalt/transcriber/actions/runs/37767836347 | PASS |
| 2 | команда проверки | `curl -fsS https://transcriber.itsalt.ru/api/health` | 0 | {"status":"ok","version":"unknown","ts":"2026-10-08T11:09:23.152Z"} | PASS |
| 3 | команда проверки | `test "$(curl -s -o /dev/null -w '%{http_code}' https://transcriber.itsalt.ru/api/meetings)" = 401 && echo 'meetings without session -> 401 (AUTH_REQUIRED=true, R-16)'` | 0 | meetings without session -> 401 (AUTH_REQUIRED=true, R-16) | PASS |

## Живой сценарий

Проверено read-only после деплоя `bf75f694f2` (run 37767836347, Deploy to Production success; CI main run 37767836063 success). Первый прогон `verify --env test` дал ложный FAIL: команда проверки `GET /api/meetings` без cookie после R-16 отвечает 401 по контракту — hold снят, команды проверки в `orch.yaml` заменены на ожидание 401. Сессия пользователя «Роман» (PIN, cookie), пространство `…0001`:

| Критерий | Шаги | Ожидалось | Получено |
|----------|------|-----------|----------|
| список проектов пространства (UC-500) | `GET /api/projects?workspace_id=…0001` с cookie | 200, пусто (проектов ещё нет) | 200 `{"items":[]}` |
| изоляция/вход | тот же запрос без cookie | 401 | 401 |
| контекст встречи до первого PUT (контракт `context.ts:9`) | `GET /api/meetings/ff188189…/context` | 404 `NOT_FOUND` | 404 |
| last-protocol чужого/несуществующего проекта | `GET /api/projects/<нет>/last-protocol` | 404 `NOT_FOUND` (неотличимо от чужого) | 404 |
| старт не из `AWAITING_START` (A-5) | `POST /api/meetings/ff188189…/start` (встреча EDITED) | 409 `MEETING_NOT_AWAITING_START` | 409 «Распознавание уже запущено» |
| health | `GET /api/health` | 200 | ok |

Не проверялось на проде (запись данных): создание проекта, PUT контекста, старт с контекстом, лимит 50 000 (`PREVIOUS_PROTOCOL_TOO_LONG`) — после доставки WEB-PROJECTS-01 как E2E владельца или по его решению создать тестовый проект. Покрыто тестами (api 278/310, изоляция 23/23) и сверкой раундов 1–3.
