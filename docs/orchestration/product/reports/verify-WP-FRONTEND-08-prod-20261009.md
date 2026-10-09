# Проверка — WP-FRONTEND-08 на prod (`06582ba529fc`) — 2026-10-09

**Вердикт: PASS** — пройдено проверок: 3

Ветка `main`, базовый URL https://transcriber.itsalt.ru, статус пакета на старте: VERIFIED_TEST.

## Run деплоя, отдаваемая версия и команды проверки

| # | Проверка | Команда или цель | Код | Вывод (первые строки) | Вердикт |
|---|----------|------------------|-----|-----------------------|---------|
| 1 | run деплоя | `deploy-production.yml` | — | deploy-production.yml: success https://github.com/ITSalt/transcriber/actions/runs/37944008248 | PASS |
| 2 | команда проверки | `curl -fsS https://transcriber.itsalt.ru/api/health` | 0 | {"status":"ok","version":"unknown","ts":"2026-10-09T14:29:22.749Z"} | PASS |
| 3 | команда проверки | `test "$(curl -s -o /dev/null -w '%{http_code}' https://transcriber.itsalt.ru/api/meetings)" = 401 && echo 'meetings without session -> 401 (AUTH_REQUIRED=true, R-16)'` | 0 | meetings without session -> 401 (AUTH_REQUIRED=true, R-16) | PASS |

## Живой сценарий

Браузер (Playwright, headless), вход «Тест», 2026-10-09 14:31Z, served 06582ba529:
1. `/catalog?project=a03eb007-…`: H1 «Встречи»; колонки «Встреча / Проект / Дата / Статус / Протокол»; строки показывают название («Повтор G (память, метка спикера): …», «Повтор F (терминология): …») и имя файла второй строкой; колонка «Проект» — ссылка на `/projects/a03eb007-…` (9 ссылок); select фильтра = «Госключ-ПК и TCB (РТЛабс / ИИТ)»; 9 строк — совпадает с `GET /api/meetings?workspace_id=…&project_id=a03eb007-…` (9 из 11).
2. Сброс фильтра («Все проекты»): URL → `/catalog`, 11 строк (= API без фильтра).
3. Карточка встречи acc43e74…: H1 с названием, под ним «Проект: Госключ-ПК и TCB (РТЛабс / ИИТ)» ссылкой на `/projects/a03eb007-…`.
4. Критерий 1 (тесты, typecheck, `grep SpeakerCount web/src/i18n/*.json` пуст) — ревью r1/r2 и CI PR #41.
