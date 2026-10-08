# Сверка — WP-BACKEND-07 (PR https://github.com/ITSalt/transcriber/pull/29, `3f3e6b0583` -> `main @ 06068a32e3`) — 2026-10-08

Раунд 1. Дифф: 15 files changed, 974 insertions(+), 15 deletions(-) (файлов: 15).

**Решение: `ACCEPTED WP-BACKEND-07`** — контракт speakers v1, статус `AWAITING_SPEAKERS`, миграция с down.sql и маршруты реализованы по пакету; дифф аддитивный (server.ts не тронут, фича через реестр — A-15); рецензент в одноразовом PG16: миграция идемпотентна в обе стороны, частично применённая — откатывается в точный каталог, DEFAULT восстанавливается, enum используется одной колонкой → `migrations: safe, reversible`; api 350 passed (speakers.db 16/16, down-тест 4/4, изоляция 24/24), всего 1159; CI run на 3f3e6b0 pass; мутации M1/M2/M3/M6 красные; находки Low/Info.

## Пункты REVISE

нет

### Не требуется

- Не менять паттерн «enqueue после коммита» (L-1) — как у /start и uc-004; reconciliation-воркер для осиротевших PENDING — backlog программы.

## Вопросы владельцу

нет (бэкап БД перед merge — R-21, как для прежних миграций по D-4)

## Принято как есть / backlog

- L-1: нет теста на сбой очереди после коммита (встреча остаётся GENERATING_PROTOCOL + PENDING без записи в очереди; retry требует FAILED) — тот же паттерн, что у /start и uc-004; backlog: reconciliation осиротевших PENDING-заданий.
- L-2: `GET /api/meetings/:id/transcript` в `AWAITING_SPEAKERS` → 409 `STATUS_NOT_READY` (`uc-201.service.ts:20-25`) — экран подтверждения использует образцы из `GET /speakers`, полный транскрипт недоступен до подтверждения; записано в бриф WP-FRONTEND-06; одна строка в api — backlog/следующий backend-пакет.
- Info: тест отказа down.sql не отличает явный RAISE от каст-ошибки PG; образцы режутся посимвольно на 199; `TIMESTAMP(3)` вместо `TIMESTAMPTZ` (как везде в схеме); web-карты статусов (StatusBadge, StatusSection, i18n, catalog TRANSIENT_STATUSES) не знают нового статуса — объём WP-FRONTEND-06.
- Отклонения PR 1–7 приняты (A-15, контракт §4 для воркера, имя файла теста и `downToNAME7`, `UNKNOWN_SPEAKER_LABEL`, нет FR-007-файла, D-17, trim/200/сброс).
- graph: checked — FR-007 spec-complete, UC-505 «Подтвердить спикеров», DEC-013 accepted, ENUM MeetingStatus += AWAITING_SPEAKERS, атрибуты Transcript, UC-200/300/002 stale с program_delta (read-cypher оркестратора 19:18Z, UNLOCK сессии).
- `migrations: safe, reversible` (отчёт рецензента, вопрос 1).
- Слот слияния: после WP-WORKER-MEMORY-02 (в PROD); merge = прод-деплой с миграцией → бэкап БД владельцем (R-21) до доставки.

## Автоматические находки

- **пути и замки**: WP-BACKEND-07: api/src/features/speakers/routes.ts is outside the allowed paths
- **пути и замки**: WP-BACKEND-07: api/src/features/speakers/service.ts is outside the allowed paths
- **пути и замки**: WP-BACKEND-07: api/src/features/speakers/speakers.db.test.ts is outside the allowed paths

Дифф ревизии (пересдачи): —

---

## Отчёт рецензента (дословно)

# Отчёт ревью PR #29 — WP-BACKEND-07 (head `3f3e6b05830db3e3b027fac8c0ae52cec8fa3e65`, база `main @ 06068a32e3`, merge-base = `06068a32e3`)

