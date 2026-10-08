# Сверка — WP-API-MEMORY-01 (PR https://github.com/ITSalt/transcriber/pull/23, `fb632c5091` -> `main @ d97912108e`) — 2026-10-08

Раунд 1. Дифф: 7 files changed, 793 insertions(+), 16 deletions(-) (файлов: 7).

**Решение: `ACCEPTED WP-API-MEMORY-01`** — все 7 маршрутов контракта memory v1 + `memory-refs` (A-10) реализованы по `shared/src/api/memory.ts`; критерии 1–3 подтверждены в одноразовом клоне с одноразовыми PG16 и Neo4j (api 28 файлов / 337 тестов, `memory.neo4j.test.ts` 7/7, `auth-isolation.db.test.ts` 24/24 в строгой CI-ветке) и мутациями M1/M2/M3/M6 (красные); CI run 37777007848 pass; регрессий относительно base нет; правки вне путей — в пределах A-10; находки только Low/Info.

## Пункты REVISE

нет

### Не требуется

- Не трогать `shared/**` ради кода `MEMORY_INVALID_EVENT` (L2) — отдельный follow-up с общим путём.
- Не менять `DRIVER_CONFIG` ради таймаута 15 с (L4) — только memory-маршруты, принятый риск.

## Вопросы владельцу

нет

## Принято как есть / backlog

- Low 1: `MemoryScopeError` → 500 на `/api/task-events/*` при пустом списке workspace'ов (`graph.ts:70`, `shared/src/memory/reads.ts:193-195`); достижимо только прямой правкой БД (API/CLI отзыва членства нет); backlog: `auth.workspaceIds.length === 0 → 404` или маппинг в `guarded`.
- Low 2: английский `message` у 409 `MEMORY_INVALID_EVENT` («cannot merge T-1 into T-9») доходит до пользователя через `ReviewQueueTab.tsx:16`; backlog: код + русский текст в `shared/src/api/errors.ts` (общий путь `shared/**`).
- Low 3: тест «workspace_id in the query cannot move the scope» (`routes.test.ts:128-131`) не ловит мутант M5 — Zod вырезает `workspace_id` на `/tasks`; backlog: добавить `/decisions` в тест. Код query не читает — уязвимости нет.
- Low 4: при отказе Neo4j memory-маршрут ждёт ~15 с до 503 (ретраи `maxTransactionRetryTime`); остальное приложение не затронуто; backlog: `maxTransactionRetryTime: 2_000` для API-чтений.
- Info: M4 — эквивалентный мутант (пустой URI → `Illegal host` → тот же 503); мёртвый fallback `assertMeetingAccess` в `routes.ts:157`; участник ищется до `holder.graph()`.
- Отклонения PR приняты: 1) `memory-refs` (A-10, форма совпадает с `web/src/features/memory/api.ts`); 2) DELETE-хендлер проектов — только outbox-строка в той же транзакции (A-10); 3) 503 допустим в тесте изоляции для task-events только без `MEMORY_NEO4J_URI` (в CI переменная задана → строгая ветка 404, подтверждено рецензентом); 4) 409 без кода в `PROGRAM_ERRORS` (L2); 5) D-17.
- graph: checked — read-cypher 2026-10-08 (контейнер спец-графа перезапущен, 875 узлов): `UC-601` «Посмотреть реестр задач и историю задачи», `UC-602` «Разобрать очередь подтверждения», `UC-603` «Исправить задачу вручную», `UC-604` «Посмотреть решения и сводку проекта» — `detail_status=detailed-be`, `owner_wp=WP-API-MEMORY-01 / WP-WEB-MEMORY-01`, acceptance_criteria совпадают с реализованными маршрутами (включая `memory-refs` в UC-601); `UC-605` detailed-be, 4 шага; `FR-006` spec-complete. Info: у UC-601..604 нет ActivityStep (только AC, требования, актор, зависимости) — пробел детализации спецификации, не расхождение с пакетом.
- Общий путь `.tl/external-contracts/neo4j.md`: изменён в окне замка (коммит 9c2ce48 12:23Z, замок 12:14–12:31Z), объявление в шапке пакета добавлено оркестратором 2026-10-08.
- Слот слияния: последний пакет программы; после merge — `verify --env test` и `--env prod` (base_deploys: prod), затем `close --check`.

