# Проверка — WP-WEB-PROJECTS-01 на test (`7a2b25a1350d`) — 2026-10-08

**Вердикт: PASS** — пройдено проверок: 3

Ветка `main`, базовый URL https://transcriber.itsalt.ru, статус пакета на старте: MERGED.

## Run деплоя, отдаваемая версия и команды проверки

| # | Проверка | Команда или цель | Код | Вывод (первые строки) | Вердикт |
|---|----------|------------------|-----|-----------------------|---------|
| 1 | run деплоя | `deploy-production.yml` | — | deploy-production.yml: success https://github.com/ITSalt/transcriber/actions/runs/37768347922 | PASS |
| 2 | команда проверки | `curl -fsS https://transcriber.itsalt.ru/api/health` | 0 | {"status":"ok","version":"unknown","ts":"2026-10-08T11:14:13.904Z"} | PASS |
| 3 | команда проверки | `test "$(curl -s -o /dev/null -w '%{http_code}' https://transcriber.itsalt.ru/api/meetings)" = 401 && echo 'meetings without session -> 401 (AUTH_REQUIRED=true, R-16)'` | 0 | meetings without session -> 401 (AUTH_REQUIRED=true, R-16) | PASS |

## Живой сценарий

<Заполняет режим verify после PASS проверок выше: критерии приёмки пакета, пройденные на этом
окружении. По каждому критерию: шаги, ожидалось, получено, доказательство (вывод команды, путь к
скриншоту). Сбой инструмента проверки (браузер, MCP) помечается как сбой инструмента с
использованным запасным путём, а не как дефект продукта.>
