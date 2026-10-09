# Проверка — WP-BACKEND-08 на prod (`d6da675a03e7`) — 2026-10-09

**Вердикт: PASS** — пройдено проверок: 3

Ветка `main`, базовый URL https://transcriber.itsalt.ru, статус пакета на старте: VERIFIED_TEST.

## Run деплоя, отдаваемая версия и команды проверки

| # | Проверка | Команда или цель | Код | Вывод (первые строки) | Вердикт |
|---|----------|------------------|-----|-----------------------|---------|
| 1 | run деплоя | `deploy-production.yml` | — | deploy-production.yml: success https://github.com/ITSalt/transcriber/actions/runs/37930577600 | PASS |
| 2 | команда проверки | `curl -fsS https://transcriber.itsalt.ru/api/health` | 0 | {"status":"ok","version":"unknown","ts":"2026-10-09T12:35:50.229Z"} | PASS |
| 3 | команда проверки | `test "$(curl -s -o /dev/null -w '%{http_code}' https://transcriber.itsalt.ru/api/meetings)" = 401 && echo 'meetings without session -> 401 (AUTH_REQUIRED=true, R-16)'` | 0 | meetings without session -> 401 (AUTH_REQUIRED=true, R-16) | PASS |

## Живой сценарий

Раунд «expand» (код без миграции), served d6da675a03, 2026-10-09 12:35Z, api/worker online после деплоя:
1. Критерий 3 (проект в карточке): `GET /api/meetings/ff3ad632-…` → `project_id = a03eb007-f74f-4e44-aae0-c10010c8bf13`, `project_name = «Госключ-ПК и TCB (РТЛабс / ИИТ)»`.
2. Критерий 3 (загрузка работает, устаревшее поле): `POST /api/uploads/init` с `speaker_count: 3` от «кэшированного SPA» → 200 (s3_key выдан, затем abort).
3. Критерий 3 (колонка удалена) и 4 (бэкап) — раунд «contract»: ожидают второй PR; до него `information_schema` ещё содержит `speaker_count` (намеренно, expand/contract).
4. Критерии 1–2 — ревью r1 (DB-тесты на PG16, мутации) и CI PR #39.
