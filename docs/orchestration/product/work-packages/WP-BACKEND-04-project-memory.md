# WP-BACKEND-04 — Память проекта: граф задач и решений, сводка, перенос между встречами

| Поле | Значение |
|------|----------|
| Поток | backend (area) |
| Репозиторий | . |
| Базовая ветка | main |
| Линия | main |
| Рабочая ветка | `feature/wp-backend-04-project-memory` |
| Worktree | `.claude/worktrees/wp-backend-04-project-memory` (создаёт `claude -w wp-backend-04-project-memory`) |
| Заголовок PR | `[PRODUCT] WP-BACKEND-04: Память проекта: граф задач и решений, сводка, перенос между встречами` |
| Сессия | `product-backend` |
| Модель | `opus` |
| Усилие | `high` |
| Почему такая модель | многошаговый LLM-пайплайн, сопоставление сущностей между встречами, машина статусов, миграция |
| Режим | nacl, spec-first: `/nacl-sa-feature` (FR-006: память проекта; сущности Task/Decision/ProjectMemory и рёбра; UC «обновление памяти проекта» — системный), затем `/nacl-tl-dev-be` по TDD, `/nacl-tl-review --be` |
| Команды методологии: разрешены | nacl: `nacl-tl-dev-be`, `nacl-tl-dev`, `nacl-tl-fix`, `nacl-tl-review`, `nacl-tl-regression-test`, `nacl-tl-verify-code`, `nacl-tl-sync`, `nacl-tl-docs`, `nacl-tl-stubs`, `nacl-sa-uc`, `nacl-sa-domain`, `nacl-sa-feature`, `nacl-sa-validate`, `nacl-tl-plan`, `nacl-tl-status` |
| Команды методологии: запрещены | `nacl-tl-release`, `nacl-tl-deploy`, `nacl-tl-deliver`, `nacl-tl-hotfix`, `nacl-tl-ship`, `nacl-tl-conductor`, `nacl-tl-full`, `nacl-goal`, `nacl-publish` |
| Разрешённые пути | `api/**`, `worker/**` |
| Общие пути, которые трогает пакет | `shared/**` (Zod-схемы реестра, структурированный вывод LLM), `api/prisma/**`, `.tl/**`; при P-11 ≠ (a) — также `docker-compose.yml`, `ecosystem.config.cjs`, деплой (тогда пакет пересматривается) |
| Миграции | да: `*_project_memory` — новые таблицы, без бэкфилла (память копится с первой встречи после релиза) |
| Ресурсы (замки) | `migrations`, `graph` по запросу |
| Тестовая БД и порты | нет; нет |
| Слот слияния | <место в очереди слияний, задаётся при приёмке> |
| Контракт | shared project-memory v1 для WP-FRONTEND-05: `GET /api/projects/:id/tasks?status=`, `GET /api/projects/:id/decisions`, `GET /api/projects/:id/memory` (сводка + версии), `GET /api/projects/:id/review-queue`, `POST /api/task-events/:id/confirm|reject`, ручная правка задачи (статус/исполнитель/срок, source=USER) |
| Зависит от | WP-BACKEND-02 (проекты, слот `<project_memory>`, `ProtocolGeneration`), WP-BACKEND-03 (версии протокола) |
| Размер | L |
| Спецификация | UC-300, FR-004; FR-006 (новый) |
| Граф | через `/nacl-sa-feature`: DomainEntity Task, Decision, TaskMention, TaskEvent, TaskLink, ProjectMemory; системный UC памяти проекта |
| Решения | D-11, Q-3 (отчёт `reports/research-2026-10-07-project-memory.md`); P-11, P-12 — ждут ответа |

Общие пути этого репозитория (объяви те, что трогает пакет): `pnpm-lock.yaml`, `package.json`, `**/package.json`, `shared/**`, `api/prisma/**`, `.tl/**`, `graph-infra/**`, `config.yaml`, `CLAUDE.md`.
Ресурсы этого репозитория, требующие замка: `migrations`, `graph` (по запросу: LOCK/UNLOCK, см. раздел 6), `dev-stack` (по запросу: LOCK/UNLOCK, см. раздел 6).

## 0. Подготовка worktree

1. Переключи worktree на ветку пакета: `git fetch origin && git switch -c feature/wp-backend-04-project-memory origin/main`.
2. Подготовь worktree (команды из `orch.yaml`, выполнять внутри worktree):

   ```bash
   pnpm install --frozen-lockfile
   pnpm --filter @transcrib/api run db:generate
   ```
3. Правь только разрешённые пути; общие пути — только объявленные в шапке и после получения замка.

## 1. Факты

- Решение D-11: после каждого протокола автоматически обновлять сводку проекта и реестр задач/решений с переносом открытых задач между встречами; хранить задачи как граф.
- Исследование Q-3 (`reports/research-2026-10-07-project-memory.md`): рынок переносит открытые задачи и даёт человеку подтвердить статус (Fellow); авто-закрытия редки; извлекать из транскрипта, не из саммари; каждое изменение — с проверяемой цитатой; «не упомянута» = без изменений.
- Сегменты транскрипта с таймкодами и спикерами есть в `Transcript.segmentsBlob` (`api/prisma/schema.prisma:101-120`) — по ним проверяются цитаты.
- Сейчас один вызов LLM на встречу, без структурированного вывода (`worker/src/llm/kieai.ts:190-197`, max_tokens 4096 `:129`); `ILlmProvider` в `shared/src/llm/ILlmProvider.ts`.

## 2. Объём

