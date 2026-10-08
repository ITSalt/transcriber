# Проверка — WP-WORKER-03 на prod (`65e01137061f`) — 2026-10-08

**Вердикт: PASS** — пройдено проверок: 3

Ветка `main`, базовый URL https://transcriber.itsalt.ru, статус пакета на старте: VERIFIED_TEST.

## Run деплоя, отдаваемая версия и команды проверки

| # | Проверка | Команда или цель | Код | Вывод (первые строки) | Вердикт |
|---|----------|------------------|-----|-----------------------|---------|
| 1 | run деплоя | `deploy-production.yml` | — | deploy-production.yml: success https://github.com/ITSalt/transcriber/actions/runs/37810537159 | PASS |
| 2 | команда проверки | `curl -fsS https://transcriber.itsalt.ru/api/health` | 0 | {"status":"ok","version":"unknown","ts":"2026-10-08T16:43:45.662Z"} | PASS |
| 3 | команда проверки | `test "$(curl -s -o /dev/null -w '%{http_code}' https://transcriber.itsalt.ru/api/meetings)" = 401 && echo 'meetings without session -> 401 (AUTH_REQUIRED=true, R-16)'` | 0 | meetings without session -> 401 (AUTH_REQUIRED=true, R-16) | PASS |

## Живой сценарий

Стенда нет (merge = прод). Факты после деплоя 65e0113706 (worker перезапущен 16:43:09Z): стартовая строка `llm provider: openrouter model: anthropic/claude-haiku-5.5` — провайдер выбран по ключу, как заявлено. **Живой сценарий FAIL (не код, а сеть):** три повтора протоколов (`12ced01f…`, `4c390750…`, `18e14745…`) → `OpenRouter API error: HTTP 403 — {"success":false,"error":"Access denied by security policy."}` за ~1 с, постоянная ошибка → FAILED без ретраев (классификация по пакету верна). Причина: Cloudflare/OpenRouter блокирует RU-IP прод-VM (82.202.156.157): `GET /api/v1/models` без ключа с VM → 403 (`cf-ray …-HEL`), `api.anthropic.com` → 403; с cloudpc (US) → 200. Обход D-33: `LLM_PROVIDER=kieai`, `LLM_MODEL=claude-sonnet-4-6`, перезапуск воркера → `llm provider: kieai model: claude-sonnet-4-6`, online 16:46Z (до правки LLM_MODEL — crash-loop ~2 мин по LlmConfigError, см. bugs/BUG-3-verify-wp-worker-03-prod.md). Статус пакета возвращён в VERIFYING до решения P-19 (маршрут к OpenRouter).