## 1. Вердикт: **ACCEPT**

Все 7 пунктов объёма и 4 критерия приёмки реализованы и покрыты тестами; дифф аддитивный (ни один существующий маршрут/сервис не изменён, `api/src/server.ts` не тронут, фича подключается через реестр WP-BACKEND-06). Миграция идемпотентна в обе стороны, `down.sql` возвращает точный каталог из полностью и частично применённого состояния, `DEFAULT` на `meetings.status` снимается и восстанавливается, `MeetingStatus` используется только одной колонкой. Атомарный захват статуса — `updateMany … WHERE status = 'AWAITING_SPEAKERS'`, тест двух одновременных PUT есть и красный при мутации. CI на head — pass; локально 1159 тестов зелёные с одноразовым PG16. Находки — Low/Info: отсутствие теста на отказ очереди после коммита (M4 остаётся зелёной, тот же паттерн, что в `/start` и uc-004), `GET /transcript` в `AWAITING_SPEAKERS` отвечает 409 (`uc-201` не знает нового статуса), карты статусов в web без нового значения (ожидаемо, для WP-FRONTEND-06).

`migrations: safe, reversible`

## 2. Объём и критерии → код → статус (head `3f3e6b0`)

| Пункт | Где | Статус |
|---|---|---|
| 1. Контракт `shared/src/api/speakers.ts` (`SpeakerLabel`, `SpeakersResponse`, `SpeakersPutRequest`, `SpeakersPutResponse`) | `shared/src/api/speakers.ts:14-83`, экспорт `shared/src/api/index.ts:19`, тест `shared/src/api/speakers.test.ts` (5 кейсов) | done |
| 2. `MeetingStatus` += `AWAITING_SPEAKERS`, миграция + `down.sql` + DB-тест | `api/prisma/schema.prisma:23-25`, `shared/src/enums.ts:13-14` (→ `MeetingStatusEvent` через `MeetingStatus`), `api/prisma/migrations/20261009120000_awaiting_speakers/{migration.sql,down.sql}`, `api/test/awaiting-speakers.down.db.test.ts` (4 кейса) | done |
| 3. `GET /api/meetings/:id/speakers` | `api/src/features/speakers/routes.ts:20-24`, `service.ts:81-142` (`buildLabels`, `readSpeakers`) | done |
| 4. `PUT /api/meetings/:id/speakers` (confirm/skip, объединение, 409, чужой participant → 404, одна транзакция, `ProtocolGenerationJob`) | `routes.ts:26-30`, `service.ts:144-229`; коды `shared/src/api/errors.ts:32-34,65-66` | done |
| 5. Новый статус в `GET /api/meetings*`, SSE, retry не ломается | статус проходит через общий `MeetingStatus` (uc-002/uc-004 схемы ссылаются на него); retry-тест `speakers.db.test.ts:261-270` | done |
| 6. `.tl/external-contracts/speakers-confirmation.md` | файл, 106 строк, §1–6 | done (см. п. 8 ниже) |
| 7. Тест изоляции с новыми маршрутами | `api/test/auth-isolation.db.test.ts:285-286`; обход всех маршрутов Fastify (`apiRoutes()`, строки 230-238, 313-324) | done |
| AC-1 (DB-тесты, GET 3 метки/2 участника, PUT merge → `{SPEAKER_0:'A',SPEAKER_1:'Гость',SPEAKER_2:'A'}`, skip, повтор 409, чужой 404, не в статусе 409) | `speakers.db.test.ts:112-130, 145-190, 192-198, 200-210, 212-226, 239-248` | done |
| AC-2 (изоляция зелёная, чужая встреча 404) | `auth-isolation.db.test.ts` — 24 passed; «user B on user A's meeting … 404 on every method» обходит оба новых маршрута | done |
| AC-3 (typecheck, test, shared собран, контракт) | `pnpm -r typecheck` exit 0; тесты см. §6 | done |
| AC-4 (в PR: что со встречами в `TRANSCRIBED`) | тело PR, раздел «Что происходит со встречами в TRANSCRIBED» | done |

