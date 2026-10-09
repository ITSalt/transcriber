# Проверка — WP-WEB-MEMORY-02 на prod (`180137dc923b`) — 2026-10-09

**Вердикт: PASS** — пройдено проверок: 3

Ветка `main`, базовый URL https://transcriber.itsalt.ru, статус пакета на старте: VERIFIED_TEST.

## Run деплоя, отдаваемая версия и команды проверки

| # | Проверка | Команда или цель | Код | Вывод (первые строки) | Вердикт |
|---|----------|------------------|-----|-----------------------|---------|
| 1 | run деплоя | `deploy-production.yml` | — | deploy-production.yml: success https://github.com/ITSalt/transcriber/actions/runs/37928453618 | PASS |
| 2 | команда проверки | `curl -fsS https://transcriber.itsalt.ru/api/health` | 0 | {"status":"ok","version":"unknown","ts":"2026-10-09T12:15:38.448Z"} | PASS |
| 3 | команда проверки | `test "$(curl -s -o /dev/null -w '%{http_code}' https://transcriber.itsalt.ru/api/meetings)" = 401 && echo 'meetings without session -> 401 (AUTH_REQUIRED=true, R-16)'` | 0 | meetings without session -> 401 (AUTH_REQUIRED=true, R-16) | PASS |

## Живой сценарий

Браузер (Playwright, headless), вход «Тест», 2026-10-09 12:18Z, served 180137dc92: карточка проекта «Госключ-ПК и TCB» → вкладки памяти «Поручения / Решения / Сводка / На подтверждение»; фильтр статусов «Открыто / В работе / Выполнено / Отменено / Отложено»; реестр T-1…T-8 со статусами «Открыто», «В работе», исполнителями и «ждут подтверждения: 3»; слова «задач» на странице нет (`/задач/i` → false) — критерий 3 выполнен. Критерии 1–2 — ревью (grep = 0) и CI PR #38. Примечание: в фильтре исполнителей присутствует «Speaker 1» — исполнитель из памяти, записанной до D-41 (данные, не строки интерфейса).
