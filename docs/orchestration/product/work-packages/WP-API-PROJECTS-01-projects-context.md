# WP-API-PROJECTS-01 — API проектов и контекста встречи, запуск распознавания

| Поле | Значение |
|------|----------|
| Поток | api-projects (area) |
| Репозиторий | . |
| Базовая ветка | main |
| Линия | main |
| Рабочая ветка | `feature/wp-api-projects-01-projects-context` |
| Worktree | `.claude/worktrees/wp-api-projects-01-projects-context` (создаёт `claude -w wp-api-projects-01-projects-context`) |
| Заголовок PR | `[PRODUCT] WP-API-PROJECTS-01: API проектов и контекста встречи, запуск распознавания` |
| Сессия | `product-api-projects` |
| Модель | `sonnet` |
| Усилие | — |
| Почему такая модель | модель реализатора по умолчанию (orch.yaml models.implement) |
| Режим | nacl, spec-first: `/nacl-sa-feature` (UC фичи) под замком `graph`, затем `/nacl-tl-dev-be` по TDD, `/nacl-tl-review --be` |
| Команды методологии: разрешены | nacl: `nacl-tl-dev-be`, `nacl-tl-dev`, `nacl-tl-fix`, `nacl-tl-review`, `nacl-tl-regression-test`, `nacl-tl-verify-code`, `nacl-tl-sync`, `nacl-tl-docs`, `nacl-tl-stubs`, `nacl-sa-uc`, `nacl-sa-domain`, `nacl-sa-feature`, `nacl-sa-validate`, `nacl-tl-plan`, `nacl-tl-status` |
| Команды методологии: запрещены | `nacl-tl-release`, `nacl-tl-deploy`, `nacl-tl-deliver`, `nacl-tl-hotfix`, `nacl-tl-ship`, `nacl-tl-conductor`, `nacl-tl-full`, `nacl-goal`, `nacl-publish` |
| Разрешённые пути | `api/src/features/{projects,context}/**` |
| Общие пути, которые трогает пакет | нет (маршруты подключаются автоматически из api/src/features/<фича>/routes.ts через реестр WP-BACKEND-06) |
| Миграции | нет |
| Ресурсы (замки) | `graph` по запросу |
| Тестовая БД и порты | нет; нет |
| Слот слияния | <место в очереди слияний, задаётся при приёмке> |
| Контракт | реализует контракт project/context v1 из WP-BACKEND-06: CRUD `/api/projects` (участники, глоссарий), `PUT /api/meetings/:id/context`, `POST /api/meetings/:id/start`, «добавить в проект» из контекста, `GET /api/projects/:id/last-protocol` |
| Зависит от | WP-BACKEND-01 (в main: `request.auth`, `assertWorkspaceAccess`, `deferStart`) |
| Размер | M |
| Спецификация | UC-100 (изменённый), FR-004 |
| Граф | UC-100 и UC проектов — через `/nacl-sa-feature` |
| Решения | D-6, D-9, D-10, D-15 |

Общие пути этого репозитория (объяви те, что трогает пакет): `pnpm-lock.yaml`, `package.json`, `**/package.json`, `shared/**`, `api/prisma/**`, `.tl/**`, `graph-infra/**`, `config.yaml`, `CLAUDE.md`, `api/src/server.ts`, `worker/src/index.ts`, `worker/src/job-processor.ts`, `worker/src/queues.ts`, `web/src/App.tsx`, `web/src/i18n/**`.
Ресурсы этого репозитория, требующие замка: `migrations`, `graph` (по запросу: LOCK/UNLOCK, см. раздел 6), `dev-stack` (по запросу: LOCK/UNLOCK, см. раздел 6).

## 0. Подготовка worktree

1. Переключи worktree на ветку пакета: `git fetch origin && git switch -c feature/wp-api-projects-01-projects-context origin/main`.
2. Подготовь worktree (команды из `orch.yaml`, выполнять внутри worktree):

   ```bash
   pnpm install --frozen-lockfile
   pnpm --filter @transcrib/api run db:generate
   ```
3. Правь только разрешённые пути; общие пути — только объявленные в шапке и после получения замка.

## 1. Факты

