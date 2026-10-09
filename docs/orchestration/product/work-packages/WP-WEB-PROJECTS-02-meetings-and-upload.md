# WP-WEB-PROJECTS-02 — «Проекты и поручения», встречи на карточке проекта, удаление поля «Количество спикеров»

| Поле | Значение |
|------|----------|
| Поток | web-projects (area) |
| Репозиторий | /home/cloudpc/projects/transcriber |
| Базовая ветка | main |
| Линия | main |
| Рабочая ветка | `feature/wp-web-projects-02-meetings-and-upload` |
| Worktree | `.claude/worktrees/wp-web-projects-02-meetings-and-upload` (создаёт `claude -w wp-web-projects-02-meetings-and-upload`) |
| Заголовок PR | `[PRODUCT] WP-WEB-PROJECTS-02: «Проекты и поручения», встречи на карточке проекта, удаление поля «Количество спикеров»` |
| Сессия | `product-web-projects` |
| Модель | `sonnet` |
| Усилие | — |
| Почему такая модель | модель реализатора по умолчанию (orch.yaml models.implement) |
| Режим | nacl: `/nacl-sa-ui` (блок встреч на карточке проекта) под замком `graph`, `/nacl-tl-dev-fe` по TDD |
| Команды методологии: разрешены | nacl: `nacl-tl-dev-fe`, `nacl-tl-fix`, `nacl-tl-review`, `nacl-tl-regression-test`, `nacl-tl-verify-code`, `nacl-tl-sync`, `nacl-tl-docs`, `nacl-tl-stubs`, `nacl-tl-qa`, `nacl-sa-ui`, `nacl-tl-status` |
| Команды методологии: запрещены | `nacl-tl-release`, `nacl-tl-deploy`, `nacl-tl-deliver`, `nacl-tl-hotfix`, `nacl-tl-ship`, `nacl-tl-conductor`, `nacl-tl-full`, `nacl-goal`, `nacl-publish` |
| Разрешённые пути | `web/src/routes/upload/**`, `web/src/features/{projects,context}/**` |
| Общие пути, которые трогает пакет | нет |
| Миграции | нет |
| Ресурсы (замки) | `graph` по запросу |
| Тестовая БД и порты | нет; нет |
| Слот слияния | <место в очереди слияний, задаётся при приёмке> |
| Контракт | потребляет `WorkspaceMeetingListQuery.project_id` (`shared/src/api/workspace.ts:27-30`) и `/api/meetings?workspace_id=&project_id=`; поле `speaker_count` в `UploadInit`/`uc100.ts:94` остаётся optional до WP-BACKEND-08 — форма его больше не шлёт |
| Зависит от | нет (WP-BACKEND-08 удалит `speaker_count` из контракта после слияния этого пакета) |
| Размер | M |
| Спецификация | UC-500, UC-502, UC-100; отчёт U1, U4, D-42 (меню) |
| Граф | форма карточки проекта (блок «Встречи») через `/nacl-sa-ui`; FORM-MeetingUpload — поле «Количество спикеров» удаляется (с WP-SPEC-01 согласовать: кто первый, тот правит; второй проверяет) |
| Решения | D-42, D-43, D-21 |

Общие пути этого репозитория (объяви те, что трогает пакет): `pnpm-lock.yaml`, `package.json`, `**/package.json`, `shared/**`, `api/prisma/**`, `.tl/{status.json,master-plan.md,changelog.md,release-status.json,deploy-plan.md}`, `.tl/external-contracts/**`, `graph-infra/**`, `config.yaml`, `CLAUDE.md`, `api/src/server.ts`, `worker/src/index.ts`, `worker/src/job-processor.ts`, `worker/src/queues.ts`, `web/src/App.tsx`, `web/src/i18n/**`.
Ресурсы этого репозитория, требующие замка: `migrations`, `graph` (по запросу: LOCK/UNLOCK, см. раздел 6), `dev-stack` (по запросу: LOCK/UNLOCK, см. раздел 6).

## 0. Подготовка worktree

1. Переключи worktree на ветку пакета: `git fetch origin && git switch -c feature/wp-web-projects-02-meetings-and-upload origin/main`.
2. Подготовь worktree (команды из `orch.yaml`, выполнять внутри worktree):

   ```bash
   pnpm install --frozen-lockfile
   pnpm --filter @transcrib/api run db:generate
   ```
3. Правь только разрешённые пути; общие пути — только объявленные в шапке и после получения замка.

## 1. Факты

