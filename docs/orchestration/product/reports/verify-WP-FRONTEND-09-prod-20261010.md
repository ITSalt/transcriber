# Проверка — WP-FRONTEND-09 на prod (`2ce6ebe3910e`) — 2026-10-10

**Вердикт: PASS** — пройдено проверок: 3

Ветка `main`, базовый URL https://transcriber.itsalt.ru, статус пакета на старте: VERIFIED_TEST.

## Run деплоя, отдаваемая версия и команды проверки

| # | Проверка | Команда или цель | Код | Вывод (первые строки) | Вердикт |
|---|----------|------------------|-----|-----------------------|---------|
| 1 | run деплоя | `deploy-production.yml` | — | deploy-production.yml: success https://github.com/ITSalt/transcriber/actions/runs/38055500158 | PASS |
| 2 | команда проверки | `curl -fsS https://transcriber.itsalt.ru/api/health` | 0 | {"status":"ok","version":"unknown","ts":"2026-10-10T13:27:45.175Z"} | PASS |
| 3 | команда проверки | `test "$(curl -s -o /dev/null -w '%{http_code}' https://transcriber.itsalt.ru/api/meetings)" = 401 && echo 'meetings without session -> 401 (AUTH_REQUIRED=true, R-16)'` | 0 | meetings without session -> 401 (AUTH_REQUIRED=true, R-16) | PASS |

## Живой сценарий

Проверено 2026-10-10 ~13:30Z на PROD (`2ce6ebe391`, deploy-production success, api/worker online, health 200), под сессией пользователя «Тест» (curl, только чтение):

| Критерий | Шаг | Ожидалось | Получено |
|---|---|---|---|
| AC-1 | на VM `grep -c "default(null)" shared/src/api/uc002.ts` | 0 | 0 |
| AC-5 | `GET /api/meetings?workspace_id=1ea36ef9…` | 11 встреч, у каждой `project_id`/`project_name` | 11 строк, у всех поля есть (проекты a03eb007… и 81574eef…) |
| AC-5 | `GET /api/meetings/18e14745…` (карточка встречи с проектом) | ключи `project_id`, `project_name` присутствуют | `project_id` a03eb007…, `project_name` «Госключ-ПК и TCB (РТЛабс / ИИТ)», ключи есть |
| AC-5 | `GET /api/meetings/ff3ad632…` | то же | то же, ключи есть |
| AC-2–4 | ревью: отчёт `reports/wp-frontend-09-review-20261010.md` | мутация M1 ловится, CI pass, диф в разрешённых путях | подтверждено рецензентом в клоне |

Выход: logout 204. Поведение интерфейса не менялось (пакет только контракт и фикстуры).
