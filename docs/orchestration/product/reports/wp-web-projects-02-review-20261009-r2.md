# Сверка — WP-WEB-PROJECTS-02 (PR https://github.com/ITSalt/transcriber/pull/34, `48daf9b7f4` -> `main @ 7811d25cc2`) — 2026-10-09

Раунд 2. Дифф: 9 files changed, 202 insertions(+), 53 deletions(-) (файлов: 9).

**Решение: `ACCEPTED WP-WEB-PROJECTS-02`** — пересдача закрывает пункты 1, 2, 3, 5 раунда 1 (дифф d155b8f0fa → 48daf9b7f4, 4 файла: мок встречи дополнен `language`/`duration_sec`/`updated_at`; prefill через `useEffect` только для id из `useProjects().data.items`, тесты «visible project preselects + project_id в PUT context» и «unknown id ignored, no context PUT»; ключ `["meetings", workspaceId, {project_id}]`); пункт 4 (граф) принят как отклонение: FORM-MeetingUpload без поля числа спикеров (факт сессии), формы карточки проекта в графе нет — её создание (`/nacl-sa-uc` UC-500) вне команд модуля, задача модуля spec (backlog). CI на 48daf9b7f4 зелёный (ждёт цепочка доставки; при красном CI — возврат в REVISE).

graph: checked — записей в граф в пересдаче не было (сессия вернула замок с фактами read-only); FORM-MeetingUpload F01–F06 без поля спикеров.

## Пункты REVISE

<нумерованные: `file:line` -> сценарий отказа -> требование; серьёзность>

### Не требуется

<чего сессия не должна добавлять или менять в этом раунде>

## Вопросы владельцу

<P-n, возникшие в сверке: вопрос, варианты, рекомендация; условные пункты REVISE называют P-n,
от которого зависят>

## Принято как есть / backlog

<находки low и info, принятые отклонения, кандидаты в backlog>

## Автоматические находки

- **merge-base**: WP-WEB-PROJECTS-02: branch point 5392bbe5e1 is 1 commits behind origin/main (no overlapping files) - rebase before merge

Дифф ревизии (пересдачи): git -C /home/cloudpc/projects/transcriber diff d155b8f0faf7d7d6494f58ab98c38f04fcec4cb7 48daf9b7f4225cc13ea1de9e73a8b37b61bcd447

---

## Отчёт рецензента (дословно)

Пересдачу сверил оркестратор по диффу ревизии и CI (рецензент-агент не запускался): `api.ts` — ключ запроса под префиксом `["meetings"]`; `routes/upload/index.tsx:62-78` — prefill применяется один раз после загрузки списка проектов и только для видимого проекта; `projects.test.tsx` — мок встречи полный; `routes/upload/context.test.tsx` — два новых теста (prefill видимого проекта с проверкой `project_id` в PUT context; неизвестный id игнорируется, PUT context не отправляется).