## 3. Ответы на вопросы риска

**1. Миграция на проде.** `migration.sql` — три оператора, все идемпотентны: `ALTER TYPE "MeetingStatus" ADD VALUE IF NOT EXISTS 'AWAITING_SPEAKERS' BEFORE 'GENERATING_PROTOCOL'` (:9), `ADD COLUMN IF NOT EXISTS "speaker_mapping" JSONB` (:12), `ADD COLUMN IF NOT EXISTS "speakers_confirmed_at" TIMESTAMP(3)` (:13). Без транзакции (Prisma) на PG 17 `ADD VALUE` вне транзакции — штатно; повторный `migrate deploy` после сбоя на любом шаге безопасен благодаря `IF NOT EXISTS`. `down.sql` — одна транзакция (`BEGIN…COMMIT`, :14-36): `DROP COLUMN IF EXISTS` ×2 (:23-24), пересоздание enum через `RENAME TO "MeetingStatus_old"` / `CREATE TYPE` без значения / `DROP DEFAULT` / `ALTER COLUMN … TYPE … USING "status"::text::"MeetingStatus"` / `SET DEFAULT 'CREATED'` / `DROP TYPE "MeetingStatus_old"` (:26-33), удаление строки `_prisma_migrations` (:35). Пересоздание enum корректно и когда `ADD VALUE` не прошёл (тип всегда существует). Использования `MeetingStatus`: `schema.prisma:14` (enum) и `:113` (`Meeting.status @default(CREATED)`) — единственная колонка; grep миграций: только `meetings.status` (`init:17`), индексов/CHECK/вью по `meetings.status` нет (индексы `idx_meetings_workspace_created`, `idx_meetings_project_created` — по другим колонкам). `DEFAULT` снимается и восстанавливается, `catalog()` сравнивает `column_default` и порядок меток enum (`helpers/db.ts:98-105`), тест «down.sql → exact previous schema … idempotent» и «partially applied» (ADD VALUE + первая колонка + failed-строка → deploy заблокирован → down → каталог = reference → re-apply, noDrift) зелёные в моём прогоне. Вывод: **migrations: safe, reversible**.

**2. `migrations.down.db.test.ts`.** Дифф base→head (:152-157, 176, 233-237, 244, 257): единственное изменение — хелпер `downToNAME7`, который перед `runDown(NAME7)` откатывает все более новые миграции (`migrationNames().filter(n > NAME7).reverse()`); все 4 вызова `runDown(workDb, NAME7)` заменены на него. Reference-БД по-прежнему `replayMigrations(refDb, m < NAME7)` с `toHaveLength(6)`, assertions каталога/счётчиков не менялись. Первый describe (20261007) не тронут. Ничего не ослаблено.

**3. PUT-транзакция и очередь.** `service.ts:190-211`: внутри `prisma.$transaction` — flip статуса, запись transcript, upsert `ProtocolGenerationJob` (`PENDING`, счётчики сброшены); `enqueueProtocolGenerationJob` в `try/catch` после коммита (:214-218), ошибка логируется. При отказе Redis остаётся `GENERATING_PROTOCOL` + `PENDING`-задание без записи в очереди; uc-004 retry требует `FAILED` (`uc-004.service.ts:103`) → встреча застревает до ручного вмешательства. Это ровно тот же паттерн, что у `/start` (`context/service.ts:212-219`: `freezeAndStart` в транзакции, `enqueueTranscription` после — ошибка только логируется, встреча остаётся `TRANSCRIBING` + `PENDING`) и у самого uc-004 (`uc-004.service.ts:193-202`, комментарий «A reconciliation worker can re-enqueue orphaned PENDING jobs» — такого воркера в репозитории нет, grep по `orphan|reconcil` даёт только комментарии). Тот же паттерн → принимается; отсутствие теста на этот путь — Low (M4).

