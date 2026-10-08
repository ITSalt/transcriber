# Проверка — WP-WEB-MEMORY-01 на prod (`d97912108e87`) — 2026-10-08

**Вердикт: PASS** — пройдено проверок: 3

Ветка `main`, базовый URL https://transcriber.itsalt.ru, статус пакета на старте: VERIFIED_TEST.

## Run деплоя, отдаваемая версия и команды проверки

| # | Проверка | Команда или цель | Код | Вывод (первые строки) | Вердикт |
|---|----------|------------------|-----|-----------------------|---------|
| 1 | run деплоя | `deploy-production.yml` | — | deploy-production.yml: success https://github.com/ITSalt/transcriber/actions/runs/37773584532 | PASS |
| 2 | команда проверки | `curl -fsS https://transcriber.itsalt.ru/api/health` | 0 | {"status":"ok","version":"unknown","ts":"2026-10-08T12:01:58.050Z"} | PASS |
| 3 | команда проверки | `test "$(curl -s -o /dev/null -w '%{http_code}' https://transcriber.itsalt.ru/api/meetings)" = 401 && echo 'meetings without session -> 401 (AUTH_REQUIRED=true, R-16)'` | 0 | meetings without session -> 401 (AUTH_REQUIRED=true, R-16) | PASS |

## Живой сценарий

Проверено после деплоя (Deploy to Production success; бандл `assets/index-1ZImodau.js`). Браузер MCP Playwright, вход по PIN пользователя «Роман»:

| Критерий | Шаги | Ожидалось | Получено |
|----------|------|-----------|----------|
| сборка с фичей memory отдаётся, существующие фичи целы | `/meetings/ff188189…/protocol` | панель: Назад / Редактировать / Экспорт PDF / Обратная связь / История версий | есть (`btn-feedback`, `btn-version-history`); `reports/screenshots/web-memory-01-prod-protocol.png` |
| слот `protocol.toolbar` с двумя фичами | та же страница | MeetingMemoryRefs монтируется; для встречи без проекта и без API памяти ничего не рисует | элементов памяти нет (ожидаемо), в консоли 404 на запрос памяти/контекста — эндпоинты памяти появятся с API-MEMORY-01 |
| страница проектов цела (вкладка памяти — на карточке проекта) | `/projects` | список/форма создания | «Проектов пока нет», форма `project-create-*` |
| консоль | весь путь | без ошибок, кроме ожидаемых | 401 до входа, 404 (контекст встречи без контекста; память до API-MEMORY-01); предупреждение React Router `HydrateFallback` — инфо, backlog |

Не проверялось на проде: вкладка «Память» проекта, очередь на проверку, ссылки памяти на карточке и в протоколе — требуют проекта с встречами и API-MEMORY-01 (эндпоинты сейчас 404). Повторная живая проверка — при доставке API-MEMORY-01 (владелец создаёт проект и прогоняет встречу). Покрыто тестами web (245/245) и сверкой раундов 1–2.
