# Проверка — WP-WORKER-01 на prod (`40d6ba5bc2ec`) — 2026-10-08

**Вердикт: PASS** — пройдено проверок: 3

Ветка `main`, базовый URL https://transcriber.itsalt.ru, статус пакета на старте: VERIFIED_TEST.

## Run деплоя, отдаваемая версия и команды проверки

| # | Проверка | Команда или цель | Код | Вывод (первые строки) | Вердикт |
|---|----------|------------------|-----|-----------------------|---------|
| 1 | run деплоя | `deploy-production.yml` | — | deploy-production.yml: success https://github.com/ITSalt/transcriber/actions/runs/37764296577 | PASS |
| 2 | команда проверки | `curl -fsS https://transcriber.itsalt.ru/api/health` | 0 | {"status":"ok","version":"unknown","ts":"2026-10-08T10:37:13.036Z"} | PASS |
| 3 | команда проверки | `curl -fsS -o /dev/null -w '%{http_code}' https://transcriber.itsalt.ru/api/meetings` | 0 | 200 | PASS |

## Живой сценарий

Проверено read-only после деплоя `40d6ba5bc2` (run 37764296577, Deploy to Production success, 2026-10-08 10:36Z; «No pending migrations to apply»):

| Критерий | Шаги | Ожидалось | Получено |
|----------|------|-----------|----------|
| воркер и API перезапущены на новой сборке | лог шага «Deploy to Production Server», pm2 | `transcrib-api`, `transcrib-worker` online после `pm2 delete + start` | pm2 id 355 `transcrib-api` online, id 356 `transcrib-worker` online (0 рестартов) |
| поведение прода без контекста не меняется (DEC-010, AC-2) | снапшот-тест промпта в CI на `40d6ba5bc2`; флаг `ASR_KEYTERMS_ENABLED` | запрос к LLM без контекста байт-в-байт как раньше; keyterms выключены | CI run зелёный; флаг на проде не задан (PR #17: «off by default until Q-1 is measured») |
| API жив, список встреч отдаётся | `GET /api/health`, `GET /api/meetings` | 200 | `{"status":"ok"}`, 200 (3 проверки orch.py verify) |
| шаг graph:migrate | лог деплоя | не роняет деплой (D-19) | деплой success; worker без `MEMORY_NEO4J_*` в коде main работает с `NoProjectMemoryProvider` |

Не проверялось на проде: реальная генерация протокола с контекстом (нужна встреча с контекстом — появится после доставки API-PROJECTS-01 и WEB-PROJECTS-01; запуск транскрипции на проде — платное действие, не read-only) и архив промпта в S3 (RQ-061, D-24: 3-дневный lifecycle). Покрыто тестами воркера (316/316) и сверкой раундов 1–2. Q-1 (эффект keyterms для ru) — «не замерено», флаг выключен. Сбоев инструментов не было.