## Автоматические находки

- **пути и замки**: WP-API-MEMORY-01: shared path .tl/external-contracts/neo4j.md changed but not declared
- **пути и замки**: WP-API-MEMORY-01: api/src/features/projects/routes.ts is outside the allowed paths
- **пути и замки**: WP-API-MEMORY-01: api/test/auth-isolation.db.test.ts is outside the allowed paths

Дифф ревизии (пересдачи): —

---

## Отчёт рецензента (дословно)

## Отчёт ревью PR #23 — WP-API-MEMORY-01 (head `fb632c5091add0ba514eceb8196e1647d6fdef43`, base main `d97912108e876d353e7e79cf496bed2d504eab52`)

### 1. Вердикт: **ACCEPT**

Все пункты объёма (1–5, 8) и критерии приёмки (1–3) реализованы и покрыты тестами, которые я прогнал в одноразовом клоне с одноразовыми PG16 и Neo4j (28 файлов / 337 тестов зелёные, включая строгую CI-ветку изоляции). Изоляция держится на auth-плагине (scope только из `request.projectAccess`/`meetingAccess`), task-events ищутся по id ∧ workspace'ам вызывающего; мутации M1, M2, M3, M6 ловятся тестами. Правки вне разрешённых путей укладываются в A-10. Регрессий относительно base не нашёл. Замечания — только Low/Info (ниже), ни одно не блокирует слияние; два из них стоит завести follow-up'ом (слабый тест про `workspace_id` в query, англоязычный `message` у 409 MEMORY_INVALID_EVENT).

### 2. Объём → код → статус

| Пункт | Где | Статус |
|---|---|---|
| §2.1 Чтение реестра после проверки доступа в Postgres | `api/src/features/memory/routes.ts:52-56` (`projectScope` из `request.projectAccess`), маршруты `:58-81`, `:112-128`; гейт — `api/src/features/auth/routes.ts:149-162` → `assertProjectAccess` (`access.ts:43-52`) | Сделано; тесты `routes.test.ts` «reads», «isolation»; `memory.neo4j.test.ts` «lists tasks…», «task history…» |
| §2.2 Подтверждение/отклонение PENDING, повтор → 409 | `routes.ts:131-150` → `confirmTaskEvent`/`rejectTaskEvent` (`shared/src/memory/reviews.ts:46-95`, 409 на `:56`) | Сделано; `memory.neo4j.test.ts:177-207` (reject не меняет задачу, confirm применяет, повтор 409); `routes.test.ts:203-209` |
| §2.3 Ручная правка, событие USER, общая проверка переходов | `routes.ts:84-110`; `reviews.ts:106-176` (`source: 'USER', reviewState: 'CONFIRMED'` `:167`, `canTransitionTaskStatus` `:126`) | Сделано; `memory.neo4j.test.ts:161-175`; QUESTION не требовался — функция уже в `shared/src/api/memory.ts:38` |
| §2.4 Neo4j недоступен → 503, остальное работает | `api/src/features/memory/graph.ts:41` (URI не задан), `:59-73` (`guarded`: всё не-доменное → 503) | Сделано; `routes.test.ts:265-283` (503 + `/api/health` 200) |
| §2.5 Не делать UI / пайплайн | diff не трогает `web/`, `worker/` | Соблюдено |
| §2.8 Контракт `neo4j.md` + продюсеры outbox | `.tl/external-contracts/neo4j.md` (модель `:64-95`, продюсеры `:115`); `DELETE_PROJECT` — `api/src/features/projects/routes.ts:122-128`; `DELETE_MEETING` уже был — `api/src/services/uc-003.service.ts:101-108` | Сделано; тест `auth-isolation.db.test.ts:541-551`; тест на DELETE_MEETING — `:111` (AC-3 «deleting a meeting of a project writes a GraphOutbox row…») |
| AC-1 Тесты на Neo4j (CI) | `api/src/features/memory/memory.neo4j.test.ts` (7 тестов) | Зелёный в CI и у меня (7/7, 28 с) |
| AC-2 Тест изоляции с новыми маршрутами, чужой проект → 404 | `api/test/auth-isolation.db.test.ts:311-326` (scoped-цикл), `:328-343` (rest-цикл) | 24/24 зелёный с DB + Neo4j (строгая ветка) |
| AC-3 Typecheck и тесты | `pnpm -r typecheck` exit 0; `pnpm --filter @transcrib/api test` exit 0 | Зелёные |

