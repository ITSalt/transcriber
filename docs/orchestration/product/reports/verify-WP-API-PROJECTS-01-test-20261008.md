# Проверка — WP-API-PROJECTS-01 на test (`bf75f694f241`) — 2026-10-08

**Вердикт: FAIL** — провалено 1 из 3: команда проверки `curl -fsS -o /dev/null -w '%{http_code}' https://transcriber.itsalt.ru/api/meetings`

Ветка `main`, базовый URL https://transcriber.itsalt.ru, статус пакета на старте: MERGED.

## Run деплоя, отдаваемая версия и команды проверки

| # | Проверка | Команда или цель | Код | Вывод (первые строки) | Вердикт |
|---|----------|------------------|-----|-----------------------|---------|
| 1 | run деплоя | `deploy-production.yml` | — | deploy-production.yml: success https://github.com/ITSalt/transcriber/actions/runs/37767836347 | PASS |
| 2 | команда проверки | `curl -fsS https://transcriber.itsalt.ru/api/health` | 0 | {"status":"ok","version":"unknown","ts":"2026-10-08T11:08:36.235Z"} | PASS |
| 3 | команда проверки | `curl -fsS -o /dev/null -w '%{http_code}' https://transcriber.itsalt.ru/api/meetings` | 22 | 401curl: (22) The requested URL returned error: 401 | FAIL |

## Живой сценарий

<Заполняет режим verify после PASS проверок выше: критерии приёмки пакета, пройденные на этом
окружении. По каждому критерию: шаги, ожидалось, получено, доказательство (вывод команды, путь к
скриншоту). Сбой инструмента проверки (браузер, MCP) помечается как сбой инструмента с
использованным запасным путём, а не как дефект продукта.>