**4. Атомарный захват.** `service.ts:192-196`: `tx.meeting.updateMany({ where: { id: meetingId, status: 'AWAITING_SPEAKERS' }, data: { status: 'GENERATING_PROTOCOL' } })`, `flipped.count !== 1` → 409. Плюс предварительная проверка `:154`. Тест двух одновременных PUT — `speakers.db.test.ts:250-259` (`[200, 409]`, одно задание, один enqueue). 409 `MEETING_NOT_AWAITING_SPEAKERS` для `TRANSCRIBED`, `TRANSCRIBING`, `AWAITING_START`, `GENERATING_PROTOCOL`, `PROTOCOL_READY`, `FAILED` — `it.each` `:239-248`. Мутация M1 делает красными все 6 + повтор + concurrent.

**5. Семантика объединения.** `service.ts:180-186`: `nextMap[label] = participantId ? nameOf.get(participantId) : free` — две метки на одного участника получают одно и то же имя; тест `:160` проверяет `{SPEAKER_0:'Анна', SPEAKER_1:'Гость', SPEAKER_2:'Анна'}`. Контракт §3 (:70-72) «все получают одно имя», §4 (:91-92) «при слиянии несколько меток имеют одно имя — воркер подставляет его как есть», §5 — «разделять нельзя», без повторной диаризации. Сброс пустой записи в «Speaker N» — контракт :71 («пустая запись = null («Speaker N»)»), сохранение неперечисленных меток — :72; тест `:192-198`. Метка вне `segments_blob` → 400 `UNKNOWN_SPEAKER_LABEL` (`service.ts:164`), дубль → 400 тот же код (`:165`); контракт :74-75; тест `:228-237`. M6 делает дубль-тест красным.

**6. Изоляция.** Оба маршрута под `/api/meetings/:id` → `preValidation`-хук auth-плагина (`auth/routes.ts:152-162`) вызывает `assertMeetingAccess` (`access.ts:32-41`: `findFirst` по `workspaceIds` → `notFound()`), т.е. чужая/несуществующая → 404 до обработчика; тест изоляции обходит все маршруты Fastify и упал бы на новом параметре (`KNOWN_PARAMS`, :240-257) — оба маршрута используют `:id`. Чужой `participant_id` → `notFound()` (404, не 400) — `service.ts:168-178`, тест `:212-226` (и встреча без проекта → 404). Legacy-principal: при `AUTH_REQUIRED=false` `onRequest` подставляет `LEGACY_AUTH` (`auth/routes.ts:145-146`) — доступ разрешён к встречам legacy-workspace; `speakers.db.test.ts` работает именно так (`AUTH_REQUIRED: false`, `LEGACY_WS`). При `AUTH_REQUIRED=true` без сессии → 401 (тест «without a session … 401 everywhere», обходит и новые маршруты). Добавлены 2 строки в список `arrayContaining` (:285-286), это проверка «список маршрутов действительно от Fastify», покрытие обеспечивается обходом.

**7. Образцы.** `truncate` (`service.ts:76-79`): пробелы схлопываются, обрезка **по символу** на 199 знаках + `…` — не по границе слова. `start_ms = Math.round(s.start * 1000)` — целое (:108, Zod `int()`). `duration_sec` = сумма `max(0, end − start)` с округлением до 0.1 (float) (:106); тест ожидает `65` для SPEAKER_0. Три самые длинные по длительности (не по длине текста!), пустые тексты отбрасываются, затем сортировка по времени (:97-101). `segments_blob` не массив / пустой → `segmentsOf` отдаёт `[]` → `labels: []`, 200 (:43-44); транскрипта нет → 409 (:131), не 500.