- Ревизия терминологии 2026-10-09 (`reports/terminology-audit-20261009.md`): владелец отменил A-2 («задача в UI = Meeting»). Словарь: «встреча» — то, что загружаем (Meeting); «поручение» — задание участнику встречи с контекстом и сроком (реестр проекта T-n, секция протокола); слово «задача» в продукте не используется ни в одном значении; фоновые работы — «обработка»; метка неподтверждённого спикера — «Спикер N» как в транскрипте (D-40, D-41, D-42). Идентификаторы кода (`Task`, `/api/projects/:id/tasks`, `T-n`, `SPEAKER_n`) не меняются.
- Код уже говорит правильно: `Meeting`/`/api/meetings`, `/api/projects/:projectId/tasks`, секции протокола `['## Участники','## Обсуждение','## Решения','## Задачи']` (`worker/src/jobs/protocol-generation.ts:85`). Расхождение живёт в строках интерфейса, промптах, тестах и графе спецификации.
- Меню: `web/src/features/projects/index.ts:22` `navItems` с подписью `projects/i18n/ru.json:2` `nav` = «Проекты». По D-42 — «Проекты и поручения».
- Карточка проекта `web/src/features/projects/ProjectDetailPage.tsx`: участники, глоссарий, слот `project.tabs` (`:208`) с памятью; списка встреч проекта нет; в списке проектов есть только `meeting_count` (`shared/src/api/project.ts:112`). API списка встреч уже фильтрует по проекту: `WorkspaceMeetingListQuery.project_id` (`shared/src/api/workspace.ts:27-30`), ответ содержит `project_id`/`project_name`.
- Поле «Количество спикеров»: `web/src/routes/upload/index.tsx` использует `upload.fieldSpeakerCount*`, `upload.errorSpeakerCountRange` (строки в `web/src/i18n/ru.json` — модуль frontend; ключи остаются до WP-FRONTEND-08, где их удалят), шлёт `speaker_count` в `POST /api/uploads/init` (`shared/src/api/uc100.ts:94`). Значение до Deepgram не доходит: `worker/src/asr/deepgram-adapter.ts:219-223` (D-21); в промпт LLM не попадает. Подсказка «улучшит разделение по голосам» ложная.

## 2. Объём

1. Пункт меню «Проекты и поручения» (RU) / «Projects & assignments» (EN) — `projects/i18n`.
2. Карточка проекта: блок «Встречи» над памятью (или первой вкладкой — по `/nacl-sa-ui`): список встреч проекта из `/api/meetings?workspace_id=…&project_id=…` — название (`title ?? filename`), дата, статус (подписи статусов из ядра `catalog.status.*`), ссылка на `/meetings/:id`; пустое состояние «Встреч в проекте пока нет»; кнопка «Загрузить запись» → `/upload` с предвыбранным проектом (query `?project=`; форма контекста уже умеет выбирать проект — предзаполнить).
3. Загрузка: удалить поле «Количество спикеров» и его валидацию из `routes/upload/index.tsx`, не отправлять `speaker_count`; в `draft.ts`/`start.ts` фичи context — убедиться, что `speaker_count` не формируется. Ключи `upload.fieldSpeakerCount*` в `web/src/i18n` не трогать (другой модуль; удалит WP-FRONTEND-08).
4. Тесты: блок встреч (загрузка, пустое, ссылка), меню, форма без поля (тело `init` без `speaker_count`).

### Не входит

- merge, деплой, PROD, запись в БД
- другие модули и рабочее пространство оркестратора
- файлы вне разрешённых путей; общие пути, не объявленные выше
- подъём версий и release notes, если не перечислены выше

## 3. Критерии приёмки

1. `grep -rn "speaker_count\|speakerCount" web/src/routes/upload web/src/features/context` пуст; тест формы проверяет тело `POST /api/uploads/init` без `speaker_count`.
2. На проде: меню «Проекты и поручения»; карточка проекта «Госключ-ПК и TCB» показывает её встречи со ссылками; на странице загрузки поля «Количество спикеров» нет (verify оркестратора).
3. `pnpm --filter @transcrib/web test`, `pnpm -r typecheck` зелёные.

## 4. Порядок сдачи

- PR из `feature/wp-web-projects-02-meetings-and-upload` в `main`; не мержить.
- Тело PR = отчёт разработки + `Deviations` (чем результат отличается от пакета и почему).
- Затем сообщение `product-coord`: `[PRODUCT] READY WP-WEB-PROJECTS-02 :: <sha> :: ref=<PR URL>`.

## 5. Start prompt

```text
Прочитай /home/cloudpc/projects/transcriber-orch/docs/orchestration/product/work-packages/WP-WEB-PROJECTS-02-meetings-and-upload.md и выполни. Сначала раздел 0 (подготовка worktree). Ветка feature/wp-web-projects-02-meetings-and-upload от origin/main, PR в main, не мержить. По готовности — сообщение product-coord: [PRODUCT] READY WP-WEB-PROJECTS-02 :: <sha> :: ref=<PR URL>

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
cd /home/cloudpc/projects/transcriber && claude -w wp-web-projects-02-meetings-and-upload --model sonnet --name product-web-projects "Прочитай /home/cloudpc/projects/transcriber-orch/docs/orchestration/product/work-packages/WP-WEB-PROJECTS-02-meetings-and-upload.md и выполни. Сначала раздел 0 (подготовка worktree). Ветка feature/wp-web-projects-02-meetings-and-upload от origin/main, PR в main, не мержить. По готовности — сообщение product-coord: [PRODUCT] READY WP-WEB-PROJECTS-02 :: <sha> :: ref=<PR URL>

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
- Пришли `product-coord`: `[PRODUCT] QUESTION WP-WEB-PROJECTS-02 :: отказ: <точный текст отказа> :: ref=<команда>`; продолжай работу, которой это не нужно, или жди `ANSWER`.
- Ресурсы по запросу (`graph`, `dev-stack`): перед использованием пришли `product-coord`: `[PRODUCT] LOCK WP-WEB-PROJECTS-02 :: <ресурс> :: ref=<зачем>` и жди `ACK`; как только закончишь — `[PRODUCT] UNLOCK WP-WEB-PROJECTS-02 :: <ресурс> :: ref=<результат>`. READY возвращает все замки по запросу.

## Пересдачи

<Циклы REVISE: дата, пункты, коммит.>