### 3. Ответы на вопросы риска

**Q1. Гейт `/api/task-events/:eventId/*`.** Без cookie при `AUTH_REQUIRED=true` запрос не доходит до хендлера: `auth/routes.ts:135-147` — onRequest-хук на root-scope (fastify-plugin) для любого паттерна под `/api/` вне `PUBLIC_ROUTES` (`:54`) → `sessionAuth` null → `throw authError('UNAUTHENTICATED')` (`:145`) = 401. `requireAuth` в хендлере (`access.ts:25-30`) — лишь сужение типа. Подтверждено тестом `auth-isolation.db.test.ts:300-309` («401 everywhere»), который перебирает все маршруты из Fastify, включая task-events. С валидной сессией `workspaceIds = session.user.memberships.map(...)` (`:97`) — полный список; пустым может быть только у пользователя без memberships, что продуктом не достижимо (CLI создаёт membership при `create`, `cli.ts:121`; `revoke`/`membership.delete`/`workspace.delete` в `api/src` нет — grep пуст). Если бы всё же было пусто — `findTaskEventScope` бросает `MemoryScopeError` (`reads.ts:193-195`), а `guarded` её пробрасывает → 500 (см. Finding L1). Legacy: `request.auth = { ...LEGACY_AUTH, workspaceIds: [...LEGACY_AUTH.workspaceIds] }` (`:146`), `LEGACY_AUTH.workspaceIds = [LEGACY_WORKSPACE_ID]` (`types.ts:50`) — ровно один workspace; `routes.test.ts:185-190` проверяет, что в `findTaskEventScope` уходит `['00000000-0000-4000-8000-000000000001']`.

**Q2. `request.projectAccess!` в DELETE.** preValidation-хук `auth/routes.ts:149-162`: для `url === '/api/projects/:projectId'` (`inScope`, `:61-62`) `projectId = params.projectId` → `request.projectAccess = await assertProjectAccess(...)` (`:160`), иначе throw 404. Хук не зависит от принципала (legacy тоже имеет `request.auth`), а без auth запрос уже отбит 401 на onRequest. `onRoute`-страж (`:65-74`) не даёт маршруту под `/api/projects/:` обойти проверку. Эмпирически: scoped-цикл изоляции (`:311-326`) гоняет `DELETE /api/projects/:projectId` от чужого → 404, новый тест `:541-551` — от владельца → 204 и ровно одна строка outbox. Остальное поведение как в base: base делал `prisma.project.delete({ where: { id } })` → 204 (`base projects/routes.ts:119-122`); head — то же удаление внутри `$transaction` + `graphOutbox.create` (`:123-128`); каскады — FK на уровне БД, не изменились; 404 для чужого — до хендлера, не изменился; 204 — `:129`.

**Q3. Контракт outbox.** `GraphOutbox.op` — `String` (`api/prisma/schema.prisma:490`), не enum; значения задаёт `GraphOutboxEntry` в `shared/src/api/memory.ts:217-233`: `DELETE_PROJECT` → `payload { project_id, workspace_id }`. Продюсер пишет `{ op: 'DELETE_PROJECT', payload: { project_id: projectId, workspace_id: workspaceId } }` (`projects/routes.ts:125`) — ключи совпадают побуквенно. Консьюмер `worker/src/memory/outbox.ts:54` парсит `GraphOutboxEntry.safeParse({op, payload})`, затем `worker/src/memory/index.ts:69-70` → `deleteProjectFromGraph(graph, { workspaceId: entry.payload.workspace_id, projectId: entry.payload.project_id })`. Форма та же, что у `DELETE_MEETING` в `uc-003.service.ts:105` (`meeting_id, project_id, workspace_id`). Замечу: невалидная строка не крутится вечно — `outbox.ts:55-59` закрывает её `markInvalid` (терминально, с `last_error`); «retry forever» относится только к недоступному Neo4j. Тест `auth-isolation.db.test.ts:549` проверяет payload `toEqual([{ project_id, workspace_id }])`.

