# WP-BACKEND-06 — Контракт программы: схема БД, контракты shared, зависимости

| Поле | Значение |
|------|----------|
| Поток | backend (area) |
| Репозиторий | . |
| Базовая ветка | main |
| Линия | main |
| Рабочая ветка | `feature/wp-backend-06-contract` |
| Worktree | `.claude/worktrees/wp-backend-06-contract` (создаёт `claude -w wp-backend-06-contract`) |
| Заголовок PR | `[PRODUCT] WP-BACKEND-06: Контракт программы: схема БД, контракты shared, зависимости` |
| Сессия | `product-backend` |
| Модель | `opus` |
| Усилие | `high` |
| Почему такая модель | контракт всей программы: схема БД с бэкфиллами на проде, общие типы для 10 пакетов, автоподключение |
| Режим | nacl, spec-first: `/nacl-sa-feature` — доменная модель всей программы (FR-003 вход/пространства, FR-004 проекты/контекст, FR-005 версии/отзывы, FR-006 память проекта: сущности, атрибуты, enum) под замком `graph`; затем `/nacl-tl-dev` (TECH: схема, контракты, автоподключение), `/nacl-tl-review` |
| Команды методологии: разрешены | nacl: `nacl-tl-dev-be`, `nacl-tl-dev`, `nacl-tl-fix`, `nacl-tl-review`, `nacl-tl-regression-test`, `nacl-tl-verify-code`, `nacl-tl-sync`, `nacl-tl-docs`, `nacl-tl-stubs`, `nacl-sa-uc`, `nacl-sa-domain`, `nacl-sa-feature`, `nacl-sa-validate`, `nacl-tl-plan`, `nacl-tl-status` |
| Команды методологии: запрещены | `nacl-tl-release`, `nacl-tl-deploy`, `nacl-tl-deliver`, `nacl-tl-hotfix`, `nacl-tl-ship`, `nacl-tl-conductor`, `nacl-tl-full`, `nacl-goal`, `nacl-publish` |
| Разрешённые пути | пути потока backend (orch.yaml) + api/src/features/index.ts (реестр фич); остальное — только объявленные общие пути |
| Общие пути, которые трогает пакет | `api/prisma/**`, `shared/**`, `package.json`, `api/package.json`, `worker/package.json`, `web/package.json`, `shared/package.json`, `pnpm-lock.yaml`, `api/src/server.ts`, `worker/src/job-processor.ts`, `worker/src/queues.ts`, `worker/src/index.ts`, `.tl/**` |
| Миграции | да, одна: `*_program_product_schema` (новее `20260814120000_*`), строго аддитивная и совместимая со старым кодом, который работает во время `migrate deploy` |
| Ресурсы (замки) | `migrations`, `graph` по запросу |
| Тестовая БД и порты | нет; нет |
| Слот слияния | <место в очереди слияний, задаётся при приёмке> |
| Контракт | создаёт контракт программы v1 (`shared/src/api/{auth,workspace,project,context,feedback,memory}.ts`, расширения `IAsrProvider`/`ILlmProvider`, интерфейс `ProjectMemoryProvider`), который читают все остальные пакеты |
| Зависит от | нет |
| Размер | L |
| Спецификация | FR-003, FR-004, FR-005, FR-006 (новые); NFR-007, RQ-003 |
| Граф | DomainEntity: User, Workspace, Membership, AuthSession, LoginBlock, Project, ProjectParticipant, GlossaryTerm, MeetingContext, ProtocolGeneration, ProtocolVersion, ProtocolFeedback, GraphOutbox; память проекта (Task, Decision, TaskEvent, ProjectMemory) — как сущности графа памяти; enum |
| Решения | D-3, D-4, D-6..D-15 |

Общие пути этого репозитория (объяви те, что трогает пакет): `pnpm-lock.yaml`, `package.json`, `**/package.json`, `shared/**`, `api/prisma/**`, `.tl/**`, `graph-infra/**`, `config.yaml`, `CLAUDE.md`, `api/src/server.ts`, `worker/src/index.ts`, `worker/src/job-processor.ts`, `worker/src/queues.ts`, `web/src/App.tsx`, `web/src/i18n/**`.
Ресурсы этого репозитория, требующие замка: `migrations`, `graph` (по запросу: LOCK/UNLOCK, см. раздел 6), `dev-stack` (по запросу: LOCK/UNLOCK, см. раздел 6).

## 0. Подготовка worktree

