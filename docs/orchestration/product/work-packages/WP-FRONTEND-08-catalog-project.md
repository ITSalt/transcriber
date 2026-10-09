# WP-FRONTEND-08 — Список встреч: название и проект, фильтр по проекту, заголовок карточки встречи

| Поле | Значение |
|------|----------|
| Поток | frontend (area) |
| Репозиторий | /home/cloudpc/projects/transcriber |
| Базовая ветка | main |
| Линия | main |
| Рабочая ветка | `feature/wp-frontend-08-catalog-project` |
| Worktree | `.claude/worktrees/wp-frontend-08-catalog-project` (создаёт `claude -w wp-frontend-08-catalog-project`) |
| Заголовок PR | `[PRODUCT] WP-FRONTEND-08: Список встреч: название и проект, фильтр по проекту, заголовок карточки встречи` |
| Сессия | `product-frontend` |
| Модель | `sonnet` |
| Усилие | — |
| Почему такая модель | модель реализатора по умолчанию (orch.yaml models.implement) |
| Режим | nacl: `/nacl-sa-ui` (список встреч: колонки и фильтр) под замком `graph`, `/nacl-tl-dev-fe` по TDD, `/nacl-tl-qa` локально |
| Команды методологии: разрешены | nacl: `nacl-tl-dev-fe`, `nacl-tl-fix`, `nacl-tl-review`, `nacl-tl-regression-test`, `nacl-tl-verify-code`, `nacl-tl-sync`, `nacl-tl-docs`, `nacl-tl-stubs`, `nacl-tl-qa`, `nacl-sa-ui`, `nacl-tl-status` |
| Команды методологии: запрещены | `nacl-tl-release`, `nacl-tl-deploy`, `nacl-tl-deliver`, `nacl-tl-hotfix`, `nacl-tl-ship`, `nacl-tl-conductor`, `nacl-tl-full`, `nacl-goal`, `nacl-publish` |
| Разрешённые пути | `web/{index.html,vite.config.ts,tsconfig.json,tsconfig.node.json,vitest.config.ts,README.md}`, `web/public/**`, `web/src/{main.tsx,App.test.tsx,test-setup.ts,vite-env.d.ts}`, `web/src/styles/**`, `web/src/components/**`, `web/src/lib/**`, `web/src/i18n/**`, `web/src/routes/{catalog,meeting,transcript}/**`, `web/src/features/{shell,auth,tasks,speakers}/**` |
| Общие пути, которые трогает пакет | `web/src/i18n/**` (новые колонки/фильтр, удаление `upload.fieldSpeakerCount*`, `upload.errorSpeakerCountRange`) |
| Миграции | нет |
| Ресурсы (замки) | `graph` по запросу |
| Тестовая БД и порты | нет; нет |
| Слот слияния | <место в очереди слияний, задаётся при приёмке> |
| Контракт | потребляет `MeetingDetail.project_id/project_name` (WP-BACKEND-08) и `WorkspaceMeetingListItem.project_id/project_name`, запрос `project_id` |
| Зависит от | WP-BACKEND-08 (в main) |
| Размер | M |
| Спецификация | UC-001, UC-002; отчёт U2, U3, U9 |
| Граф | FORM-MeetingCatalog (колонки «Встреча», «Проект», фильтр) через `/nacl-sa-ui` |
| Решения | D-40, D-42, D-43 |

Общие пути этого репозитория (объяви те, что трогает пакет): `pnpm-lock.yaml`, `package.json`, `**/package.json`, `shared/**`, `api/prisma/**`, `.tl/{status.json,master-plan.md,changelog.md,release-status.json,deploy-plan.md}`, `.tl/external-contracts/**`, `graph-infra/**`, `config.yaml`, `CLAUDE.md`, `api/src/server.ts`, `worker/src/index.ts`, `worker/src/job-processor.ts`, `worker/src/queues.ts`, `web/src/App.tsx`, `web/src/i18n/**`.
Ресурсы этого репозитория, требующие замка: `migrations`, `graph` (по запросу: LOCK/UNLOCK, см. раздел 6), `dev-stack` (по запросу: LOCK/UNLOCK, см. раздел 6).

