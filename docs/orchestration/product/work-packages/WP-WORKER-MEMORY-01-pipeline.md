# WP-WORKER-MEMORY-01 — Память проекта в Neo4j: слой графа, извлечение, сопоставление, сводка

| Поле | Значение |
|------|----------|
| Поток | worker-memory (area) |
| Репозиторий | . |
| Базовая ветка | main |
| Линия | main |
| Рабочая ветка | `feature/wp-worker-memory-01-pipeline` |
| Worktree | `.claude/worktrees/wp-worker-memory-01-pipeline` (создаёт `claude -w wp-worker-memory-01-pipeline`) |
| Заголовок PR | `[PRODUCT] WP-WORKER-MEMORY-01: Память проекта в Neo4j: слой графа, извлечение, сопоставление, сводка` |
| Сессия | `product-worker-memory` |
| Модель | `opus` |
| Усилие | `high` |
| Почему такая модель | многошаговый LLM-пайплайн, сопоставление задач между встречами, машина статусов, второе хранилище |
| Режим | nacl, spec-first: `/nacl-sa-feature` (системный UC «обновление памяти проекта», правила D-14) под замком `graph`, затем `/nacl-tl-dev-be` по TDD, `/nacl-tl-review --be` |
| Команды методологии: разрешены | nacl: `nacl-tl-dev-be`, `nacl-tl-dev`, `nacl-tl-fix`, `nacl-tl-review`, `nacl-tl-regression-test`, `nacl-tl-verify-code`, `nacl-tl-sync`, `nacl-tl-docs`, `nacl-tl-stubs`, `nacl-sa-uc`, `nacl-sa-domain`, `nacl-sa-feature`, `nacl-sa-validate`, `nacl-tl-plan`, `nacl-tl-status` |
| Команды методологии: запрещены | `nacl-tl-release`, `nacl-tl-deploy`, `nacl-tl-deliver`, `nacl-tl-hotfix`, `nacl-tl-ship`, `nacl-tl-conductor`, `nacl-tl-full`, `nacl-goal`, `nacl-publish` |
| Разрешённые пути | `worker/src/{memory,graph}/**` |
| Общие пути, которые трогает пакет | `shared/**` (только новая папка shared/src/memory/ — слой доступа к графу для worker и api), `worker/package.json` (скрипт graph:migrate; новых зависимостей нет — neo4j-driver добавляет WP-BACKEND-06) |
| Миграции | нет миграций Postgres; миграции графа — идемпотентные Cypher (constraints/индексы), версия в узле `:SchemaVersion`, команда `graph:migrate` |
| Ресурсы (замки) | `graph` по запросу (граф спецификаций), `dev-stack` по запросу |
| Тестовая БД и порты | нет; нет |
| Слот слияния | после WP-INFRA-01 (CI с Neo4j, в main) и WP-WORKER-01 (слот <project_memory>) |
| Контракт | DTO памяти из WP-BACKEND-06; создаёт `shared/src/memory/` (запросы к графу) для WP-API-MEMORY-01; реализует `ProjectMemoryProvider` |
| Зависит от | WP-BACKEND-06 (в main) |
| Размер | L |
| Спецификация | FR-006; UC-300 |
| Граф | системный UC памяти проекта; сущности графа памяти — через `/nacl-sa-feature` |
| Решения | D-11, D-13, D-14, D-15; Q-3 (`reports/research-2026-10-07-project-memory.md`) |

Общие пути этого репозитория (объяви те, что трогает пакет): `pnpm-lock.yaml`, `package.json`, `**/package.json`, `shared/**`, `api/prisma/**`, `.tl/**`, `graph-infra/**`, `config.yaml`, `CLAUDE.md`, `api/src/server.ts`, `worker/src/index.ts`, `worker/src/job-processor.ts`, `worker/src/queues.ts`, `web/src/App.tsx`, `web/src/i18n/**`.
Ресурсы этого репозитория, требующие замка: `migrations`, `graph` (по запросу: LOCK/UNLOCK, см. раздел 6), `dev-stack` (по запросу: LOCK/UNLOCK, см. раздел 6).

## 0. Подготовка worktree