**Q4. Маппинг ошибок.** Классы в `shared/src/memory/errors.ts`: `MemoryNotFoundError` (NOT_FOUND), `TaskEventAlreadyReviewedError` (TASK_EVENT_ALREADY_REVIEWED), `TaskStatusTransitionError` (TASK_STATUS_TRANSITION), `MemoryConcurrencyError` (MEMORY_CONCURRENT_UPDATE), `MemoryInvalidEventError` (MEMORY_INVALID_EVENT); тип `code` = `ProgramErrorCode | 'MEMORY_CONCURRENT_UPDATE' | 'MEMORY_INVALID_EVENT'` (`:9`). `guarded` (`graph.ts:64-69`): NOT_FOUND → `notFound()`; MEMORY_CONCURRENT_UPDATE → 503; MEMORY_INVALID_EVENT → 409; остальное → `PROGRAM_ERRORS[err.code]` — после трёх ветвей `err.code` сужен до `ProgramErrorCode`, все ключи есть в `PROGRAM_ERRORS` (`shared/src/api/errors.ts:17-42`), `undefined` недостижим. `MemoryScopeError` пробрасывается как есть (`graph.ts:70`) → не AppError, не Zod, без `statusCode` → обработчик `api/src/plugins/errors.ts:74-79` → 500 `INTERNAL_ERROR` с текстом `'An unexpected error occurred'`; в теле id не утекают; в лог идёт `error` с сообщениями вида `'memory query without a valid workspaceId'` / `'task event lookup without caller workspaces'` (`scope.ts:34-39`, `reads.ts:194`) — без id. 409 для MEMORY_INVALID_EVENT разумен (конфликт состояния: цель merge исчезла); web на любую ошибку мутации делает `invalidateQueries` (`web/src/features/memory/api.ts:102,121`) и показывает `error.message` (`ReviewQueueTab.tsx:16`) — текст будет английским «cannot merge T-1 into T-9» (Finding L2).

**Q5. Тайминг 503.** Измерил на `neo4j-driver` 6.2.0 с ровно той же `DRIVER_CONFIG`: `executeRead` к `bolt://127.0.0.1:1` (ECONNREFUSED) → `ServiceUnavailable` через **15 190 мс** (ретраи драйвера с backoff 1+2+4+8 с внутри `maxTransactionRetryTime`). При «чёрной дыре» (пакеты теряются) добавится `connectionTimeout` 5 с на попытку — ориентировочно 15–20 с. Пул на 10 соединений: при отказе соединения освобождаются сразу, пул не забивается; при таймаутах >10 параллельных запросов ждут `connectionAcquisitionTimeout` 8 с и тоже уходят в 503. Event loop не блокируется, другие маршруты не затронуты (`routes.test.ts:275-283`: 503 на memory, 200 на `/api/health`). Low (Finding L4).

**Q6. Ленивый драйвер.** `graph.ts:43-49`: `driver = neo4j.driver(...)` — присваивание происходит только после возврата конструктора; если он бросает (проверил: `neo4j.driver('bolt://')` → `Illegal host` синхронно), `driver` и `graph` остаются `undefined`, следующий вызов повторит попытку; `guarded` превращает это в 503. `neo4j+s://…` и bolt-URI с userinfo (логин и пароль в адресе) конструктор принимает (подключение лениво). Закрытие: один `onClose`-хук (`:34-36`) с `driver?.close()` — ровно один раз, no-op если драйвер не создавался; `routes.test.ts` создаёт/закрывает app в каждом тесте без ошибок.

