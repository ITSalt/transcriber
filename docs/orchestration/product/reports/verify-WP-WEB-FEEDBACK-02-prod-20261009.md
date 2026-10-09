# Проверка — WP-WEB-FEEDBACK-02 на prod (`75676ba117e3`) — 2026-10-09

**Вердикт: PASS** — пройдено проверок: 3

Ветка `main`, базовый URL https://transcriber.itsalt.ru, статус пакета на старте: VERIFIED_TEST.

## Run деплоя, отдаваемая версия и команды проверки

| # | Проверка | Команда или цель | Код | Вывод (первые строки) | Вердикт |
|---|----------|------------------|-----|-----------------------|---------|
| 1 | run деплоя | `deploy-production.yml` | — | deploy-production.yml: success https://github.com/ITSalt/transcriber/actions/runs/37927799355 | PASS |
| 2 | команда проверки | `curl -fsS https://transcriber.itsalt.ru/api/health` | 0 | {"status":"ok","version":"unknown","ts":"2026-10-09T12:15:33.598Z"} | PASS |
| 3 | команда проверки | `test "$(curl -s -o /dev/null -w '%{http_code}' https://transcriber.itsalt.ru/api/meetings)" = 401 && echo 'meetings without session -> 401 (AUTH_REQUIRED=true, R-16)'` | 0 | meetings without session -> 401 (AUTH_REQUIRED=true, R-16) | PASS |

## Живой сценарий

Браузер (Playwright, headless), вход «Тест», 2026-10-09 12:19Z, served 75676ba117: страница протокола встречи ff3ad632… → «Обратная связь» → диалог «Обратная связь по протоколу», вкладки «Замечания / Правильный протокол / Word с комментариями», список категорий: «— не выбрана —», «Атрибуция спикеров», «Пропущено решение», «Неверное поручение», «Выдумано», «Термины и имена», «Стиль», «Другое»; слова «задач» на странице нет — критерий 2 выполнен. Критерий 1 — ревью (grep = 0) и CI PR #37.
