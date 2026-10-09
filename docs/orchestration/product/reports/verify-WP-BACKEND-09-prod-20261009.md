# Проверка — WP-BACKEND-09 на prod (`f68514de343f`) — 2026-10-09

**Вердикт: PASS** — пройдено проверок: 3

Ветка `main`, базовый URL https://transcriber.itsalt.ru, статус пакета на старте: VERIFIED_TEST.

## Run деплоя, отдаваемая версия и команды проверки

| # | Проверка | Команда или цель | Код | Вывод (первые строки) | Вердикт |
|---|----------|------------------|-----|-----------------------|---------|
| 1 | run деплоя | `deploy-production.yml` | — | deploy-production.yml: success https://github.com/ITSalt/transcriber/actions/runs/37932277742 | PASS |
| 2 | команда проверки | `curl -fsS https://transcriber.itsalt.ru/api/health` | 0 | {"status":"ok","version":"unknown","ts":"2026-10-09T12:50:23.020Z"} | PASS |
| 3 | команда проверки | `test "$(curl -s -o /dev/null -w '%{http_code}' https://transcriber.itsalt.ru/api/meetings)" = 401 && echo 'meetings without session -> 401 (AUTH_REQUIRED=true, R-16)'` | 0 | meetings without session -> 401 (AUTH_REQUIRED=true, R-16) | PASS |

## Живой сценарий

Contract-шаг D-43, served f68514de34, деплой 2026-10-09 12:50Z, тихое окно подтверждено перед слиянием (0 заданий/встреч в работе за последний час), бэкап R-22 снят до слияния.
1. Критерий 2: SELECT на VM — `information_schema.columns` для `transcription_jobs.speaker_count` → 0 строк; `_prisma_migrations` содержит `20261009130000_drop_speaker_count` с `finished_at` (1 строка); `transcrib-api`/`transcrib-worker` online; `GET /api/health` → 200; `GET /api/meetings/ff3ad632-…` → PROTOCOL_READY с `project_name`; `POST /api/uploads/init` → s3_key (затем abort).
2. Критерий 1 — CI PR #40 зелёный; DB-тест на PG16 — клон рецензента (раунд 1 WP-BACKEND-08).
3. Критерий 3 — gate цепочки доставки: in-flight = 0 (12:46Z); бэкап `/opt/transcrib/backups/transcrib-20261009-pre-drop-speaker-count.dump` (R-22).