## 0. Подготовка worktree

1. Переключи worktree на ветку пакета: `git fetch origin && git switch -c feature/wp-frontend-08-catalog-project origin/main`.
2. Подготовь worktree (команды из `orch.yaml`, выполнять внутри worktree):

   ```bash
   pnpm install --frozen-lockfile
   pnpm --filter @transcrib/api run db:generate
   ```
3. Правь только разрешённые пути; общие пути — только объявленные в шапке и после получения замка.

## 1. Факты

- Ревизия терминологии 2026-10-09 (`reports/terminology-audit-20261009.md`): владелец отменил A-2 («задача в UI = Meeting»). Словарь: «встреча» — то, что загружаем (Meeting); «поручение» — задание участнику встречи с контекстом и сроком (реестр проекта T-n, секция протокола); слово «задача» в продукте не используется ни в одном значении; фоновые работы — «обработка»; метка неподтверждённого спикера — «Спикер N» как в транскрипте (D-40, D-41, D-42). Идентификаторы кода (`Task`, `/api/projects/:id/tasks`, `T-n`, `SPEAKER_n`) не меняются.
- Код уже говорит правильно: `Meeting`/`/api/meetings`, `/api/projects/:projectId/tasks`, секции протокола `['## Участники','## Обсуждение','## Решения','## Задачи']` (`worker/src/jobs/protocol-generation.ts:85`). Расхождение живёт в строках интерфейса, промптах, тестах и графе спецификации.
- Список: `web/src/routes/catalog/components/MeetingRow.tsx:25` показывает `meeting.filename`; введённое название (`MeetingListItem.title`, `shared/src/api/uc001.ts:8-9`, «fallback when title is null») в списке не видно; колонки «Файл/Дата/Статус/Протокол» (`ru.json` `catalog.columns`); `project_name`/`project_id` из ответа не используются (`grep -n project web/src/routes/catalog` пуст); запрос `/api/meetings?workspace_id=` без `project_id` (`WorkspaceMeetingListQuery.project_id`, `shared/src/api/workspace.ts:27-30`).
- Карточка встречи `web/src/routes/meeting/index.tsx` после WP-FRONTEND-07 имеет H1; проекта на ней нет — после WP-BACKEND-08 в `MeetingDetail` есть `project_id`/`project_name`.
- Ключи `upload.fieldSpeakerCount`, `upload.fieldSpeakerCountPlaceholder`, `upload.fieldSpeakerCountHint`, `upload.errorSpeakerCountRange` в `web/src/i18n/{ru,en}.json` после WP-WEB-PROJECTS-02 не используются.

## 2. Объём

1. Список встреч: колонка «Встреча» = `title ?? filename` (имя файла второй строкой мелким шрифтом, если есть title), колонка «Проект» (`project_name` или «—», ссылка на `/projects/:id`), «Дата», «Статус», «Протокол»; фильтр «Проект» (select из `/api/projects`, значение в query `?project=` и в запрос `project_id`); пустое состояние фильтра «В этом проекте встреч нет».
2. Карточка встречи: под H1 — «Проект: <название>» ссылкой (или «Без проекта»).
3. Удалить неиспользуемые ключи `upload.*SpeakerCount*`; unit-тест на отсутствие «спикеров» в `upload.*`.
4. Тесты: колонка названия с fallback, колонка проекта, фильтр меняет запрос, ссылка на проект с карточки.

### Не входит

- merge, деплой, PROD, запись в БД
- другие модули и рабочее пространство оркестратора
- файлы вне разрешённых путей; общие пути, не объявленные выше
- подъём версий и release notes, если не перечислены выше

## 3. Критерии приёмки

1. `pnpm --filter @transcrib/web test`, `pnpm -r typecheck` зелёные; `grep -n "SpeakerCount" web/src/i18n/*.json` пуст.
2. На проде: список встреч показывает названия (встреча «Повтор … (Госключ-ПК / TCB)» видна по названию, не по имени файла) и колонку «Проект»; фильтр по проекту «Госключ-ПК и TCB» оставляет только его встречи (сверка с `GET /api/meetings?project_id=`); карточка встречи ведёт в проект (verify оркестратора).

