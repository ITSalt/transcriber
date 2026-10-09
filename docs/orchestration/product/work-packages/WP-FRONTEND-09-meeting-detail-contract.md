# WP-FRONTEND-09 — Контракт карточки встречи: project_id/project_name без default(null), фикстуры web

| Поле | Значение |
|------|----------|
| Поток | frontend (area) |
| Репозиторий | /home/cloudpc/projects/transcriber |
| Базовая ветка | main |
| Линия | main |
| Рабочая ветка | `feature/wp-frontend-09-meeting-detail-contract` |
| Worktree | `.claude/worktrees/wp-frontend-09-meeting-detail-contract` (создаёт `claude -w wp-frontend-09-meeting-detail-contract`) |
| Заголовок PR | `[PRODUCT] WP-FRONTEND-09: Контракт карточки встречи: project_id/project_name без default(null), фикстуры web` |
| Сессия | `product-frontend` |
| Модель | `sonnet` |
| Усилие | — |
| Почему такая модель | модель реализатора по умолчанию (orch.yaml models.implement) |
| Режим | nacl: `/nacl-tl-dev-fe` по TDD (контракт + фикстуры тестов); граф не трогается |
| Команды методологии: разрешены | nacl: `nacl-tl-dev-fe`, `nacl-tl-fix`, `nacl-tl-review`, `nacl-tl-regression-test`, `nacl-tl-verify-code`, `nacl-tl-sync`, `nacl-tl-docs`, `nacl-tl-stubs`, `nacl-tl-qa`, `nacl-sa-ui`, `nacl-tl-status` |
| Команды методологии: запрещены | `nacl-tl-release`, `nacl-tl-deploy`, `nacl-tl-deliver`, `nacl-tl-hotfix`, `nacl-tl-ship`, `nacl-tl-conductor`, `nacl-tl-full`, `nacl-goal`, `nacl-publish` |
| Разрешённые пути | `web/{index.html,vite.config.ts,tsconfig.json,tsconfig.node.json,vitest.config.ts,README.md}`, `web/public/**`, `web/src/{main.tsx,App.test.tsx,test-setup.ts,vite-env.d.ts}`, `web/src/styles/**`, `web/src/components/**`, `web/src/lib/**`, `web/src/i18n/**`, `web/src/routes/{catalog,meeting,transcript}/**`, `web/src/features/{shell,auth,tasks,speakers}/**`; исключение для этого пакета: `web/src/features/context/start-action.test.tsx` (только фикстура этого теста; поток web-projects активных пакетов не имеет) |
| Общие пути, которые трогает пакет | `shared/**` — только `shared/src/api/uc002.ts` (две строки) |
| Миграции | нет |
| Ресурсы (замки) | нет |
| Тестовая БД и порты | нет; нет |
| Слот слияния | <место в очереди слияний, задаётся при приёмке> |
| Контракт | `MeetingDetailResponse` (`shared/src/api/uc002.ts`): `meeting.project_id`, `meeting.project_name` — `nullable()` без `default(null)`; форма ответа API не меняется |
| Зависит от | нет (поля уже в main) |
| Размер | S |
| Спецификация | UC-002 |
| Граф | нет |
| Решения | D-17 (AGENTS.md не создавать) |

Общие пути этого репозитория (объяви те, что трогает пакет): `pnpm-lock.yaml`, `package.json`, `**/package.json`, `shared/**`, `api/prisma/**`, `.tl/{status.json,master-plan.md,changelog.md,release-status.json,deploy-plan.md}`, `.tl/external-contracts/**`, `graph-infra/**`, `config.yaml`, `CLAUDE.md`, `api/src/server.ts`, `worker/src/index.ts`, `worker/src/job-processor.ts`, `worker/src/queues.ts`, `web/src/App.tsx`, `web/src/i18n/**`.
Ресурсы этого репозитория, требующие замка: `migrations`, `graph` (по запросу: LOCK/UNLOCK, см. раздел 6), `dev-stack` (по запросу: LOCK/UNLOCK, см. раздел 6).

## 0. Подготовка worktree

1. Переключи worktree на ветку пакета: `git fetch origin && git switch -c feature/wp-frontend-09-meeting-detail-contract origin/main`.
2. Подготовь worktree (команды из `orch.yaml`, выполнять внутри worktree):

   ```bash
   pnpm install --frozen-lockfile
   pnpm --filter @transcrib/api run db:generate
   ```
3. Правь только разрешённые пути; общие пути — только объявленные в шапке и после получения замка.

## 1. Факты