1. Переключи worktree на ветку пакета: `git fetch origin && git switch -c feature/wp-worker-memory-01-pipeline origin/main`.
2. Подготовь worktree (команды из `orch.yaml`, выполнять внутри worktree):

   ```bash
   pnpm install --frozen-lockfile
   pnpm --filter @transcrib/api run db:generate
   ```
3. Правь только разрешённые пути; общие пути — только объявленные в шапке и после получения замка.

## 1. Факты

- D-11: после каждого протокола автоматически обновлять сводку проекта и реестр задач/решений, переносить открытые задачи; D-13: хранить в Neo4j на проде; D-14: закрытие, отмена, слияние, смена исполнителя и неуверенные изменения — на подтверждение.
- Исследование Q-3: рынок переносит открытые задачи и даёт человеку подтвердить статус (Fellow); извлекать из транскрипта, не из саммари; каждое изменение — с проверяемой цитатой; «не упомянута» = без изменений.
- Сегменты с таймкодами и спикерами — `Transcript.segmentsBlob` (`api/prisma/schema.prisma:101-120`); по ним проверяются цитаты.
- Сейчас один вызов LLM на встречу без структурированного вывода (`worker/src/llm/kieai.ts:190-197`).
- Автоподключение модуля `worker/src/memory/index.ts` (`register(ctx)`) делает WP-BACKEND-06; `GraphOutbox` пишет ядро API при удалении встречи (WP-BACKEND-01).

## 2. Объём

Postgres — источник пространств, проектов, встреч, протоколов; Neo4j — память проекта (D-13). Узлы `:Project`, `:Meeting`, `:Participant` в графе — проекции с теми же id и обязательными `workspaceId`, `projectId`.
1. `worker/src/graph/`: драйвер (env `MEMORY_NEO4J_*`), сессии, закрытие при остановке, health; раннер миграций графа и скрипт `graph:migrate` (идемпотентный; при отсутствии URI — выход 0 с предупреждением).
2. `shared/src/memory/`: слой запросов к графу — **каждый** запрос параметризован `workspaceId` и `projectId` (помощник не даёт выполнить запрос без них; тест).
3. Модель графа: `(:Task {id, code T-n, title, description, status open|in_progress|done|cancelled|postponed, dueDate, mergedInto})`, `(:Decision {id, code D-n, text, supersededBy})`, `(:ProjectMemory {version, summaryMd})`-`[:OF_PROJECT]`/`[:PREVIOUS]`; рёбра `(:Task)-[:MENTIONED_IN {quote, startMs, endMs, speakerLabel, kind CREATED|STATUS_UPDATE|REASSIGNED|DUE_CHANGED|MENTIONED}]->(:Meeting)`, `(:TaskEvent {field, oldValue, newValue, validAt, recordedAt, supersededAt, source LLM|USER, confidence, reason, reviewState AUTO|PENDING|CONFIRMED|REJECTED})` с `OF_TASK`/`IN_MEETING`, `ASSIGNED_TO`, `DEPENDS_ON`, `DUPLICATE_OF`, `SUPERSEDES`, `SUBTASK_OF`, `(:Decision)-[:MENTIONED_IN]->(:Meeting)`, `(:Decision)-[:LEADS_TO]->(:Task)`. Текущее состояние задачи = применённые события; переходы статусов проверяет код. Запись одной встречи — одной транзакцией Neo4j.
4. Модуль `worker/src/memory/` (`register(ctx)`): своя очередь `project-memory`; слушатель завершения генерации протокола ставит задание для встреч с `projectId`. Пайплайн: Extract по транскрипту (structured JSON: задачи и решения с дословной цитатой, таймкодом, спикером) → проверка цитат по сегментам (нечётко; не найдена — отброс с логом) → кандидаты: все открытые задачи проекта (при > 200 — лексический префильтр) → Resolve (NEW|UPDATE|CLOSE|DUPLICATE|NO_CHANGE, targetTaskCode, changes, quoteRef, confidence, reason) → Gate (D-14: NEW, MENTIONED, уверенные UPDATE — AUTO; закрытие, отмена, слияние, смена исполнителя, confidence ниже порога — PENDING) → новая версия сводки (предыдущая + протокол + применённые изменения).
5. Каждый вызов LLM — через `ILlmProvider` с записью `ProtocolGeneration(kind MEMORY_*)`.
6. Сбой памяти не меняет статус встречи и протокола; ретраи как в FR-001; ошибка видна (статус задания).
7. `ProjectMemoryProvider` на Neo4j: сводка + открытые задачи с кодами (`T-42 | Отправить договор | Иванов | до 15.10 | open с встречи 3`) + последние решения, ≤ ~5 тыс. токенов; регистрируется в `register(ctx)` вместо реализации «памяти нет».
8. Потребитель `GraphOutbox`: применяет удаления к графу с ретраями (DETACH DELETE встречи, её упоминаний и событий; задачи, созданные только в ней, — тоже).
9. Не делать: API и UI памяти, векторные индексы, визуализацию.

