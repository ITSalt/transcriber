# WP-API-MEMORY-01 — API памяти проекта: задачи, решения, подтверждения

| Поле | Значение |
|------|----------|
| Поток | api-memory (area) |
| Репозиторий | . |
| Базовая ветка | main |
| Линия | main |
| Рабочая ветка | `feature/wp-api-memory-01-registry` |
| Worktree | `.claude/worktrees/wp-api-memory-01-registry` (создаёт `claude -w wp-api-memory-01-registry`) |
| Заголовок PR | `[PRODUCT] WP-API-MEMORY-01: API памяти проекта: задачи, решения, подтверждения` |
| Сессия | `product-api-memory` |
| Модель | `sonnet` |
| Усилие | — |
| Почему такая модель | модель реализатора по умолчанию (orch.yaml models.implement) |
| Режим | nacl, spec-first: `/nacl-sa-feature` (UC фичи) под замком `graph`, затем `/nacl-tl-dev-be` по TDD, `/nacl-tl-review --be` |
| Команды методологии: разрешены | nacl: `nacl-tl-dev-be`, `nacl-tl-dev`, `nacl-tl-fix`, `nacl-tl-review`, `nacl-tl-regression-test`, `nacl-tl-verify-code`, `nacl-tl-sync`, `nacl-tl-docs`, `nacl-tl-stubs`, `nacl-sa-uc`, `nacl-sa-domain`, `nacl-sa-feature`, `nacl-sa-validate`, `nacl-tl-plan`, `nacl-tl-status` |
| Команды методологии: запрещены | `nacl-tl-release`, `nacl-tl-deploy`, `nacl-tl-deliver`, `nacl-tl-hotfix`, `nacl-tl-ship`, `nacl-tl-conductor`, `nacl-tl-full`, `nacl-goal`, `nacl-publish` |
| Разрешённые пути | `api/src/features/memory/**` |
| Общие пути, которые трогает пакет | нет (маршруты подключаются автоматически из api/src/features/<фича>/routes.ts через реестр WP-BACKEND-06) |
| Миграции | нет |
| Ресурсы (замки) | `graph` по запросу |
| Тестовая БД и порты | нет; нет |
| Слот слияния | <место в очереди слияний, задаётся при приёмке> |
| Контракт | реализует контракт memory v1 из WP-BACKEND-06: `GET /api/projects/:id/tasks?status=&assignee=`, `GET /api/projects/:id/tasks/:code` (история), `GET /api/projects/:id/decisions`, `GET /api/projects/:id/memory` (сводка + версии), `GET /api/projects/:id/review-queue`, `POST /api/task-events/:id/confirm|reject`, `PATCH /api/projects/:id/tasks/:code` (ручная правка, source USER) |
| Зависит от | WP-BACKEND-01 и WP-WORKER-MEMORY-01 (в main: слой `shared/src/memory/`) |
| Размер | M |
| Спецификация | FR-006 |
| Граф | UC реестра — через `/nacl-sa-feature` |
| Решения | D-11, D-13, D-14, D-15 |

Общие пути этого репозитория (объяви те, что трогает пакет): `pnpm-lock.yaml`, `package.json`, `**/package.json`, `shared/**`, `api/prisma/**`, `.tl/**`, `graph-infra/**`, `config.yaml`, `CLAUDE.md`, `api/src/server.ts`, `worker/src/index.ts`, `worker/src/job-processor.ts`, `worker/src/queues.ts`, `web/src/App.tsx`, `web/src/i18n/**`.
Ресурсы этого репозитория, требующие замка: `migrations`, `graph` (по запросу: LOCK/UNLOCK, см. раздел 6), `dev-stack` (по запросу: LOCK/UNLOCK, см. раздел 6).

## 0. Подготовка worktree

1. Переключи worktree на ветку пакета: `git fetch origin && git switch -c feature/wp-api-memory-01-registry origin/main`.
2. Подготовь worktree (команды из `orch.yaml`, выполнять внутри worktree):

   ```bash
   pnpm install --frozen-lockfile
   pnpm --filter @transcrib/api run db:generate
   ```
3. Правь только разрешённые пути; общие пути — только объявленные в шапке и после получения замка.

## 1. Факты

- Граф памяти и слой запросов `shared/src/memory/` (каждый запрос с `workspaceId`, `projectId`) создаёт WP-WORKER-MEMORY-01.
- D-14: подтверждение/отклонение PENDING-событий — пользователем.