**Q7. PATCH-валидация.** `TaskPatchRequest` (`shared/src/api/memory.ts:143-151`): `.partial().refine(keys>0)` → `{}` отбивается схемой 400 (`routes.test.ts:254` — `patchTask` там замокан и вернул бы 200, значит 400 даёт схема). `due_date: IsoDate.nullable()` → `null` проходит; `routes.ts:90` `if (body.due_date !== undefined) patch.dueDate = body.due_date` → `dueDate: null` уходит в `patchTask` (`reviews.ts:154` пишет событие с `newValue: null`). `TaskListQuery.status = MemoryTaskStatus.optional()` (`:124`) → `?status=NOPE` → 400. `assignee`: `reads.ts:37` `toLower(t.assigneeName) = toLower($assignee)`; `memory.neo4j.test.ts:129` с `'иванов'` прошёл у меня на реальном Neo4j.

**Q8. Дублирование таблицы переходов.** Единственная таблица — `shared/src/api/memory.ts:30-40`. Потребители: `reviews.ts:62` (confirm), `reviews.ts:126` (patchTask), `worker/src/memory/gate.ts:241` (пайплайн), `web/src/features/memory/components/TaskEditForm.tsx:4,51` (фильтр опций). Второй копии нет (grep по `TASK_STATUS_TRANSITIONS|canTransitionTaskStatus` в shared/worker/web/api).

**Q9. memory-refs.** `MeetingMemoryRefsResponse` (`shared/src/api/memory.ts:207-212`): `project_id`, `tasks[{code,title,status}]`, `decisions[{code,text}]`. `getMeetingMemoryRefs` (`reads.ts:151-181`) возвращает ровно эти поля. Web (`api.ts:79-89`) парсит той же схемой; `MeetingMemoryRefs.tsx:12-40` использует `project_id`, `tasks[].code/title`, `decisions[].code/text` — ничего сверх контракта. Встреча без проекта → `{project_id: null, tasks: [], decisions: []}` без обращения к графу (`routes.ts:158`), компонент рендерит ничего (`:12`). Совпадает.

**Q10. Тест изоляции.** `memoryOff = r.url.startsWith('/api/task-events/') && !process.env['MEMORY_NEO4J_URI']` (`:340`); в CI `MEMORY_NEO4J_URI=bolt://localhost:7687` задан на уровне job (`.github/workflows/ci.yml:66`) → строгая ветка `[400, 404]`; я прогнал тот же режим локально (с `MEMORY_NEO4J_URI` на мой контейнер) — зелёный, а мутация M1 в этом режиме его валит. Релаксация касается только task-events; остальные маршруты — прежние списки. Новые project-/meeting-маршруты попадают в scoped-цикл по префиксу (`:313`), task-events — в rest-цикл (`:330-331`); список `:277-286` — `arrayContaining`, т.е. sanity-проверка, а полноту гарантирует другое: `apiRoutes()` берётся из `onRoute` самого Fastify (`:33-43`), `fill()` бросает на незнакомое имя параметра (`:253-258`), и три цикла (401-всё / scoped / rest=дополнение) покрывают каждый зарегистрированный маршрут. `eventId` и `code` в `KNOWN_PARAMS` (`:250-251`) были уже в base. Точного счётчика маршрутов нет и не было — только нижняя граница `scoped.length >= 9` (`:314`).

**Q11. Удаление из контракта.** grep по `DEPENDS_ON|SUBTASK_OF|depends_on|subtask` в `shared/`, `worker/`, `web/`, `api/` — ни одного вхождения в коде (все совпадения — `.tl/` планировочные документы про зависимости задач TL, другой смысл). Из контракта больше ничего не убрано: диф — расширение модели, замена `(:Decision)-[:MENTIONED_IN {quote}]` на вариант с `startMs,endMs,speakerLabel` (так пишет `writeMeetingUpdate`), заметки, продюсеры outbox, API-строки. `web` не использует никаких полей, которых нет в API.

**Q12. Гигиена Neo4j-тестов.** В CI `pnpm -r run test` (`ci.yml:108`) топологический: `shared` (его `memory-graph.neo4j.test.ts` первым применяет миграцию) завершается до `api`/`worker`, которые могут идти параллельно на одном сервисе. Безопасно: `applyMemoryGraphMigrations` сначала читает `SchemaVersion` и при `version >= 1` не выполняет ни одного statement (`migrations.ts:76-77`); сами statements `IF NOT EXISTS` (`:26-43`). Все четыре Neo4j-теста (api, worker pipeline/outbox, shared) используют случайные uuid и чистят только свой проект через `deleteProjectFromGraph` — глобальных `MATCH (n) DETACH DELETE` нет (grep; единственный `MATCH (n)` — негативный тест на scope-guard `scope.test.ts:66`). Упавший тест оставит сиротские узлы со случайными id — повторный прогон их не заметит.