1. Переключи worktree на ветку пакета: `git fetch origin && git switch -c feature/wp-backend-06-contract origin/main`.
2. Подготовь worktree (команды из `orch.yaml`, выполнять внутри worktree):

   ```bash
   pnpm install --frozen-lockfile
   pnpm --filter @transcrib/api run db:generate
   ```
3. Правь только разрешённые пути; общие пути — только объявленные в шапке и после получения замка.

## 1. Факты

- D-15: параллельная работа потоков возможна, только если общие файлы (схема Prisma, `shared/`, `package.json`/lockfile, регистрация маршрутов и очередей) меняет один пакет, первым.
- Схема сейчас: `api/prisma/schema.prisma:14-155` (Meeting без владельца, Protocol с перезаписью); 5 миграций, применяются до рестарта pm2 (`.github/workflows/deploy-production.yml:57-58`) — старый код работает на новой схеме, пока не перезапущен.
- Маршруты регистрируются вручную в `api/src/server.ts:55-76`; воркеры — в `worker/src/job-processor.ts:65` (`createWorkers`), очереди — `worker/src/queues.ts`.
- `IAsrProvider` `shared/src/asr/IAsrProvider.ts:17-39`; `ILlmProvider` `shared/src/llm/ILlmProvider.ts:14-16`.
- Merge в main = прод (D-3): пакет обязан не менять поведение прода.

## 2. Объём

1. Prisma (все таблицы Postgres программы):
   - `User(id, name, pinLookup unique, pinHash, createdAt)`, `Workspace(id, name, personal)`, `Membership(userId, workspaceId, unique)`, `AuthSession(id, userId, tokenHash unique, expiresAt, lastSeenAt)`, `LoginBlock(clientKey unique, failedCount, blockedAt?)`.
   - `Meeting.workspaceId` **nullable** + бэкфилл: создать пространство «Роман» (personal) и записать его id во все существующие встречи (D-7). NOT NULL ставит WP-BACKEND-01. `Meeting.projectId?`. Новое значение `MeetingStatus.AWAITING_START` (старым кодом не используется).
   - `Project(workspaceId, name, description)`, `ProjectParticipant(projectId, name, aliases[], role?, organization?, side enum OURS|CLIENT|CONTRACTOR|OTHER)`, `GlossaryTerm(projectId, term, variants[], definition?, asrKeyterm bool)`.
   - `MeetingContext(meetingId unique, meetingType enum NEGOTIATION|STATUS|PLANNING|INTERVIEW|OTHER?, goal?, agenda?, participants JSONB, glossary JSONB, previousProtocol JSONB {source project|upload|none, meetingId?, text?}, notes?, snapshotHash, createdAt)`.
   - `ProtocolGeneration(meetingId, kind PROTOCOL|MEMORY_EXTRACT|MEMORY_RESOLVE|MEMORY_SUMMARY, model, promptVersion, contextSnapshotHash?, keyterms[], asrOptions JSONB?, inputTokens?, outputTokens?, promptUri?, createdAt)`.
   - `ProtocolVersion(meetingId, n, kind GENERATED|USER_EDIT|LEGACY, markdown, authorUserId?, generationId?, createdAt; unique(meetingId,n))` + бэкфилл: каждый существующий `Protocol` → версия 1 (`LEGACY`, если editCount>0, иначе `GENERATED`).
   - `ProtocolFeedback(meetingId, workspaceId, userId, protocolVersionN, kind COMMENT|CORRECTED_PROTOCOL|DOCX_REVIEW, category enum?, text?, fileUri?, fileName?, mime?, sizeBytes?, extracted JSONB?, createdAt)`.
   - `GraphOutbox(id, op, payload JSONB, attempts, lastError?, createdAt, doneAt?)`.
