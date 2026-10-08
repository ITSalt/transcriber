# Проверка — WP-WORKER-04 на test (`0f14bc7de397`) — 2026-10-08

**Вердикт: PASS** — пройдено проверок: 3

Ветка `main`, базовый URL https://transcriber.itsalt.ru, статус пакета на старте: MERGED.

## Run деплоя, отдаваемая версия и команды проверки

| # | Проверка | Команда или цель | Код | Вывод (первые строки) | Вердикт |
|---|----------|------------------|-----|-----------------------|---------|
| 1 | run деплоя | `deploy-production.yml` | — | deploy-production.yml: success https://github.com/ITSalt/transcriber/actions/runs/37816432764 | PASS |
| 2 | команда проверки | `curl -fsS https://transcriber.itsalt.ru/api/health` | 0 | {"status":"ok","version":"unknown","ts":"2026-10-08T17:29:20.341Z"} | PASS |
| 3 | команда проверки | `test "$(curl -s -o /dev/null -w '%{http_code}' https://transcriber.itsalt.ru/api/meetings)" = 401 && echo 'meetings without session -> 401 (AUTH_REQUIRED=true, R-16)'` | 0 | meetings without session -> 401 (AUTH_REQUIRED=true, R-16) | PASS |

## Живой сценарий

Стенда нет (merge = прод). Живой сценарий на проде после переключения `LLM_PROVIDER=openrouter` (17:29Z): стартовая строка `llm provider: openrouter model: anthropic/claude-haiku-5.5 proxy: <маскированный адрес>` — прокси подхвачен, учётка замаскирована; запросы к OpenRouter доходят (нет 403, ответы приходят за ~20 с) — транспорт через прокси доказан. Первые два повтора упали по другой причине (reasoning съел max_tokens — D-35, WP-WORKER-05), что к этому пакету не относится. После WP-WORKER-05: 12.05 и 20.05 → PROTOCOL_READY через прокси (protocol_generations: model anthropic/claude-haiku-5.5, 36 992/13 280 вх. токенов). Критерий выполнен.
