# BUG — живой сценарий WP-WORKER-03 на prod: OpenRouter недоступен с IP прод-VM

| Поле | Значение |
|------|----------|
| Пакет | WP-WORKER-03 (PR 24, merge 65e0113706, deploy run success) |
| Окружение | prod, https://transcriber.itsalt.ru, VM learn-prod (cloud.ru, egress 82.202.156.157, RU) |
| Дата | 2026-10-08 16:43–16:46Z |
| Статус | открыт; обходной путь применён (D-33); решение маршрута — P-19 |

## Факт

После деплоя воркер стартовал с `llm provider: openrouter model: anthropic/claude-haiku-5.5`. Повтор трёх протоколов (meetings `12ced01f…`, `4c390750…`, `18e14745…`) упал за ~1 с каждый: `OpenRouter API error: HTTP 403 — {"success":false,"error":"Access denied by security policy."}` (`protocol_generation_jobs.error_msg`, attempt_count 1, постоянная ошибка → FAILED без ретраев — классификация верна).

Проверка с VM: `GET https://openrouter.ai/api/v1/models` без ключа → 403, `server: cloudflare`, `cf-ray …-HEL`, тот же текст; `api.anthropic.com/v1/models` → 403; `api.deepgram.com` → 401 (доступен). С cloudpc (US) те же запросы к OpenRouter → 200. Вывод: блокировка по стране на стороне Cloudflare/OpenRouter, не ключ и не код.

## Побочный инцидент при обходе

`LLM_PROVIDER=kieai` при оставшемся `LLM_MODEL=anthropic/claude-haiku-5.5` → `LlmConfigError` при старте, pm2 перезапускал воркер в цикле ~2 мин (restarts 10→14) до правки `LLM_MODEL=claude-sonnet-4-6`. Поведение по пакету («ошибка конфигурации на старте»), но связка «модель провайдера» в `.env` требует менять обе переменные вместе — отметить в `.env.example` (backlog вместе с Low-2 ревью).

## Текущее состояние прода

`LLM_PROVIDER=kieai`, `LLM_MODEL=claude-sonnet-4-6`, `OPENROUTER_API_KEY` оставлен, `ASR_KEYTERMS_ENABLED=true` (D-31); воркер online 16:46Z, `llm provider: kieai model: claude-sonnet-4-6`. kie.ai проба 16:45Z: 200 за 10,8 с.

## Чего не хватило в пакете/ревью

Факт достижимости OpenRouter проверялся оркестратором только с cloudpc (US), не с прод-VM. Правило на будущее: внешние эндпоинты пробовать с того хоста, где будет работать код.