**Q13. Секреты и логи.** `app.log.error({ err }, …)` (`graph.ts:71`): проверил на реальной ошибке драйвера — `JSON.stringify(err)` не содержит пароля, `message` содержит только host:port («Failed to connect to server… Caused by: connect ECONNREFUSED 127.0.0.1:1»). URI с userinfo драйвер принимает, но в сообщение ошибки не копирует. В тестах — только тестовые константы (cookie `test-token`, фиктивные uuid, имена «Иванов/Петров»); `ci_memory_password` в `ci.yml` был до PR. В теле PR секретов и персональных данных нет.

**Q14. Мутации** — таблица в разделе 6.

**Q15. Что убрано относительно base.** В коде — ничего: `DELETE /api/projects/:projectId` сохранил 404/204/каскады, добавилась только транзакция с outbox-строкой; `server.ts`, `shared`, `worker`, `web` не тронуты; новые маршруты только добавляют. В контракте: `(:Task)-[:DEPENDS_ON|SUBTASK_OF]->(:Task)` убраны из модели с пометкой «не производятся в v1» (это и просил §2.8); `(:Decision)-[:MENTIONED_IN {quote}]` расширен. Необратимых состояний/переходов не добавлено: confirm/reject — терминальны по D-14 и так, повтор → 409.

### 4. Находки

**High / Medium:** нет.

**Low:**

- **L1. `MemoryScopeError` → 500 на `/api/task-events/*` при пустом списке workspace'ов.** `api/src/features/memory/graph.ts:70` пробрасывает `MemoryScopeError`; `shared/src/memory/reads.ts:193-195` бросает её при `callerWorkspaceIds.length === 0`. Сценарий: пользователь с сессией, у которого удалены все memberships (сейчас достижимо только прямой правкой БД — API/CLI отзыва нет) → `POST /api/task-events/<id>/confirm` → 500 `INTERNAL_ERROR` вместо 404. Не регрессия. Рекомендация (follow-up): в хендлере `if (auth.workspaceIds.length === 0) throw notFound()` либо маппить `MemoryScopeError` на 404 в `guarded`.
- **L2. Англоязычный `message` у 409 `MEMORY_INVALID_EVENT` показывается пользователю.** `graph.ts:67` передаёт `err.message` («cannot merge T-1 into T-9», `reviews.ts:70`); web выводит `error.message` как есть (`web/src/features/memory/components/ReviewQueueTab.tsx:16`). Сценарий: confirm события `merged_into`, цель которого удалена вместе со встречей → пользователь видит английскую строку. Deviation 4 честно это декларирует (кода нет в `PROGRAM_ERRORS`, `shared` не трогали). Follow-up: добавить код и русский текст в `shared/src/api/errors.ts` отдельным пакетом с общим путём `shared/**`.
- **L3. Тест «a workspace_id in the query cannot move the scope» неэффективен для маршрутов без `querystring`-схемы.** `routes.test.ts:128-131` проверяет только `/tasks`, где Zod-схема `TaskListQuery` вырезает незнакомый `workspace_id` ещё до хендлера; мутант M5 (scope из `request.query.workspace_id`) остался зелёным, а мой вариант теста на `/decisions` (без querystring-схемы) его поймал. Код сам query не читает (`routes.ts:52-56`), уязвимости нет — это слабость теста. Follow-up: в этот тест добавить `/decisions` (или `/memory`, `/review-queue`).
- **L4. До 15 с ожидания на memory-маршрутах при отказе Neo4j.** Измерено: 15 190 мс до `ServiceUnavailable` с `DRIVER_CONFIG` из `graph.ts:15-21` (ретраи `maxTransactionRetryTime` с backoff). Затрагивает только memory-маршруты; web на 503 ничего не ломает. Если захочется быстрее — `maxTransactionRetryTime: 2_000` для API-чтений.

**Info:**

