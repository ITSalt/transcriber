# Проверка — WP-WORKER-05 на test (`06068a32e3ed`) — 2026-10-08

**Вердикт: PASS** — пройдено проверок: 3

Ветка `main`, базовый URL https://transcriber.itsalt.ru, статус пакета на старте: MERGED.

## Run деплоя, отдаваемая версия и команды проверки

| # | Проверка | Команда или цель | Код | Вывод (первые строки) | Вердикт |
|---|----------|------------------|-----|-----------------------|---------|
| 1 | run деплоя | `deploy-production.yml` | — | deploy-production.yml: success https://github.com/ITSalt/transcriber/actions/runs/37819709928 | PASS |
| 2 | команда проверки | `curl -fsS https://transcriber.itsalt.ru/api/health` | 0 | {"status":"ok","version":"unknown","ts":"2026-10-08T17:54:49.934Z"} | PASS |
| 3 | команда проверки | `test "$(curl -s -o /dev/null -w '%{http_code}' https://transcriber.itsalt.ru/api/meetings)" = 401 && echo 'meetings without session -> 401 (AUTH_REQUIRED=true, R-16)'` | 0 | meetings without session -> 401 (AUTH_REQUIRED=true, R-16) | PASS |

## Живой сценарий

Стенда нет (merge = прод). После деплоя 06068a32e3 воркер стартовал со строкой `… reasoning: off max_tokens: 8192` (17:54:37Z). Живой сценарий: повтор протоколов 12.05 (`12ced01f…`) и 20.05 (`4c390750…`) → PROTOCOL_READY за ~20 с каждый (17:55Z); `protocol_generations`: `anthropic/claude-haiku-5.5`, 36 992→2 644 и 13 280→1 497 токенов; шаги памяти MEMORY_EXTRACT/RESOLVE/SUMMARY (json + reasoning off) — выполнены для обоих проектов (память v4 / v2). Проход B (три повторные загрузки с keyterms) — все три протокола за 17:56–17:58Z без ошибок. Критерий выполнен.