## 4. Порядок сдачи

- PR из `feature/wp-frontend-08-catalog-project` в `main`; не мержить.
- Тело PR = отчёт разработки + `Deviations` (чем результат отличается от пакета и почему).
- Затем сообщение `product-coord`: `[PRODUCT] READY WP-FRONTEND-08 :: <sha> :: ref=<PR URL>`.

## 5. Start prompt

```text
Прочитай /home/cloudpc/projects/transcriber-orch/docs/orchestration/product/work-packages/WP-FRONTEND-08-catalog-project.md и выполни. Сначала раздел 0 (подготовка worktree). Ветка feature/wp-frontend-08-catalog-project от origin/main, PR в main, не мержить. По готовности — сообщение product-coord: [PRODUCT] READY WP-FRONTEND-08 :: <sha> :: ref=<PR URL>

Before implementing, read both CLAUDE.md and AGENTS.md (including existing case variants)
and the applicable nested instruction files. Preserve all existing client-specific text.
If one file is missing or shared blocks differ, prepare confirmed common project rules and
use orch.py instructions status/sync with both expected hashes. Update both shared blocks
when a common rule changes. Do not decide contradictory existing instructions yourself:
send QUESTION with the conflict. Run orch.py instructions check --repo . before READY.
Only the module session edits its repository's instructions; the coordinator never does.

```

### Start command

Команда запуска (владельцу, в новом терминале):

```bash
cd /home/cloudpc/projects/transcriber && claude -w wp-frontend-08-catalog-project --model sonnet --name product-frontend "Прочитай /home/cloudpc/projects/transcriber-orch/docs/orchestration/product/work-packages/WP-FRONTEND-08-catalog-project.md и выполни. Сначала раздел 0 (подготовка worktree). Ветка feature/wp-frontend-08-catalog-project от origin/main, PR в main, не мержить. По готовности — сообщение product-coord: [PRODUCT] READY WP-FRONTEND-08 :: <sha> :: ref=<PR URL>

Before implementing, read both CLAUDE.md and AGENTS.md (including existing case variants)
and the applicable nested instruction files. Preserve all existing client-specific text.
If one file is missing or shared blocks differ, prepare confirmed common project rules and
use orch.py instructions status/sync with both expected hashes. Update both shared blocks
when a common rule changes. Do not decide contradictory existing instructions yourself:
send QUESTION with the conflict. Run orch.py instructions check --repo . before READY.
Only the module session edits its repository's instructions; the coordinator never does.
"
```

`orch.py dispatch` добавляет к этой команде `--permission-mode` и `--settings <рабочее пространство>/orchestration/settings/<модуль>.json`: запускай сессию командой, которую печатает dispatch.

## 6. Если отказано

Сессия запускается с `--settings`, сгенерированным для её модуля командой `orch.py settings`: чтение, тесты и коммиты разрешены, push ветки пакета решает классификатор; merge, push в `main`, релизы, запуск workflow, прод и рабочее пространство оркестратора запрещены.

- Отказ правила или классификатора auto mode — это ответ: не обходить его (никаких `sh -c`, `git -C`, переименованных или скопированных команд, никакого копирования или правки файлов настроек и `.claude/`).
- Сообщение о недоступности классификатора (решение не принято) — не вердикт: повтори ту же команду позже.
- Дефект самого плагина (неверное сгенерированное правило, ошибка скрипта) оркестратор сообщает режимом `report`; плагин и его настройки не правь.
- Пришли `product-coord`: `[PRODUCT] QUESTION WP-FRONTEND-08 :: отказ: <точный текст отказа> :: ref=<команда>`; продолжай работу, которой это не нужно, или жди `ANSWER`.
- Ресурсы по запросу (`graph`, `dev-stack`): перед использованием пришли `product-coord`: `[PRODUCT] LOCK WP-FRONTEND-08 :: <ресурс> :: ref=<зачем>` и жди `ACK`; как только закончишь — `[PRODUCT] UNLOCK WP-FRONTEND-08 :: <ресурс> :: ref=<результат>`. READY возвращает все замки по запросу.

## Пересдачи

<Циклы REVISE: дата, пункты, коммит.>
