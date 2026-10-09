# Сверка — WP-FRONTEND-08 (PR https://github.com/ITSalt/transcriber/pull/41, `81fba93636` -> `main @ f68514de34`) — 2026-10-09

Раунд 1. Дифф: 9 files changed, 201 insertions(+), 28 deletions(-) (файлов: 9).

**Решение: `REVISE WP-FRONTEND-08`** — все четыре пункта объёма реализованы в разрешённых путях, тесты ловят мутации, CI и typecheck зелёные (288/288), граф обновлён (FORM-MeetingCatalog F01/F07/F08 — проверено запросом); остаётся один дефект поведения: после смены пространства в URL живёт `?project=` чужого проекта, запрос уходит с ним, список пуст, а select показывает «Все проекты» и не даёт сбросить фильтр.

## Пункты REVISE

1. `web/src/routes/catalog/index.tsx:50,82-86` + `web/src/lib/session.tsx:105-116` → пользователь на `/catalog?project=P1` переключает пространство: список проектов нового пространства без P1, запрос `…&project_id=P1` → `{items: []}`, страница «В этом проекте встреч нет», select показывает «Все проекты» (value ""), выбор «Все проекты» не вызывает change — сбросить нельзя без ручной правки URL → объём п. 1 (фильтр «Проект»). Требование: когда `projects.data` загружен и `projectId` отсутствует среди `items`, убрать `project` из URL (`setSearchParams`) или не передавать его в запрос; unit-тест на этот случай. Серьёзность: Medium.
2. `web/src/routes/catalog/index.test.tsx:224-258` → покрыт только «выбор → project_id в запросе»; чтение `?project=` при загрузке и сброс «Все проекты» (удаление из URL и из запроса) не покрыты (рецензент доказал временным тестом) → объём п. 4. Требование: тест с `initialEntries: ["/?project=PID"]` (запрос с project_id, select = PID), затем выбор "" → URL без `project` и запрос без `project_id`. Серьёзность: Low, входит в раунд.
3. `web/src/routes/meeting/index.test.tsx:63-71` → фикстура `MOCK_DETAIL_BASE.meeting` без `project_id`/`project_name` держится только на `.default(null)` в `shared/src/api/uc002.ts:12-13` (просьба ревью WP-BACKEND-08 снять default после правки фикстур) → Требование: в фикстурах модуля (`routes/meeting/**`) добавить `project_id: null, project_name: null`; фикстуры других модулей (`features/context/start-action.test.tsx`, `features/speakers/speakers.test.tsx`, `routes/meeting/components/RetryProcessingButton.test.tsx` — последний в области, тоже поправить) и снятие `.default(null)` в shared — backlog. Серьёзность: Low.

### Не требуется

- Снимать `.default(null)` в `shared/src/api/uc002.ts` (вне области; backlog).
- Переделывать `auth.test.tsx` (сужение селектора принято).
- Трогать `features/projects` (импорт `useProjects` принят как переиспользование).

## Вопросы владельцу

нет

## Принято как есть / backlog

- Отклонения PR: граф — сделан после READY под замком (F01/F07/F08, F12 note); `auth.test.tsx`; AGENTS.md — D-17; прод-проверка — verify оркестратора.
- Backlog: `.default(null)` у `project_id`/`project_name` в `shared/src/api/uc002.ts` + фикстуры `features/context`, `features/speakers`; безымянная ссылка при `project_id` без `project_name` (недостижимо: `onDelete: SetNull`, имя из join) — fallback `?? project_id`; тест паритета ключей ru/en отсутствует в репозитории.

## Автоматические находки

- не найдено

Дифф ревизии (пересдачи): —

---

## Отчёт рецензента (дословно)

Verdict: ACCEPT with condition (orchestrator: REVISE for the stale-filter defect). All four scope items implemented inside allowed paths (9 files: features/auth test, i18n ru/en + wording test, routes/catalog index/test/MeetingRow, routes/meeting index/test); five claimed tests exist and are mutation-sensitive. Filter semantics: `?project=` read on render (`index.tsx:50`), written via `setSearchParams` (`:57-62`), query key `["meetings", workspaceId, projectId]`; throwaway test proved round-trip load/reset and that a projects-list 500 does not block the table. Workspace switch: `setWorkspaceId` (`session.tsx:105-116`) keeps the URL → foreign `project_id` → API `uc-001.service.ts:35` filters by workspace → `{items: []}`, select shows «All projects» (value ""), re-choosing it fires no change (M1). Catalog row: title fallback, second-line filename, project link/«—», status badge and polling untouched; a11y preserved. Meeting card: project line under H1; `project_id` with null name renders an unnamed link — unreachable (`onDelete: SetNull`, name from join). i18n: new keys in both languages; removed keys have no usages; no Cyrillic in changed TSX. M2: `.default(null)` still in `shared/src/api/uc002.ts:12-13`; dropping it fails 63 web tests in 4 fixture files (`routes/meeting/index.test.tsx:63-71`, `start-action.test.tsx`, `RetryProcessingButton.test.tsx`, `speakers.test.tsx`).

CI pass 2m13s; 9 files +201/−28. Clone: setup exit 0; web tests `21 passed`, `288 passed`, 38.95 s; `pnpm -r typecheck` Done x4. Mutations: M1 drop `&project_id=` → filter test fails; M2 filename instead of title → fallback test fails (+3 collateral); M3 card `<Link>` → `<span>` → project-link test fails; M4 re-add `upload.fieldSpeakerCount` → wording test fails; M5 drop `.default(null)` → 63 failed. Cleanup: clone removed, nothing written to repo/PR.
