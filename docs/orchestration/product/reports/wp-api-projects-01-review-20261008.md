# Сверка — WP-API-PROJECTS-01 (PR https://github.com/ITSalt/transcriber/pull/20, `1c05fcbbdc` -> `main @ ae76dda3e3`) — 2026-10-08

Раунд 1. Дифф: 6 files changed, 797 insertions(+), 1 deletion(-) (файлов: 6).

**Решение: `REVISE WP-API-PROJECTS-01`** — объём (9 пунктов) и критерии приёмки подтверждены кодом, тестами (api 277/277, shared 121/121, изоляция 23/23 с новыми маршрутами) и 6 мутациями, ядро не тронуто, граф обновлён (RQ-047/064, DEC-011, UC-502/503 v2); один пункт на доработку: `POST /start` с `source=project` при протоколе проекта длиннее 50 000 символов отвечает 500 (ZodError снимка) — воспроизведено рецензентом; плюс обещанные .tl-правки и слияние с main одним раундом.

## Пункты REVISE

1. `api/src/features/context/service.ts:157-163` -> у проекта последний протокол длиннее 50 000 символов, черновик `previous_protocol: {source:'project'}`, `POST /start` → `MeetingContextSnapshot.parse` бросает ZodError → 500 `INTERNAL_ERROR`, встреча остаётся `AWAITING_START` без понятной причины (воспроизведено ad-hoc тестом) -> требование: до сборки снимка проверять `last.markdown.length > PREVIOUS_PROTOCOL_MAX_CHARS` и отвечать 422 новым кодом `PREVIOUS_PROTOCOL_TOO_LONG` из `PROGRAM_ERRORS` (`shared/src/api/errors.ts`, разрешено A-9; сообщение: «Протокол проекта длиннее 50 000 символов — выберите «без протокола» или вставьте фрагмент»), откат транзакции как для `PREVIOUS_PROTOCOL_UNAVAILABLE`; тест в `context.db.test.ts` (50 001 символ в протоколе проекта → 422, статус `AWAITING_START`, очередь не вызвана) и строка в `program-contract.test.ts`; medium.
2. Документация (обещано при UNLOCK graph): `.tl/feature-requests/FR-004-projects-meeting-context.md` (RQ-047, RQ-064, DEC-011, новый код ошибки), `.tl/changelog.md` (замок ваш); комментарий в `shared/src/api/project.ts:18` (404 → 422) — не трогать, backlog.
3. `git merge --no-edit origin/main` (в main PR #13, #17) в том же раунде; READY с новым SHA.

### Не требуется

- Рефакторинг «общей функции» постановки в очередь (находка 4) — копия 5 строк без правки ядра принята.
- Гонка `update/delete` → P2025 (находка 3), сброс `projectId` при PUT без `project_id` (находка 6), 404 для контекста до первого PUT (находка 7) — приняты/backlog.
- Правка `shared/src/api/project.ts` — backlog владельцу `shared/`.

## Вопросы владельцу

нет (вопрос рецензента о коде ошибки закрыт A-9: новый код в PROGRAM_ERRORS; P-16 → D-25 уже решён)

## Принято как есть / backlog

- Low 2: комментарий контракта `project.ts:18` обещает 404, код даёт 422 — backlog `shared/`. Low 3: P2025 при гонке update/delete → 500 — backlog. Info 4–7 — приняты.
- Отклонения PR приняты: только два файла в `shared/` (A-8); D-17; Deviation 4 (`projectId` в черновике).
- Сбой инструмента: `review_setup` без сборки `shared` и без `DATABASE_URL` → 17 тест-файлов api и typecheck worker падают, 48 DB-тестов пропускаются; рецензент поднял embedded PG16 сам (`orch.yaml review_setup` дополняется); столкновение одноразовых клонов двух параллельных сверок в `/tmp/orch-review.LQk4dw` — PLUGIN-BUG-4.
- graph: checked — read-cypher 2026-10-08 после UNLOCK: `RQ-047` (лимит 50 000, атомарный захват, 422 при отсутствии протокола, существующий PENDING-job), `RQ-064` (last-protocol), `DEC-011` accepted, `UC-502`/`UC-503` spec_version 2, `MeetingContext-A08` ≤ 50 000, `FR-004` spec-complete, `UC-100` v5. После п. 1 сессия дополняет RQ-047 кодом `PREVIOUS_PROTOCOL_TOO_LONG` под замком graph.
- Слот слияния: после WP-API-FEEDBACK-01 (очередь), до памяти; WEB-PROJECTS-01 — после этого пакета.

## Автоматические находки

- **пути и замки**: WP-API-PROJECTS-01: shared path shared/src/api/context.ts changed but not declared
- **пути и замки**: WP-API-PROJECTS-01: shared path shared/src/api/program-contract.test.ts changed but not declared
- **merge-base**: WP-API-PROJECTS-01: branch point fd9ca659f0 is 1 commits behind origin/main (no overlapping files) - rebase before merge

Дифф ревизии (пересдачи): —

---

## Отчёт рецензента (дословно)

## Review report — PR #20, WP-API-PROJECTS-01

**PR:** https://github.com/ITSalt/transcriber/pull/20, head `1c05fcbbdc3d2657cede02aa013c717d1ff2dd23`, base `main @ ae76dda3e3`, merge-base `fd9ca659f0` (1 коммит позади main — только `web/**` из FRONTEND-02, пересечений с PR нет). Дифф от merge-base: 6 файлов, +797/−1, все в `api/src/features/{context,projects}/**` и двух разрешённых по A-8 файлах `shared/`.

**Вердикт: ACCEPTED** — все 9 пунктов объёма и 3 критерия приёмки подтверждены кодом, тестами (277/277 api, 121/121 shared, изоляция 23/23) и 6 мутациями; ядро не тронуто; единственная существенная находка (500 при протоколе проекта длиннее 50 000 символов) — редкий путь, не из критериев приёмки, предлагаю как условие/backlog по решению владельца (P-1).

### Находки

1. **medium** — `api/src/features/context/service.ts:157-163` + `shared/src/api/context.ts:75`. Сценарий: у проекта последний протокол длиннее 50 000 символов, в черновике `previous_protocol: {source:'project'}`, `POST /start` → `lastProtocolOf` подставляет полный `markdown`, `MeetingContextSnapshot.parse` бросает ZodError, `plugins/errors.ts:74-79` отдаёт **500 INTERNAL_ERROR**. Воспроизведено ad-hoc тестом в клоне: `/start -> 500 {"code":"INTERNAL_ERROR"}`, встреча остаётся `AWAITING_START` (откат), очередь не вызвана. Пользователю старт недоступен с непонятной ошибкой; обход — выбрать `none`/`upload`. Форма WEB-PROJECTS-01 этот путь ограничить не может (текст подставляется на сервере). Требование: до `parse` проверять `last.markdown.length > PREVIOUS_PROTOCOL_MAX_CHARS` и отвечать ошибкой из `PROGRAM_ERRORS` (422). **P-1 владельцу:** какой код — существующий `PREVIOUS_PROTOCOL_UNAVAILABLE` (сообщение «В проекте ещё нет протокола» вводит в заблуждение, но без правки `shared/`) или новый код в `shared/src/api/errors.ts` (нужно исключение по замку, как A-8). Не регрессия относительно base.
2. **low** — `shared/src/api/project.ts:18`: комментарий контракта обещает `404 PREVIOUS_PROTOCOL_UNAVAILABLE`, код и `PROGRAM_ERRORS` (`errors.ts:29`) дают 422. Deviation 2 сессии принимается: `PROGRAM_ERRORS` — источник истины, файл вне её путей. В backlog владельцу `shared/`.
3. **low** — `api/src/features/projects/routes.ts:110, 120`: `prisma.project.update/delete` без повторной проверки существования; при гонке с параллельным DELETE Prisma P2025 → 500 вместо 404. Только гонка, плагин авторизации уже проверил проект на `preValidation`. Backlog.
4. **info** — `service.ts:208-216`: «общий код постановки в очередь» — это 5-строчная копия вызова из `uc-100.service.ts` (тот же payload `{transcription_job_id, speaker_count}`), а не вынос общей функции; ядро не правилось, что пакет и требовал. Приемлемо.
5. **info** — `service.ts:212-215`: сбой enqueue после коммита логируется, встреча остаётся `TRANSCRIBING` с `PENDING`-job, который никто не поставит в очередь — зеркало поведения `finalizeUpload` (там та же оговорка про reconciliation). Не регрессия.
6. **info** — Deviation 4: `PUT context` пишет `Meeting.projectId` уже в черновике (`service.ts:104`), и `PUT` без `project_id` сбрасывает его в NULL (семантика полной замены). Виден через `GET /api/meetings/:id` до старта. Принимаю: колонки под черновой проект нет, на старте значение не перезаписывается, а снимок фиксирует карточку проекта.
7. **info** — `GET /api/meetings/:id/context` до первого PUT → `404 NOT_FOUND`, неотличимо от «встреча не найдена»; так в контракте (`context.ts:9`). Фронту учесть.
8. **info (инструмент, не продукт)** — setup из брифа без `pnpm --filter @transcrib/shared run build` и без `DATABASE_URL`: api-тесты падают на `Failed to resolve entry for package "@transcrib/shared"`, typecheck worker — TS6305 (нет `shared/dist`), 48 DB-тестов пропущены (`describe.skipIf(!DATABASE_URL)`, `api/test/helpers/db.ts:11`). Репозиторий embedded-postgres **не** предоставляет; CI (`ci.yml:94,99`) делает `db:migrate:deploy` и сборку shared. Кроме того, мой первый клон `/tmp/orch-review.LQk4dw/repo` был перехвачен параллельной сессией ревью PR 21 (HEAD переключён на `a7798d4`, в нём шёл её vitest) — те результаты отброшены, сделан изолированный клон в scratchpad.

Сравнение с base: файлы ядра не изменены (дифф от merge-base — только 6 файлов), ни один маршрут/переход состояния base не исчез. Единственное снятое поведение — `upload`-текст 50 001…200 000 символов теперь отклоняется (D-25, намеренно); `PREVIOUS_PROTOCOL_MAX_CHARS` больше нигде в `api/worker/web` не используется.

### Объём (раздел 2) → код

| Пункт | Где | Статус |
|---|---|---|
| 1. CRUD проекта/участников/глоссария через `assertWorkspaceAccess` | `projects/routes.ts:83-200`; список/создание `assertWorkspaceAccess` (84, 94); дочерние — `findFirst/deleteMany` с `projectId` (141, 149, 172, 186) | ✓ |
| 2. `PUT context` только в `AWAITING_START`; режимы `project/upload/none`; лимит 50 000 | `service.ts:104-105` (updateMany по статусу → `CONTEXT_FROZEN` 409); `shared/src/api/context.ts:24, 75, 79`; тест 50 000/50 001 (`context.db.test.ts:206-214`, `program-contract.test.ts:193-196`) | ✓ |
| 3. `POST /start`: только из `AWAITING_START`, снимок, `snapshotHash`, `MeetingContext`, `Meeting.projectId`, очередь как `finalizeUpload`, повтор 409 | `service.ts:136-137` (атомарный захват), `163-190` (снимок + sha256 canonical), `202` (upsert), `projectId` с PUT (`104`); `routes.ts:47-48` enqueue после коммита; `MEETING_NOT_AWAITING_START` 409 | ✓ |
| 4. «Добавить в проект» | = `POST /api/projects/:projectId/participants|glossary` (`routes.ts:125, 155`) | ✓ (контракт `project.ts:19`) |
| 5. `GET /api/projects/:id/last-protocol` | `routes.ts:192-200`, `service.ts:31-46` (текущий текст, `version_n` = max n) | ✓ |
| 6. Не делать ASR/LLM/UI/память | в диффе нет | ✓ |
| 8. A-5: существующий `PENDING`-job, payload `{transcription_job_id, speaker_count: job.speakerCount}`, нового job нет | `service.ts:141-145, 204, 211`; тест `context.db.test.ts:246-247` (`count === 1`) | ✓ |
| 9. D-25 в `shared/` Zod, без обрезки в воркере | `shared/src/api/context.ts:23-24`; в `worker/` ссылок нет | ✓ |

BRQ-009: API job не мутирует вообще (только читает `id/status/speakerCount`). D-22: `meetings.workspace_id` не затронут. Автоматические находки «shared path не объявлен» — покрыты A-8 (ровно эти два файла, `git diff` по `shared/` подтверждает: только константа и 4 строки теста).

### Критерии приёмки (раздел 3)

| Критерий | Свидетельство | Статус |
|---|---|---|
| Тесты: CRUD; контекст только в `AWAITING_START`; `start` пишет снимок и ставит задание; повтор → 409; снимок не меняется при правке проекта | `context.db.test.ts`: 103-135, 187-204, 226-277 (hash неизменен после PATCH участника/POST термина), 279-284 (параллельные старты), 314-321; 12/12 зелёные в клоне | ✓ |
| Тест изоляции BACKEND-01 покрывает новые маршруты | `auth-isolation.db.test.ts:241-252` — `projectId/participantId/termId` в `KNOWN_PARAMS`, `scoped ≥ 9` (309); 23/23 зелёные; мутация M3 красит его | ✓ |
| Typecheck и тесты зелёные | `pnpm -r typecheck` exit 0 (4 пакета Done); api 277/277, shared 121/121; eslint `src/features` exit 0; CI «Lint + Typecheck + Test» pass (1m45s) | ✓ |

### Утверждения тела PR

- CRUD по `workspace_id` через `assertWorkspaceAccess`, дочерние с `projectId` → 404 — **подтверждено** (строки выше).
- `last-protocol` 422 без протокола — **подтверждено** (`errors.ts:29`, тест 166-184).
- GET/PUT context, 409 `CONTEXT_FROZEN`, чужой проект → 404 — **подтверждено** (`context/routes.ts:33-37`, тест 216-223).
- `/start` в одной транзакции, атомарный захват, снимок, sha256 canonical, 422 с откатом при отсутствии протокола, enqueue после коммита с `job.speakerCount`, 409 на повтор — **подтверждено** (`service.ts:134-206`, `routes.ts:43-51`; тест 294-312 проверяет откат).
- Ядро (`uc-100.service.ts`, `queue.ts`) не менялось — **подтверждено** (дифф от merge-base).
- 12 тестов / изоляция зелёная / typecheck, eslint чисто / 277 и 121 — **подтверждено** в моём клоне (цифры совпали).
- Deviation 1 (только два файла в `shared/`) — **подтверждено**. Deviation 2 — принято (находка 2). Deviation 3 (граф и `.tl/` не обновлялись) — принято как факт, граф я не проверял. Deviation 4 — принято (находка 6). Deviation 5 (`orch.py instructions check`) — **не проверял**, инструмент оркестратора.

### Мутации (изолированный клон, `1c05fcb`)

| # | Мутация | Результат |
|---|---|---|
| M1 | `service.ts:104` — убран `status: 'AWAITING_START'` из guard `saveDraft` | красный: «context is a draft only in AWAITING_START» (1 failed / 11 passed) |
| M2 | `service.ts:204` — удалить `PENDING`-job и создать новый, enqueue с его id | красный: «start freezes … enqueues the existing job» (1/11) |
| M3 | `auth/access.ts:47` — `assertProjectAccess` без фильтра `workspaceId` | красные: изоляция «user B on A's meeting/project … 404» и «someone else's workspace, project and children answer 404» (2 failed / 33 passed) |
| M4 | `shared/src/api/context.ts:24` → 200 000, shared пересобран | красные: shared `program-contract` (1/120) и api «rejects 50 001» (1/11) |
| M5 | `service.ts:200` — `snapshotHash: null` (снимок не фиксируется) | красный: «start freezes …» (1/11) |
| M6 | `service.ts:136` — захват без условия по статусу | красные: «repeat → 409», «two parallel starts», «not in AWAITING_START → 409» (3/9) |

Каждая мутация откатывалась `git checkout`, дерево чистое после серии.

### Клон и прогоны

- Попытка 1 (`/tmp/orch-review.LQk4dw`, setup из брифа): install 0, db:generate 0; api test **exit 1** (17 файлов упали на нерезолвящемся `@transcrib/shared`, 48 skipped без DB); shared 0; `pnpm -r typecheck` **exit 2** (worker TS6305 — нет `shared/dist`). Сбой инструмента (находка 8), не продукта. Далее каталог перехвачен ревью PR 21 — результаты отброшены.
- Попытка 2 (клон в scratchpad `clones/orch-review.2hv6nU`, HEAD `1c05fcb`, статус чистый): `pnpm install --frozen-lockfile` 0; `db:generate` 0; `shared build` 0; `db:migrate:deploy` 0 (embedded PostgreSQL 16.14 на 127.0.0.1:56431 в scratchpad; 55432/55433 заняты чужими сессиями); `api test` **exit 0 — 24 files, 277 passed** (в т.ч. `context.db.test.ts` 12, `auth-isolation.db.test.ts` 23, `migrations.down` 6, `program-schema` 5); `shared test` **exit 0 — 121 passed**; `pnpm -r typecheck` **exit 0**; `eslint src/features` **exit 0**.
- Ad-hoc тест (не из PR, удалён после прогона): протокол проекта 50 001 символ + `source:'project'` → `/start` 500, статус `AWAITING_START`, `queueAdd` 0 вызовов.
- CI PR: «Lint + Typecheck + Test» **pass**, 1m45s (run 37763856542).

### Не требуется в этом раунде
Правка `shared/src/api/project.ts` (комментарий), рефакторинг `finalizeUpload` ради «общей функции», обработка P2025-гонок.

### Очистка
Клон `…/scratchpad/clones/orch-review.2hv6nU` удалён через `review_clone.sh --cleanup`; scratch-Postgres остановлен, `pg/data` удалён, порт 56431 свободен. `/tmp/orch-review.LQk4dw` уже удалён чужой сессией; `/tmp/orch-review.ERTBp2` принадлежит ревью PR 21 — не трогал. Ни в один репозиторий не писал, в PR не постил, ничего не пушил.

**graph:** спец-граф Neo4j (UC-100, UC проектов, FR-004) я НЕ проверял — это делает оркестратор; Deviation 3 сессии (граф и `.tl/**` не обновлены) остаётся на его сверку.

