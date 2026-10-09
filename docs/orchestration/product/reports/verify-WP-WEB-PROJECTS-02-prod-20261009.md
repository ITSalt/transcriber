# Проверка — WP-WEB-PROJECTS-02 на prod (`39bdde1e974f`) — 2026-10-09

**Вердикт: PASS** — пройдено проверок: 3

Ветка `main`, базовый URL https://transcriber.itsalt.ru, статус пакета на старте: VERIFIED_TEST.

## Run деплоя, отдаваемая версия и команды проверки

| # | Проверка | Команда или цель | Код | Вывод (первые строки) | Вердикт |
|---|----------|------------------|-----|-----------------------|---------|
| 1 | run деплоя | `deploy-production.yml` | — | deploy-production.yml: success https://github.com/ITSalt/transcriber/actions/runs/37921157356 | PASS |
| 2 | команда проверки | `curl -fsS https://transcriber.itsalt.ru/api/health` | 0 | {"status":"ok","version":"unknown","ts":"2026-10-09T11:14:38.504Z"} | PASS |
| 3 | команда проверки | `test "$(curl -s -o /dev/null -w '%{http_code}' https://transcriber.itsalt.ru/api/meetings)" = 401 && echo 'meetings without session -> 401 (AUTH_REQUIRED=true, R-16)'` | 0 | meetings without session -> 401 (AUTH_REQUIRED=true, R-16) | PASS |

## Живой сценарий

Браузер (Playwright, headless) на https://transcriber.itsalt.ru, вход пользователем «Тест», 2026-10-09 11:15Z, served 39bdde1e97 и позже:
1. Меню: ссылки `nav a` = «Встречи», «Проекты и поручения», «Загрузить» — критерий 2 (меню) выполнен.
2. Карточка проекта «Госключ-ПК и TCB (РТЛабс / ИИТ)» (`/projects/a03eb007-…`): блок «Встречи» над участниками, кнопка «Загрузить запись» → `/upload?project=a03eb007-…`, 7 встреч проекта с названиями, датой и статусом, ссылки `/meetings/<id>` (c1661d42…, 19a07aaa…, d5a4ef93…, 4a34b88b…, c0063f5d…) — критерий 2 (карточка проекта) выполнен.
3. `/upload?project=a03eb007-…`: заголовок «Загрузить запись встречи», подписи полей — файл записи, название, язык, проект, тип, цель, повестка, «Для распознавания», предыдущий протокол, заметки; слова «спикер» на странице нет (`/спикер/i` → false); select проекта предвыбран «Госключ-ПК и TCB (РТЛабс / ИИТ)» — критерий 2 (страница загрузки без поля) и prefill выполнены.
4. Критерий 1 (grep исходников, тест тела `init` без `speaker_count`) и 3 (тесты, typecheck) — подтверждены ревью (reports/wp-web-projects-02-review-20261009-r2.md) и CI PR #34; загрузка новой встречи через API с `speaker_count: null` прошла (встреча «Повтор F», та же сессия проверки).
