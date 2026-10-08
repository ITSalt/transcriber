# Проверка — WP-API-FEEDBACK-01 на prod (`7f3b99b62263`) — 2026-10-08

**Вердикт: PASS** — пройдено проверок: 3

Ветка `main`, базовый URL https://transcriber.itsalt.ru, статус пакета на старте: VERIFIED_TEST.

## Run деплоя, отдаваемая версия и команды проверки

| # | Проверка | Команда или цель | Код | Вывод (первые строки) | Вердикт |
|---|----------|------------------|-----|-----------------------|---------|
| 1 | run деплоя | `deploy-production.yml` | — | deploy-production.yml: success https://github.com/ITSalt/transcriber/actions/runs/37766744750 | PASS |
| 2 | команда проверки | `curl -fsS https://transcriber.itsalt.ru/api/health` | 0 | {"status":"ok","version":"unknown","ts":"2026-10-08T11:00:06.737Z"} | PASS |
| 3 | команда проверки | `curl -fsS -o /dev/null -w '%{http_code}' https://transcriber.itsalt.ru/api/meetings` | 0 | 200 | PASS |

## Живой сценарий

Проверено read-only после деплоя `7f3b99b622` (run 37766744750, Deploy to Production success; CI main run 37766743859 success; на VM `git log -1` = 7f3b99b, `api/dist/features/feedback/` собран, pm2 `transcrib-api`/`transcrib-worker` online). Встреча `ff188189-4adf-4f2c-855c-d01d2850d222` (EDITED) в пространстве «Роман», режим D-20 (вход ещё не включён):

| Критерий | Шаги | Ожидалось | Получено |
|----------|------|-----------|----------|
| список версий (UC-303) | `GET /api/meetings/:id/protocol/versions` | 200, версия 1 LEGACY из сверки версий BACKEND-01 | 200 `{"items":[{"n":1,"kind":"LEGACY","author":null,…}],"current_n":1}` |
| список отзывов (UC-305) | `GET /api/meetings/:id/feedback` | 200, пусто | 200 `{"items":[]}` |
| отзыв без входа (DEC-012, D-27) | `POST /api/meetings/:id/feedback` multipart `kind=COMMENT`, без cookie | 401 | 401 `{"code":"UNAUTHENTICATED","message":"Нужно войти"}` |
| карточка встречи не сломана | `GET /api/meetings/:id` | 200 | 200 |
| API | health, meetings | 200 | PASS (3 проверки orch.py verify) |

Ошибка оркестратора при первой пробе: запросы с id, взятым из имени файла (`cb94d4ea….webm`), дали 404 `NOT_FOUND` на всех маршрутах, включая карточку — это не дефект (встречи с таким id нет); повтор с реальным id — выше. Не проверялось на проде: приём файла и разбор .docx (запись; после включения входа и доставки WEB-FEEDBACK-01 — E2E), скачивание. Покрыто тестами (api 256, изоляция 23/23) и сверкой.