- `shared/src/api/uc002.ts:12-13`: `project_id: z.string().uuid().nullable().default(null)`, `project_name: z.string().nullable().default(null)`. Поля добавлены пакетом backend (карточка встречи с проектом) с `default(null)`, чтобы не ломать фикстуры web; ревью backend попросило снять default после правки фикстур (`reports/wp-backend-08-review-20261009.md:14`), ревью frontend перенесло снятие в backlog (`reports/wp-frontend-08-review-20261009.md:11,15`).
- Чем плох `default(null)`: контракт ответа объявляет поле «может отсутствовать», хотя API (`api/src/services/uc-002.service.ts:68-69`) отдаёт его всегда. Сервер, забывший поле, пройдёт `parse` молча; тест с неполной фикстурой не упадёт. Контракт ответа должен требовать поле (как остальные `nullable()` поля этого же объекта).
- Мутация ревью (`reports/wp-frontend-08-review-20261009.md:40`, M5): снятие default в main на тот момент валило 63 web-теста в 4 файлах фикстур. Сейчас в main: `web/src/routes/meeting/index.test.tsx:63-71` уже содержит `project_id: null, project_name: null`; без них (grep `project_id` = 0) — `web/src/features/context/start-action.test.tsx`; по одному вхождению — `web/src/features/speakers/speakers.test.tsx`, `web/src/routes/meeting/components/RetryProcessingButton.test.tsx` (проверить каждую фикстуру `MeetingDetailResponse`, не только первую).
- Потребители типа `MeetingDetailResponse`: `web/src/routes/meeting/index.tsx:15` (`useMeetingDetail`), `api/src/routes/uc-002.ts:32`, `api/src/services/uc-002.service.ts:31` — после снятия default входной и выходной TS-типы совпадают, `pnpm -r typecheck` должен остаться зелёным (api собирает объект с обоими полями).

## 2. Объём

1. `shared/src/api/uc002.ts`: убрать `.default(null)` у `meeting.project_id` и `meeting.project_name` (остаётся `.nullable()`).
2. Фикстуры web, которые строят `MeetingDetailResponse` целиком или через `parse`: добавить `project_id: null, project_name: null` везде, где поля отсутствуют — `web/src/features/context/start-action.test.tsx`, `web/src/features/speakers/speakers.test.tsx`, `web/src/routes/meeting/components/RetryProcessingButton.test.tsx`, при необходимости `web/src/routes/meeting/index.test.tsx` и другие тесты в разрешённых путях, которые упадут после п. 1.
3. Тест на контракт (shared или web, в разрешённых путях): `MeetingDetailResponse.safeParse` объекта без `project_id` → `success: false`; с `project_id: null, project_name: null` → `success: true`.
4. `pnpm -r typecheck` и `pnpm test` (весь репозиторий: изменён `shared/`) зелёные; никаких изменений поведения UI.

### Не входит

- merge, деплой, PROD, запись в БД
- другие модули и рабочее пространство оркестратора
- файлы вне разрешённых путей; общие пути, не объявленные выше
- подъём версий и release notes, если не перечислены выше

## 3. Критерии приёмки

1. `grep -n "default(null)" shared/src/api/uc002.ts` → пусто; поля объявлены `.nullable()`.
2. Тест п. 3 объёма существует и чувствителен к мутации: вернуть `.default(null)` у `project_id` → тест падает.
3. `pnpm -r typecheck` зелёный; `pnpm test` зелёный во всех пакетах (api, worker, web, shared); CI PR зелёный.
4. Диф не содержит изменений вне `shared/src/api/uc002.ts`, тестовых файлов web из объёма и одного нового теста; `AGENTS.md` не создан (D-17).
5. После merge на проде (verify): карточка встречи `GET /api/meetings/:id` по-прежнему отдаёт `project_id`/`project_name` (null или значение) — проверяется оркестратором curl'ом под сессией «Тест».

## 4. Порядок сдачи

- PR из `feature/wp-frontend-09-meeting-detail-contract` в `main`; не мержить.
- Тело PR = отчёт разработки + `Deviations` (чем результат отличается от пакета и почему).
- Затем сообщение `product-coord`: `[PRODUCT] READY WP-FRONTEND-09 :: <sha> :: ref=<PR URL>`.

## 5. Start prompt

```text
Прочитай /home/cloudpc/projects/transcriber-orch/docs/orchestration/product/work-packages/WP-FRONTEND-09-meeting-detail-contract.md и выполни. Сначала раздел 0 (подготовка worktree). Ветка feature/wp-frontend-09-meeting-detail-contract от origin/main, PR в main, не мержить. По готовности — сообщение product-coord: [PRODUCT] READY WP-FRONTEND-09 :: <sha> :: ref=<PR URL>

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
cd /home/cloudpc/projects/transcriber && claude -w wp-frontend-09-meeting-detail-contract --model sonnet --name product-frontend "Прочитай /home/cloudpc/projects/transcriber-orch/docs/orchestration/product/work-packages/WP-FRONTEND-09-meeting-detail-contract.md и выполни. Сначала раздел 0 (подготовка worktree). Ветка feature/wp-frontend-09-meeting-detail-contract от origin/main, PR в main, не мержить. По готовности — сообщение product-coord: [PRODUCT] READY WP-FRONTEND-09 :: <sha> :: ref=<PR URL>

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
- Пришли `product-coord`: `[PRODUCT] QUESTION WP-FRONTEND-09 :: отказ: <точный текст отказа> :: ref=<команда>`; продолжай работу, которой это не нужно, или жди `ANSWER`.
- Ресурсы по запросу (`graph`, `dev-stack`): перед использованием пришли `product-coord`: `[PRODUCT] LOCK WP-FRONTEND-09 :: <ресурс> :: ref=<зачем>` и жди `ACK`; как только закончишь — `[PRODUCT] UNLOCK WP-FRONTEND-09 :: <ресурс> :: ref=<результат>`. READY возвращает все замки по запросу.

## Пересдачи

<Циклы REVISE: дата, пункты, коммит.>