## 2. Объём

1. Чтение реестра через `shared/src/memory/` после `assertWorkspaceAccess` по проекту в Postgres.
2. Подтверждение/отклонение PENDING-события: подтверждение применяет изменение к задаче, отклонение — нет; история сохраняется; повтор → 409.
3. Ручная правка задачи (статус, исполнитель, срок) — событие `source USER`, переходы проверяет тот же код, что в воркере (общая функция в `shared/src/memory/`, только чтение — если её нет, `QUESTION`).
4. Недоступность Neo4j → 503 с понятной ошибкой, остальное приложение работает.
5. Не делать: UI, изменения пайплайна.

8. Обновление контракта графа `.tl/external-contracts/neo4j.md` (объявить общий путь `.tl/external-contracts/neo4j.md` и замок): по отчёту ревью WP-WORKER-MEMORY-01 (reports/wp-worker-memory-01-review-20261007.md, Q9) — дополнения модели (Project.{taskSeq,decisionSeq,meetingSeq}; Meeting{seq,title,occurredAt}/Participant{name} -[:OF_PROJECT]->; поля Task/Decision/TaskEvent; Decision-[:MENTIONED_IN {startMs,endMs,speakerLabel}]; служебные Tombstone и SchemaVersion; USER-события как reviewState CONFIRMED), пометка, что DEPENDS_ON/SUBTASK_OF в v1 не производятся. Продюсер GraphOutbox для удаления проекта — в этом пакете (DELETE /api/projects/:id пишет строку outbox в той же транзакции, контракт §6); для удаления встречи — проверить, что BACKEND-01 (uc-003) это делает, иначе добавить здесь.

### Не входит

- merge, деплой, PROD, запись в БД
- другие модули и рабочее пространство оркестратора
- файлы вне разрешённых путей; общие пути, не объявленные выше
- подъём версий и release notes, если не перечислены выше

## 3. Критерии приёмки

1. Тесты на Neo4j (CI-сервис): списки, история задачи, подтверждение/отклонение, ручная правка, недопустимый переход → 400.
2. Тест изоляции WP-BACKEND-01 зелёный с новыми маршрутами; запрос к чужому проекту → 404.
3. Typecheck и тесты зелёные.

## 4. Порядок сдачи

- PR из `feature/wp-api-memory-01-registry` в `main`; не мержить.
- Тело PR = отчёт разработки + `Deviations` (чем результат отличается от пакета и почему).
- Затем сообщение `product-coord`: `[PRODUCT] READY WP-API-MEMORY-01 :: <sha> :: ref=<PR URL>`.

## 5. Start prompt

```text
Прочитай /home/cloudpc/projects/transcriber-orch/docs/orchestration/product/work-packages/WP-API-MEMORY-01-registry.md и выполни. Сначала раздел 0 (подготовка worktree). Ветка feature/wp-api-memory-01-registry от origin/main, PR в main, не мержить. По готовности — сообщение product-coord: [PRODUCT] READY WP-API-MEMORY-01 :: <sha> :: ref=<PR URL>

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
cd /home/cloudpc/projects/transcriber && claude -w wp-api-memory-01-registry --model sonnet --name product-api-memory "Прочитай /home/cloudpc/projects/transcriber-orch/docs/orchestration/product/work-packages/WP-API-MEMORY-01-registry.md и выполни. Сначала раздел 0 (подготовка worktree). Ветка feature/wp-api-memory-01-registry от origin/main, PR в main, не мержить. По готовности — сообщение product-coord: [PRODUCT] READY WP-API-MEMORY-01 :: <sha> :: ref=<PR URL>

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
- Пришли `product-coord`: `[PRODUCT] QUESTION WP-API-MEMORY-01 :: отказ: <точный текст отказа> :: ref=<команда>`; продолжай работу, которой это не нужно, или жди `ANSWER`.
- Ресурсы по запросу (`graph`, `dev-stack`): перед использованием пришли `product-coord`: `[PRODUCT] LOCK WP-API-MEMORY-01 :: <ресурс> :: ref=<зачем>` и жди `ACK`; как только закончишь — `[PRODUCT] UNLOCK WP-API-MEMORY-01 :: <ресурс> :: ref=<результат>`. READY возвращает все замки по запросу.

## Пересдачи

<Циклы REVISE: дата, пункты, коммит.>