### Не входит

- merge, деплой, PROD, запись в БД
- другие модули и рабочее пространство оркестратора
- файлы вне разрешённых путей; общие пути, не объявленные выше
- подъём версий и release notes, если не перечислены выше

## 3. Критерии приёмки

1. Фикстура из двух встреч проекта: встреча 1 создаёт T-1, T-2, D-1; встреча 2 с явной фразой «договор отправил» → событие закрытия T-1 в PENDING, T-1 остаётся open; T-2 без упоминания — без событий.
2. Пункт с цитатой, которой нет в транскрипте, отброшен; Resolve с несуществующим `targetTaskCode` отклоняется валидатором.
3. Промпт протокола встречи 2 получает `<project_memory>` с T-1, T-2 и кодами (через провайдер).
4. Запрос слоя графа без `workspaceId` невозможен (тест); чужой `workspaceId` возвращает пусто.
5. Outbox: удаление встречи при недоступном Neo4j → операция ждёт → после восстановления узлы удалены.
6. `graph:migrate` дважды — второй без изменений. Интеграционные тесты на Neo4j (CI-сервис из WP-INFRA-01 или локальный контейнер); typecheck и тесты зелёные.

## 4. Порядок сдачи

- PR из `feature/wp-worker-memory-01-pipeline` в `main`; не мержить.
- Тело PR = отчёт разработки + `Deviations` (чем результат отличается от пакета и почему).
- Затем сообщение `product-coord`: `[PRODUCT] READY WP-WORKER-MEMORY-01 :: <sha> :: ref=<PR URL>`.

## 5. Start prompt

```text
Прочитай /home/cloudpc/projects/transcriber-orch/docs/orchestration/product/work-packages/WP-WORKER-MEMORY-01-pipeline.md и выполни. Сначала раздел 0 (подготовка worktree). Ветка feature/wp-worker-memory-01-pipeline от origin/main, PR в main, не мержить. По готовности — сообщение product-coord: [PRODUCT] READY WP-WORKER-MEMORY-01 :: <sha> :: ref=<PR URL>

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
cd /home/cloudpc/projects/transcriber && claude -w wp-worker-memory-01-pipeline --model opus --effort high --name product-worker-memory "Прочитай /home/cloudpc/projects/transcriber-orch/docs/orchestration/product/work-packages/WP-WORKER-MEMORY-01-pipeline.md и выполни. Сначала раздел 0 (подготовка worktree). Ветка feature/wp-worker-memory-01-pipeline от origin/main, PR в main, не мержить. По готовности — сообщение product-coord: [PRODUCT] READY WP-WORKER-MEMORY-01 :: <sha> :: ref=<PR URL>

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
- Пришли `product-coord`: `[PRODUCT] QUESTION WP-WORKER-MEMORY-01 :: отказ: <точный текст отказа> :: ref=<команда>`; продолжай работу, которой это не нужно, или жди `ANSWER`.
- Ресурсы по запросу (`graph`, `dev-stack`): перед использованием пришли `product-coord`: `[PRODUCT] LOCK WP-WORKER-MEMORY-01 :: <ресурс> :: ref=<зачем>` и жди `ACK`; как только закончишь — `[PRODUCT] UNLOCK WP-WORKER-MEMORY-01 :: <ресурс> :: ref=<результат>`. READY возвращает все замки по запросу.

## Пересдачи

<Циклы REVISE: дата, пункты, коммит.>