- **I1.** Мутант M4 (удаление проверки `MEMORY_NEO4J_URI` в `graph.ts:41`) эквивалентен по поведению: `neo4j.driver('')` бросает `Illegal host` синхронно → `guarded` → тот же 503; разница только в логе (`app.log.error` на каждый запрос) и в отсутствии явного сообщения. Тест это различить не может — не дефект.
- **I2.** `routes.ts:157` `request.meetingAccess ?? (await assertMeetingAccess(...))` — fallback мёртвый (хук всегда ставит `meetingAccess` под `/api/meetings/:id`), безвреден.
- **I3.** В PATCH поиск участника в Postgres (`routes.ts:95-98`) идёт до `holder.graph()`: при выключенной памяти чужой участник даст 404, а не 503. Логично, не проблема.

### 5. Отклонения

| # | Отклонение (из тела PR) | Решение |
|---|---|---|
| 1 | `GET /api/meetings/:id/memory-refs` добавлен | Принято: A-10 разрешает при совпадении формы с `web/src/features/memory/api.ts:84` — совпадение проверено (Q9); маршрут классифицирован в тесте изоляции (`:284`), покрыт `routes.test.ts:148-154` и `memory.neo4j.test.ts:149-152`. |
| 2 | Правка `api/src/features/projects/routes.ts` | Принято: единственный хунк `@@ -117,7 +117,15 @@` — только хендлер DELETE, только outbox-строка в той же транзакции (A-10). Тест `auth-isolation.db.test.ts:541-551`. |
| 3 | Релаксация до 503 в тесте изоляции для task-events без `MEMORY_NEO4J_URI` | Принято с оговоркой: строго по букве A-10 это чуть больше, чем «классификация маршрутов + тест DELETE_PROJECT», но изменение ограничено одной веткой (`:340-342`), в CI не активно (Q10), 2xx по-прежнему исключён. Альтернатива (пропускать task-events без Neo4j) была бы хуже — тест бы ничего не проверял. |
| 4 | `MemoryInvalidEventError` → 409 без записи в `PROGRAM_ERRORS` | Принято; см. L2 (follow-up на `shared`). |
| 5 | CLAUDE.md/AGENTS.md не синхронизированы | Принято по D-17. |

**Автонаходки:** (1) `.tl/external-contracts/neo4j.md` изменён под замком `graph` (факт оркестратора: коммит 9c2ce48 12:23Z внутри окна 12:14–12:31Z), объявление в шапке пакета отсутствовало — чинит оркестратор; содержание соответствует §2.8 (проверено по `shared/src/memory/*`: Project-счётчики, `OF_PROJECT`, поля TaskEvent `creation/appliedAt/ordinal/reviewedAt/reviewedBy/meetingId`, Tombstone, SchemaVersion, USER-события как CONFIRMED — `reviews.ts:167`). (2)/(3) — в пределах A-10, см. таблицу выше. Недекларированных отклонений не нашёл.

### 6. CI, размер, тесты, мутации