Хранилище — по P-11; ниже логическая модель, одинаковая для любого варианта.
1. Узлы: `Task(projectId, shortCode T-n, title, description, status open|in_progress|done|cancelled|postponed, assigneeParticipantId?, dueDate?, createdInMeetingId, mergedIntoId?)`, `Decision(projectId, shortCode D-n, text, meetingId, supersededById?)`, `ProjectMemory(projectId, version, summaryMd, sourceMeetingId)`.
2. Рёбра: `TaskMention(taskId, meetingId, quote, startMs, endMs, speakerLabel, kind CREATED|STATUS_UPDATE|REASSIGNED|DUE_CHANGED|MENTIONED)`, `TaskEvent(taskId, meetingId?, field, oldValue, newValue, validAt, recordedAt, supersededAt?, source LLM|USER, confidence, reason, reviewState AUTO|PENDING|CONFIRMED|REJECTED, mentionId?)`, `TaskLink(fromId, toId, type DEPENDS_ON|DUPLICATE_OF|SUPERSEDES|SUBTASK_OF, evidenceMentionId?)`, `DecisionMention`, связь Decision→Task. Текущее состояние Task = применённые события; переходы статусов проверяет код.
3. Задача BullMQ `project-memory` после PROTOCOL_READY встречи с проектом (без проекта — не запускается): Extract по транскрипту (структурированный JSON: задачи и решения с дословной цитатой, таймкодом, спикером) → проверка цитат по сегментам (нечёткое совпадение; не найдена — пункт отброшен и залогирован) → кандидаты: все открытые задачи проекта (при > 200 — префильтр по сходству) → Resolve (NEW|UPDATE|CLOSE|DUPLICATE|NO_CHANGE с targetTaskCode, changes, quoteRef, confidence, reason) → Gate по P-12 → новая версия сводки (предыдущая сводка + протокол + применённые изменения).
4. Сбой задачи памяти не меняет статус встречи и протокола; ретраи как в FR-001; ошибка видна в проекте.
5. Заполнить слот `<project_memory>` промпта протокола (WP-BACKEND-02): сводка + открытые задачи с кодами (`T-42 | Отправить договор | Иванов | до 15.10 | open с встречи 3`) + последние решения; ограничение ~5 тыс. токенов.
6. Все LLM-вызовы памяти — через `ILlmProvider`, с записью в `ProtocolGeneration`-подобный журнал (модель, версия промпта, токены) — для анализа в следующей программе.
7. Изоляция по пространству (расширить тест изоляции BACKEND-01).
8. Не делать: эмбеддинги/pgvector (префильтр лексический, если понадобится), визуализацию графа, экспорт в трекеры.

### Не входит

- merge, деплой, PROD, запись в БД
- другие модули и рабочее пространство оркестратора
- файлы вне разрешённых путей; общие пути, не объявленные выше
- подъём версий и release notes, если не перечислены выше

## 3. Критерии приёмки

1. Тест на фикстуре из двух встреч одного проекта: встреча 1 создаёт T-1, T-2 и D-1; встреча 2 с явной фразой «договор отправил» даёт событие закрытия T-1 (по P-12 — PENDING или применено), T-2 без упоминания остаётся open без событий.
2. Тест: пункт с цитатой, которой нет в транскрипте, отброшен; Resolve с несуществующим targetTaskCode отклоняется валидатором.
3. Тест: протокол встречи 2 получает `<project_memory>` с T-2 и кодами.
4. Тест: подтверждение и отклонение PENDING-события меняют/не меняют текущее состояние задачи, история сохраняется.
5. Тест изоляции и typecheck/тесты зелёные; SELECT после локального прогона показывает узлы и рёбра.

## 4. Порядок сдачи

- PR из `feature/wp-backend-04-project-memory` в `main`; не мержить.
- Тело PR = отчёт разработки + `Deviations` (чем результат отличается от пакета и почему).
- Затем сообщение `product-coord`: `[PRODUCT] READY WP-BACKEND-04 :: <sha> :: ref=<PR URL>`.

## 5. Start prompt

```text
Прочитай /home/cloudpc/projects/transcriber-orch/docs/orchestration/product/work-packages/WP-BACKEND-04-project-memory.md и выполни. Сначала раздел 0 (подготовка worktree). Ветка feature/wp-backend-04-project-memory от origin/main, PR в main, не мержить. По готовности — сообщение product-coord: [PRODUCT] READY WP-BACKEND-04 :: <sha> :: ref=<PR URL>

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
cd /home/cloudpc/projects/transcriber-orch && claude -w wp-backend-04-project-memory --model opus --effort high --name product-backend "Прочитай /home/cloudpc/projects/transcriber-orch/docs/orchestration/product/work-packages/WP-BACKEND-04-project-memory.md и выполни. Сначала раздел 0 (подготовка worktree). Ветка feature/wp-backend-04-project-memory от origin/main, PR в main, не мержить. По готовности — сообщение product-coord: [PRODUCT] READY WP-BACKEND-04 :: <sha> :: ref=<PR URL>

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
- Пришли `product-coord`: `[PRODUCT] QUESTION WP-BACKEND-04 :: отказ: <точный текст отказа> :: ref=<команда>`; продолжай работу, которой это не нужно, или жди `ANSWER`.
- Ресурсы по запросу (`graph`, `dev-stack`): перед использованием пришли `product-coord`: `[PRODUCT] LOCK WP-BACKEND-04 :: <ресурс> :: ref=<зачем>` и жди `ACK`; как только закончишь — `[PRODUCT] UNLOCK WP-BACKEND-04 :: <ресурс> :: ref=<результат>`. READY возвращает все замки по запросу.

## Пересдачи

<Циклы REVISE: дата, пункты, коммит.>