**8. Полнота контракта.** В `speakers-confirmation.md` есть: когда воркер ставит статус — только при `meeting_contexts.snapshot_hash IS NOT NULL`, вместо `TRANSCRIBED` и без создания `ProtocolGenerationJob` (§2:19-23); поток статусов и SSE (кто публикует что, :25-27); GET-доступность по статусам и 409 (:36-38); форма ответа с семантикой каждого поля (:40-59); PUT: только в `AWAITING_SPEAKERS`, повтор/гонка (:68-69), confirm с приоритетом participant → name → null = «Speaker N», объединение, сохранение неперечисленных (:70-72), skip (:73), коды ошибок 404/400/400 (:74-75), транзакция и постановка после коммита, поведение при сбое очереди (:76-79); таблица «кто пишет/читает speaker_map» (§4); требование воркеру пересобрать текст из `segments_blob + speaker_map` при `speakers_confirmed_at IS NOT NULL` (:89-91); retry использует сохранённую карту (:92-93); ограничение «объединять/не разделять» (§5); миграция и откат (§6). Правило `display = Speaker (N+1)` совпадает с воркером (`transcription.ts:133-139`). Отсутствует (не блокирует): явная ссылка на лимиты `name ≤ 200`, `mapping ≤ 100` (есть только в Zod, на который контракт ссылается); не сказано, что `GET /api/meetings/:id/transcript` в `AWAITING_SPEAKERS` отвечает 409 (см. находку L-2) — для WP-FRONTEND-06 это важно знать.

**9. Карты статусов в коде.** Typecheck ловит только `Record<MeetingStatus, …>`; таких нет. Рантайм-пробелы: `web/src/i18n/ru.json:33-42` и `en.json:33-42` — нет ключа `catalog.status.AWAITING_SPEAKERS` → `StatusBadge.tsx:26` покажет сырую строку `AWAITING_SPEAKERS` (defaultValue), вариант `outline` (`StatusBadge.tsx:9-22`); `web/src/routes/meeting/components/StatusSection.tsx:37-42` `TRANSCRIPT_STATUSES` без нового статуса → «View transcript» выключена при подтверждении; `web/src/routes/catalog/index.tsx:16-20` `TRANSIENT_STATUSES` — новый статус не «переходный» (ожидание пользователя), не поллится — корректно, но решать FE-06. Все три — WP-FRONTEND-06. На стороне api: `api/src/services/uc-201.service.ts:20-25` `TRANSCRIPT_READY_STATUSES` без `AWAITING_SPEAKERS` → `GET /api/meetings/:id/transcript` и download → 409 `STATUS_NOT_READY` (находка L-2). Worker: switch/карт по `MeetingStatus` нет (только записи `TRANSCRIBED`, `transcription.ts:313-316`).

**10. Мутации** — см. таблицу в §6. M1, M2, M3, M6 красные; M4 и M5 зелёные (объяснение там же).

**11. Что убрано из базы.** Ничего: дифф по `api/src` — только новая папка `features/speakers/` (15 файлов, +974/−15, минусы — переформатирование `schema.prisma` и замены `runDown` в тесте). Существующие маршруты не менялись; enum расширен; `uc-004.test.ts` без изменений и зелёный; retry после `FAILED` с картой — `speakers.db.test.ts:261-270` (карта сохраняется, статус `GENERATING_PROTOCOL`); без карты — прежние uc-004 тесты. Из `AWAITING_SPEAKERS` выход только через PUT (по D-38), удаление встречи (uc-003) возможно — guard только по `PROCESSING`-заданиям (`uc-003.service.ts:59-64`).

## 4. Находки