- **CI:** run 37777007848 на `fb632c5…` — `Lint + Typecheck + Test` pass (2m47s), все шаги success (`gh run view --json`); `gh pr checks 23` → pass. PR `MERGEABLE`, ветка 0 позади main, merge-base = `d979121…`.
- **Размер:** 7 файлов, +793/−16; из них код api +757/−3 (6 файлов), тесты +515/−2 (3 файла); продакшен-код: `graph.ts` 74, `routes.ts` 159, `projects/routes.ts` +9/−1.
- **Клон:** `review_clone.sh --repo git@github.com:ITSalt/transcriber.git --sha fb632c5… --setup 'pnpm install --frozen-lockfile' --setup 'pnpm --filter @transcrib/api run db:generate' --setup 'pnpm --filter @transcrib/shared build' --test 'pnpm --filter @transcrib/api test' --test 'pnpm -r typecheck' --keep` → все setup exit 0; `pnpm --filter @transcrib/api test` exit 0 (без БД/Neo4j: 27 файлов, 2 skipped-файла); `pnpm -r typecheck` exit 0. `git rev-parse HEAD` в клоне = `fb632c5091add0ba514eceb8196e1647d6fdef43` (PLUGIN-BUG-4 не воспроизвёлся).
- **Postgres:** `embedded-postgres@16.14.0-beta.17` в scratch-каталоге (в npm нет тега `@16`), `initdb -U review -A trust`, `pg_ctl -o "-p 56431 -k '' -c listen_addresses=127.0.0.1"`; `DATABASE_URL=<postgresql-URI одноразового PG, пользователь review, trust, 127.0.0.1:56431, БД postgres> pnpm --filter @transcrib/api run db:migrate:deploy` → exit 0.
- **Neo4j:** `docker run -d --name orch-review-neo4j-92385 -p 127.0.0.1:0:7687 -e NEO4J_AUTH=neo4j/<одноразовый пароль> neo4j:5-community` → порт 32768, `cypher-shell 'RETURN 1'` ответил через 3 с.
- **Полный прогон (CI-эквивалент):** `DATABASE_URL=… MEMORY_NEO4J_URI=bolt://127.0.0.1:32768 MEMORY_NEO4J_USER=neo4j MEMORY_NEO4J_PASSWORD=<пароль одноразового контейнера> pnpm --filter @transcrib/api test` → exit 0, **Test Files 28 passed, Tests 337 passed**; в т.ч. `memory.neo4j.test.ts` 7/7, `routes.test.ts` 19/19, `auth-isolation.db.test.ts` 24/24 (строгая ветка 404). Локальная цифра сессии «27 файлов / 330» = мои 28/337 минус Neo4j-файл.
- **Проба драйвера:** `neo4j-driver` 6.2.0; `driver('bolt://')` → throw `Illegal host`; `executeRead` на `bolt://127.0.0.1:1` → `ServiceUnavailable` за 15 190 мс; пароль в сериализованной ошибке отсутствует.

| Мутация | Правка | Результат (3 файла: routes.test / memory.neo4j.test / auth-isolation, DB+Neo4j) |
|---|---|---|
| M1 | убрать `if (!scope) throw notFound()` (`routes.ts:145`) | **Красный**: 4 теста — routes «an event of another workspace is a 404…», «without a session…»; neo4j «another workspace…»; isolation «user B … never gets a 2xx» |
| M2 | убрать `projectId: scope.projectId` из поиска участника (`routes.ts:96`) | **Красный**: 2 — routes «maps the body to a patch…», neo4j «manual edit…» (мок участника требует projectId; тест «foreign participant → 404» сам по себе зелёным бы остался) |
| M3 | убрать `tx.graphOutbox.create` (`projects/routes.ts:124-126`) | **Красный**: isolation «deleting a project writes a DELETE_PROJECT GraphOutbox row…» |
| M4 | убрать проверку `MEMORY_NEO4J_URI` (`graph.ts:41`) | **Зелёный** (50/50) — эквивалентный мутант, конструктор драйвера бросает на пустом URI → тот же 503 (I1) |
| M5 | `projectScope` берёт `workspace_id` из query | **Зелёный** (50/50) — Zod вырезает `workspace_id` на `/tasks`; вариант теста на `/decisions` мутанта ловит (L3) |
| M6 | поменять местами confirm/reject (`routes.ts:135-136`) | **Красный**: 5 — routes «confirm and reject run…», «a repeat answers 409», «…400 TASK_STATUS_TRANSITION»; neo4j «reject keeps the task…», «confirm applies…» (первая попытка через perl сломала синтаксис — невалидный мутант, переделан sed'ом с проверкой диффа) |

После каждой мутации `git checkout -- api` → 0 грязных файлов.

### 7. Уборка

- Клон удалён: `review_clone.sh --cleanup …/scratchpad/clones/orch-review.j3SCrB` → `removed …`; в `clones/` остался только `node-compile-cache`.
- Postgres: `pg_ctl -m fast stop` → `server stopped`; каталог `scratchpad/epg` удалён.
- Neo4j: `docker rm -f orch-review-neo4j-92385` → удалён, `docker ps -a --filter name=orch-review-neo4j` → 0.
- Порты 56431 и 32768 свободны (`ss -ltn`).
- В `/home/cloudpc/projects/transcriber`, worktree сессии и workspace оркестратора ничего не записано; к Postgres 5432 и Neo4j 7687 не подключался.