- Распознавание сейчас стартует в `finalizeUpload` (`api/src/services/uc-100.service.ts:244-247`); после WP-BACKEND-01 `complete` с `deferStart=true` оставляет встречу в `AWAITING_START` без задания.
- Таблицы `Project`, `ProjectParticipant`, `GlossaryTerm`, `MeetingContext` и `Meeting.projectId` создаёт WP-BACKEND-06; keyterms и промпт из снимка строит WP-WORKER-01.
- Постановка задания транскрипции — существующая очередь (`api/src/queue.ts`), payload `{transcription_job_id, speaker_count}` (`uc-100.service.ts:244-247`).

## 2. Объём

1. Проекты в пространстве: CRUD проекта, участников (имя, варианты написания, роль, организация, сторона), терминов глоссария (термин, варианты, пояснение, флаг «для распознавания»); всё через `assertWorkspaceAccess`.
2. `PUT /api/meetings/:id/context` (только в `AWAITING_START`): тип, цель, повестка, доп. участники/термины, предыдущий протокол (`project` — последний протокол проекта; `upload` — текст ≤ 200 тыс. символов; `none`), заметки.
3. `POST /api/meetings/:id/start`: только из `AWAITING_START`; собирает снимок = карточка проекта + дополнения (+ текст предыдущего протокола), считает `snapshotHash`, пишет `MeetingContext`, `Meeting.projectId`, ставит транскрипцию в очередь тем же путём, что `finalizeUpload` (вынести общий код в `api/src/features/context/`, не правя ядро; если без правки ядра нельзя — `QUESTION` оркестратору). Повтор — 409.
4. «Добавить в проект» участника/термин из контекста встречи.
5. `GET /api/projects/:id/last-protocol` — последний протокол проекта (текущая версия).
6. Не делать: ASR/LLM, UI, память проекта.

### Не входит

- merge, деплой, PROD, запись в БД
- другие модули и рабочее пространство оркестратора
- файлы вне разрешённых путей; общие пути, не объявленные выше
- подъём версий и release notes, если не перечислены выше

## 3. Критерии приёмки

1. Тесты: CRUD проектов; контекст только в `AWAITING_START`; `start` пишет снимок и ставит задание, повтор → 409; снимок не меняется при последующей правке проекта.
2. Тест изоляции из WP-BACKEND-01 автоматически покрывает новые маршруты (чужой проект/встреча → 404) — зелёный.
3. Typecheck и тесты зелёные.

## 4. Порядок сдачи

- PR из `feature/wp-api-projects-01-projects-context` в `main`; не мержить.
- Тело PR = отчёт разработки + `Deviations` (чем результат отличается от пакета и почему).
- Затем сообщение `product-coord`: `[PRODUCT] READY WP-API-PROJECTS-01 :: <sha> :: ref=<PR URL>`.

## 5. Start prompt

```text
Прочитай /home/cloudpc/projects/transcriber-orch/docs/orchestration/product/work-packages/WP-API-PROJECTS-01-projects-context.md и выполни. Сначала раздел 0 (подготовка worktree). Ветка feature/wp-api-projects-01-projects-context от origin/main, PR в main, не мержить. По готовности — сообщение product-coord: [PRODUCT] READY WP-API-PROJECTS-01 :: <sha> :: ref=<PR URL>

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
cd /home/cloudpc/projects/transcriber && claude -w wp-api-projects-01-projects-context --model sonnet --name product-api-projects "Прочитай /home/cloudpc/projects/transcriber-orch/docs/orchestration/product/work-packages/WP-API-PROJECTS-01-projects-context.md и выполни. Сначала раздел 0 (подготовка worktree). Ветка feature/wp-api-projects-01-projects-context от origin/main, PR в main, не мержить. По готовности — сообщение product-coord: [PRODUCT] READY WP-API-PROJECTS-01 :: <sha> :: ref=<PR URL>

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
- Пришли `product-coord`: `[PRODUCT] QUESTION WP-API-PROJECTS-01 :: отказ: <точный текст отказа> :: ref=<команда>`; продолжай работу, которой это не нужно, или жди `ANSWER`.
- Ресурсы по запросу (`graph`, `dev-stack`): перед использованием пришли `product-coord`: `[PRODUCT] LOCK WP-API-PROJECTS-01 :: <ресурс> :: ref=<зачем>` и жди `ACK`; как только закончишь — `[PRODUCT] UNLOCK WP-API-PROJECTS-01 :: <ресурс> :: ref=<результат>`. READY возвращает все замки по запросу.

## Пересдачи

<Циклы REVISE: дата, пункты, коммит.>