**Low**
- **L-1** `api/src/features/speakers/service.ts:214-218` — нет теста на сбой `enqueueProtocolGenerationJob` после коммита (M4 зелёная: мок всегда успешен). Сценарий: Redis недоступен → 200, `GENERATING_PROTOCOL` + `PENDING`-задание без очереди → retry даёт 409 `MEETING_NOT_FAILED`, встреча стоит. Паттерн идентичен `/start` и uc-004, поэтому не регрессия; требовать: тест «enqueue reject → 200, статус/задание консистентны» (как минимум в следующем пакете этой области) и/или зафиксировать в backlog reconciliation-воркер, на который ссылаются комментарии `uc-004.service.ts:202`, `uc-100.service.ts:269`.
- **L-2** `api/src/services/uc-201.service.ts:20-25` — `TRANSCRIPT_READY_STATUSES` не содержит `AWAITING_SPEAKERS`: при наличии транскрипта `GET /api/meetings/:id/transcript` и `/transcript/download` в этом статусе отвечают 409 `STATUS_NOT_READY`. Не регрессия (статус новый), не в объёме пакета, но экран WP-FRONTEND-06 не сможет показать полный транскрипт во время подтверждения, а в контракте это не оговорено. Требовать: либо добавить статус в набор (одна строка, путь `api/src/services/**` разрешён) с тестом, либо явно записать ограничение в контракт/бриф WP-FRONTEND-06.

**Info**
- **I-1** `api/test/awaiting-speakers.down.db.test.ts:58-62` — M5 (удалён блок `DO $$ … RAISE EXCEPTION`) остаётся зелёной: Postgres сам падает на `USING "status"::text::"MeetingStatus"` с `invalid input value for enum "MeetingStatus": "AWAITING_SPEAKERS"` (воспроизведено на моей БД, enum и колонки не изменились), что матчится `/AWAITING_SPEAKERS/`. Защита реальная (атомарная), но тест не различает явный отказ и каст-ошибку; можно ужесточить regex до текста `resolve them first`.
- **I-2** `service.ts:76-79` — образец обрезается на 199 символах посимвольно + `…`, не по границе слова. Контракт обещает только «≤ 200 знаков», противоречия нет.
- **I-3** `migration.sql:13` — `speakers_confirmed_at TIMESTAMP(3)`, а не `TIMESTAMPTZ` из шапки пакета; совпадает со всеми остальными timestamp-колонками схемы (`init:19-20,43-44`) и с Prisma `DateTime`. Незаявленное отклонение — принять.
- **I-4** Web-карты статусов (`StatusBadge.tsx:9-22`, `StatusSection.tsx:37-42`, `i18n/{ru,en}.json:33-42`, `catalog/index.tsx:16-20`) не знают `AWAITING_SPEAKERS` — ожидаемо, перечислить в брифе WP-FRONTEND-06.

## 5. Deviations из тела PR

1. `api/src/features/speakers/` — **принято** (A-15; реестр `features/index.ts:36-46` подключает папку, `git diff … -- api/src/server.ts` пустой).
2. `raw_text` не переписывается, требование к WP-WORKER-06 — **принято**, зафиксировано в контракте §4:89-91 и в шапке `service.ts:5-7`.
3. Имя файла-образца; правка describe WP-BACKEND-01 — **принято**, изменение только `downToNAME7` (вопрос 2).
4. `UNKNOWN_SPEAKER_LABEL` (400) — **принято**, в `PROGRAM_ERRORS`/`PROGRAM_ERROR_MESSAGES`, контракте и тестах.
5. Нет `.tl/feature-requests/FR-007*.md` — **принято** (граф — источник истины, оркестратор подтвердил FR-007 в графе).
6. AGENTS.md/instructions sync не трогались — **принято** по D-17.
7. Trim/200 знаков, пустая запись → «Speaker N», неперечисленные сохраняются — **принято**, документировано в контракте :70-72 и покрыто `speakers.db.test.ts:192-198`.
Незаявленное: `TIMESTAMP(3)` вместо `TIMESTAMPTZ` (I-3) — принять.

## 6. CI, размер, тесты, мутации