2. `shared/`: Zod-схемы запросов/ответов всех новых эндпоинтов программы (вход/`me`/выход; пространства; список встреч по пространству; проекты, участники, глоссарий; контекст встречи; `complete` с необязательным `deferStart`; `POST /api/meetings/:id/start`; версии протокола; отзывы (multipart-метаданные); память проекта: задачи, решения, события, очередь подтверждений, сводка). Тексты ошибок, включая «Больше нельзя, пиши Максу для разблокировки». `AudioInput.keyterms?: string[]`; вход `ILlmProvider` с секциями контекста; интерфейс `ProjectMemoryProvider { getPromptMemory(projectId, workspaceId): Promise<string|null> }` + реальная реализация «памяти нет» (возвращает null).
3. Зависимости программы — все сразу: `@fastify/cookie`, `@fastify/multipart` (api), `jszip`, `fast-xml-parser` (api), `neo4j-driver` (shared — слой доступа к графу появится в WP-WORKER-MEMORY-01).
4. Автоподключение, чтобы параллельные пакеты не правили общие файлы: `api/src/server.ts` регистрирует все существующие маршруты и, дополнительно, модули `api/src/features/*/routes.ts` (через явный реестр `api/src/features/index.ts`, который генерируется/собирается import-glob или перечисляет папки — выбрать, чтобы новая папка подключалась без правки server.ts); то же для воркера: `worker/src/index.ts` подключает модуль `worker/src/memory/index.ts` (функция `register(ctx)`: свои очереди, воркеры, слушатели событий), если он есть; очереди новых модулей объявляются в самих модулях.
5. Поведение прода не меняется: все существующие тесты зелёные без правок ожиданий; новые таблицы пусты, кроме бэкфиллов.
5a. Документация общих путей за все потоки, чтобы они не правили `.tl/` общие файлы: ADR-013 (Neo4j для памяти проекта, D-13), `.tl/external-contracts/neo4j.md`, раздел «Neo4j памяти проекта» в `.tl/deploy-plan.md` (ссылка на `scripts/README-neo4j.md` из WP-INFRA-01).
5b. Спецификация всех фич программы в графе (`/nacl-sa-feature` FR-003..FR-006: сущности, UC, правила), чтобы параллельные пакеты только уточняли свои UC, а не создавали доменную модель одновременно.
6. Не делать: логику входа, проверки доступа, эндпоинты (только схемы), UI.

### Не входит

- merge, деплой, PROD, запись в БД
- другие модули и рабочее пространство оркестратора
- файлы вне разрешённых путей; общие пути, не объявленные выше
- подъём версий и release notes, если не перечислены выше

## 3. Критерии приёмки

1. `prisma migrate deploy` на БД с существующими встречами и протоколами: встречи получили workspaceId «Роман», протоколы — версию 1; CI-джоба миграций зелёная.
2. Старый код (main до пакета) работает на новой схеме: тест или ручной прогон upload→meeting на мигрированной БД (описать в PR).
3. Все существующие тесты api/worker/web/shared зелёные без изменения ожиданий; `pnpm -r typecheck` зелёный.
4. Тест автоподключения: временная папка-фича с маршрутом подключается без правки `server.ts`; то же для воркера.
5. Zod-схемы покрыты тестами разбора (валидный/невалидный PIN, контекст, отзыв).
6. В PR — список всех контрактов для пакетов-потребителей.

## 4. Порядок сдачи

- PR из `feature/wp-backend-06-contract` в `main`; не мержить.
- Тело PR = отчёт разработки + `Deviations` (чем результат отличается от пакета и почему).
- Затем сообщение `product-coord`: `[PRODUCT] READY WP-BACKEND-06 :: <sha> :: ref=<PR URL>`.

## 5. Start prompt

```text
Прочитай /home/cloudpc/projects/transcriber-orch/docs/orchestration/product/work-packages/WP-BACKEND-06-contract.md и выполни. Сначала раздел 0 (подготовка worktree). Ветка feature/wp-backend-06-contract от origin/main, PR в main, не мержить. По готовности — сообщение product-coord: [PRODUCT] READY WP-BACKEND-06 :: <sha> :: ref=<PR URL>

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
cd /home/cloudpc/projects/transcriber && claude -w wp-backend-06-contract --model opus --effort high --name product-backend "Прочитай /home/cloudpc/projects/transcriber-orch/docs/orchestration/product/work-packages/WP-BACKEND-06-contract.md и выполни. Сначала раздел 0 (подготовка worktree). Ветка feature/wp-backend-06-contract от origin/main, PR в main, не мержить. По готовности — сообщение product-coord: [PRODUCT] READY WP-BACKEND-06 :: <sha> :: ref=<PR URL>

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
- Пришли `product-coord`: `[PRODUCT] QUESTION WP-BACKEND-06 :: отказ: <точный текст отказа> :: ref=<команда>`; продолжай работу, которой это не нужно, или жди `ANSWER`.
- Ресурсы по запросу (`graph`, `dev-stack`): перед использованием пришли `product-coord`: `[PRODUCT] LOCK WP-BACKEND-06 :: <ресурс> :: ref=<зачем>` и жди `ACK`; как только закончишь — `[PRODUCT] UNLOCK WP-BACKEND-06 :: <ресурс> :: ref=<результат>`. READY возвращает все замки по запросу.

## Пересдачи

<Циклы REVISE: дата, пункты, коммит.>