- CI: `gh pr checks 29` → `Lint + Typecheck + Test  pass  5m8s` на `3f3e6b0` (в начале ревью было pending).
- Размер: 15 файлов, +974/−15 (M).
- Клон: `review_clone.sh --sha 3f3e6b0… --setup 'pnpm install --frozen-lockfile' (exit 0) --setup 'pnpm --filter @transcrib/api run db:generate' (exit 0) --setup 'pnpm --filter @transcrib/shared build' (exit 0) --test 'pnpm -r typecheck' (exit 0) --keep`; `git rev-parse HEAD` = `3f3e6b05830db3e3b027fac8c0ae52cec8fa3e65`.
- Postgres: бинарники `embedded-postgres` 16.9 скопированы в scratchpad; `initdb -D …/pg/data -U review -A trust` (exit 0); `pg_ctl … -o "-p 47071 -k '' -c listen_addresses=127.0.0.1" start` (exit 0, порт выбран свободный, не 5432).
- `DATABASE_URL=postgresql://<пользователь>@127.0.0.1:47071/postgres pnpm --filter @transcrib/api run db:migrate:deploy` → exit 0, «All migrations have been successfully applied» (вкл. `20261009120000_awaiting_speakers`).
- `pnpm --filter @transcrib/api test` → exit 0: 29 files passed | 1 skipped, **350 passed | 7 skipped**; в т.ч. `awaiting-speakers.down.db.test.ts` 4/4, `migrations.down.db.test.ts` 6/6, `speakers.db.test.ts` 16/16, `auth-isolation.db.test.ts` 24/24 (последние два прогнаны и отдельно: 40 passed).
- `pnpm --filter @transcrib/shared test` → exit 0: 136 passed | 11 skipped. `pnpm --filter @transcrib/web test` → exit 0: 245 passed. `pnpm --filter @transcrib/worker test` → exit 0: 428 passed | 8 skipped. Итого 1159 passed — совпадает с заявкой PR.

| Мутация | Что изменено | Тест | Результат |
|---|---|---|---|
| M1 | `service.ts:154` guard → `!meeting.transcript`; `:193` `where` без `status` | `speakers.db.test.ts` | **RED** 8/16: PUT confirm with a merge; PUT in TRANSCRIBED/TRANSCRIBING/AWAITING_START/GENERATING_PROTOCOL/PROTOCOL_READY/FAILED → 409; two concurrent PUTs |
| M2 | удалён `:170`, `:173` без `projectId` | то же | **RED** 1/16: another project's participant → 404 |
| M3 | удалена `:202 speakersConfirmedAt` | то же | **RED** 2/16: PUT confirm with a merge; PUT skip |
| M4 | enqueue перенесён внутрь `$transaction`, post-commit блок удалён | то же | **GREEN** 16/16 — нет теста с отказом очереди (L-1) |
| M5 | из `down.sql` удалён блок `DO $$ … RAISE EXCEPTION` | `awaiting-speakers.down.db.test.ts` | **GREEN** 4/4 — каст-ошибка PG содержит `AWAITING_SPEAKERS`, откат атомарен (I-1, воспроизведено вручную) |
| M6 | удалена `:165` проверка дубля | `speakers.db.test.ts` | **RED** 1/16: unknown / duplicate label → 400 |

Каждая мутация откачена `git checkout`, `git status` клона чист перед следующей.

## 7. Очистка

- Клон удалён: `review_clone.sh --cleanup …/scratchpad/clones/orch-review.i233G4` → «removed …», exit 0.
- Postgres остановлен (`pg_ctl stop -m fast` → «server stopped», exit 0), каталог `…/scratchpad/pg` (бинарники + data) и `…/scratchpad/clones` удалены; порт 47071 не слушается.
- Основной checkout `/home/cloudpc/projects/transcriber` не менялся (`git status`: только исходный ` M config.yaml`). В рабочее пространство оркестратора ничего не писалось; PR не комментировался, не аппрувился, не мержился.
