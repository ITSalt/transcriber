# WP-BACKEND-07 — Подтверждение спикеров: контракт, статус AWAITING_SPEAKERS, API карты спикеров

| Поле | Значение |
|------|----------|
| Поток | backend (area) |
| Репозиторий | /home/cloudpc/projects/transcriber |
| Базовая ветка | main |
| Линия | main |
| Рабочая ветка | `feature/wp-backend-07-speakers` |
| Worktree | `.claude/worktrees/wp-backend-07-speakers` (создаёт `claude -w wp-backend-07-speakers`) |
| Заголовок PR | `[PRODUCT] WP-BACKEND-07: Подтверждение спикеров: контракт, статус AWAITING_SPEAKERS, API карты спикеров` |
| Сессия | `product-backend` |
| Модель | `sonnet` |
| Усилие | — |
| Почему такая модель | модель реализатора по умолчанию (orch.yaml models.implement) |
| Режим | nacl, spec-first: `/nacl-sa-feature` (UC «Подтвердить спикеров» в FR-004/UC-200, статус AWAITING_SPEAKERS в домене) под замком `graph`, затем `/nacl-tl-dev-be` по TDD, `/nacl-tl-review --be` |
| Команды методологии: разрешены | nacl: `nacl-tl-dev-be`, `nacl-tl-dev`, `nacl-tl-fix`, `nacl-tl-review`, `nacl-tl-regression-test`, `nacl-tl-verify-code`, `nacl-tl-sync`, `nacl-tl-docs`, `nacl-tl-stubs`, `nacl-sa-uc`, `nacl-sa-domain`, `nacl-sa-feature`, `nacl-sa-validate`, `nacl-tl-plan`, `nacl-tl-status` |
| Команды методологии: запрещены | `nacl-tl-release`, `nacl-tl-deploy`, `nacl-tl-deliver`, `nacl-tl-hotfix`, `nacl-tl-ship`, `nacl-tl-conductor`, `nacl-tl-full`, `nacl-goal`, `nacl-publish` |
| Разрешённые пути | `api/{prisma.config.ts,tsconfig.json,vitest.config.ts,README.md}`, `api/prisma/**`, `api/scripts/**`, `api/test/**`, `api/src/{config.ts,db.ts,index.ts,queue.ts,server.test.ts,prisma.smoke.test.ts,queue.test.ts,queue.regression.test.ts}`, `api/src/{lib,plugins,routes,services,sse,storage}/**`, `api/src/features/auth/**` |
| Общие пути, которые трогает пакет | `shared/**` (новый `shared/src/api/speakers.ts`, `MeetingStatus` в `shared/src/api/uc002.ts`, экспорт), `api/prisma/**` (миграция), `.tl/external-contracts/**` (новый `speakers-confirmation.md`: контракт для worker и web) |
| Миграции | да: одна миграция (значение `AWAITING_SPEAKERS` в `MeetingStatus`; `transcripts.speaker_mapping` JSONB NULL и `transcripts.speakers_confirmed_at` TIMESTAMPTZ NULL) + `down.sql` (правило `.tl/deploy-plan.md` §5; `ADD VALUE` у enum необратим — зафиксировать в down.sql комментарием и тестом по образцу `api/test/program-schema.down.db.test.ts`) |
| Ресурсы (замки) | `migrations`, `graph` по запросу |
| Тестовая БД и порты | нет; нет |
| Слот слияния | <место в очереди слияний, задаётся при приёмке> |
| Контракт | определяет контракт speakers v1 (ниже) — потребляют WP-WORKER-06 и WP-FRONTEND-06; `MeetingStatusEvent` (SSE) получает новый статус |
| Зависит от | нет (все пакеты программы в PROD) |
| Размер | M |
| Спецификация | FR-004, UC-200 (транскрипция), UC-002 (карточка), RQ-016, RQ-017 (имена спикеров), BRQ-008 |
| Граф | UC «Подтвердить спикеров» (новый или расширение UC-200) через `/nacl-sa-feature`; статус `AWAITING_SPEAKERS` в домене |
| Решения | D-38, D-21, D-9 (образец отложенного старта), D-17 |

Общие пути этого репозитория (объяви те, что трогает пакет): `pnpm-lock.yaml`, `package.json`, `**/package.json`, `shared/**`, `api/prisma/**`, `.tl/{status.json,master-plan.md,changelog.md,release-status.json,deploy-plan.md}`, `.tl/external-contracts/**`, `graph-infra/**`, `config.yaml`, `CLAUDE.md`, `api/src/server.ts`, `worker/src/index.ts`, `worker/src/job-processor.ts`, `worker/src/queues.ts`, `web/src/App.tsx`, `web/src/i18n/**`.
Ресурсы этого репозитория, требующие замка: `migrations`, `graph` (по запросу: LOCK/UNLOCK, см. раздел 6), `dev-stack` (по запросу: LOCK/UNLOCK, см. раздел 6).

## 0. Подготовка worktree

1. Переключи worktree на ветку пакета: `git fetch origin && git switch -c feature/wp-backend-07-speakers origin/main`.
2. Подготовь worktree (команды из `orch.yaml`, выполнять внутри worktree):

   ```bash
   pnpm install --frozen-lockfile
   pnpm --filter @transcrib/api run db:generate
   ```
3. Правь только разрешённые пути; общие пути — только объявленные в шапке и после получения замка.

## 1. Факты

- Аналитика обратной связи 2026-10-08 (`reports/feedback-analysis-20261008.md`): из 18 пунктов пользователя 7 — про имена/роли спикеров, 2 — про диаризацию, 1 новая находка — утечка памяти проекта и списка участников в протокол чужой встречи. Решение владельца — D-38.
- Правило промпта `<speaker_mapping>` (`worker/src/llm/prompts/ru/protocol-context.md:45-52`): «Speaker N» заменяется именем только при явном свидетельстве в транскрипте; список участников, их число и порядок реплик — не свидетельство. Поэтому в протоколах 12.05 (8 голосов) 7 меток остались без имён, а Haiku 5.5 при попытке сопоставить ошиблась (TCB B: Speaker 1 → Роман Клин без свидетельства).
- Карта спикеров уже существует: `transcripts.speaker_map` JSONB `{ "SPEAKER_0": "Имя" | null }` заполняется `resolveSpeakers` (`worker/src/jobs/transcription.ts:76-108`, по самопредставлению), `raw_text` строится `buildFullText(segments, speakerMap)` (`:116`) как строки `[MM:SS] Имя|Speaker N: текст`; сегменты с метками — `transcripts.segments_blob` (`{start,end,text,speaker}`); промпт понимает строки `"[MM:SS] Name: text"` (`protocol-context.md:26`). Генерация читает `transcript.rawText` (`worker/src/jobs/protocol-generation.ts:322,328`).
- После распознавания воркер сразу ставит `TRANSCRIBED` и создаёт `ProtocolGenerationJob` (`transcription.ts:313-316, 334`, RQ-016). Статусы: `MeetingStatus` в `api/prisma/schema.prisma:14-27` (есть `AWAITING_START` из D-9) и `shared/src/api/uc002.ts`; retry — `api/src/routes/uc-004.ts`, постановка задания из api — `api/src/queue.ts:74 enqueueProtocolGenerationJob`.
- Deepgram: число спикеров до диаризации не доходит и в документации диаризации параметра нет (D-21, `worker/src/asr/deepgram-adapter.ts:219-223`); диаризация вариативна (12.05: 7→8→8 голосов; TCB: 3→4→3). Пересегментация (один человек — две метки) лечится объединением меток при подтверждении; недосегментация (двое — одна метка, 20.05 Степан/Ярослав) без повторной диаризации не лечится — ограничение.

## 2. Объём

1. Контракт `shared/src/api/speakers.ts` (Zod): `SpeakerLabel { label: 'SPEAKER_n', display: 'Speaker N', duration_sec, segment_count, samples: [{ start_ms, text }] (3 самые длинные реплики, ≤ 200 знаков каждая), name: string|null, participant_id: uuid|null }`; `SpeakersResponse { meeting_id, status, project_id|null, participants: [{ id, name, role, organization }] (участники проекта), labels: SpeakerLabel[], confirmed_at|null }`; `SpeakersPutRequest { action: 'confirm'|'skip', mapping: [{ label, participant_id?: uuid|null, name?: string|null }] }` — несколько меток могут указывать на одного человека (объединение); `name` без `participant_id` — произвольное имя; пустая запись = оставить «Speaker N». Ответ PUT — `{ meeting_id, status: 'GENERATING_PROTOCOL' }`.
2. `MeetingStatus` += `AWAITING_SPEAKERS` (Prisma enum + `shared/src/api/uc002.ts` + `MeetingStatusEvent`); миграция с down.sql и DB-тестом (см. шапку). Семантика: распознано, ждёт подтверждения спикеров; устанавливает воркер (WP-WORKER-06) только для встреч, запущенных с контекстом (`meeting_contexts.snapshot_hash` не NULL); остальные идут по старому потоку.
3. `GET /api/meetings/:id/speakers` — для статусов `AWAITING_SPEAKERS` и позже; собирает метки из `segments_blob` (длительность, число сегментов, 3 образца), текущие имена из `speaker_map`, участников проекта встречи; изоляция как у остальных маршрутов встречи (хук `meetingAccess`).
4. `PUT /api/meetings/:id/speakers` — только в `AWAITING_SPEAKERS` (иначе 409 `MEETING_NOT_AWAITING_SPEAKERS`, код в `PROGRAM_ERRORS`); проверяет, что `participant_id` принадлежит проекту встречи (чужой → 404); в одной транзакции пишет `transcripts.speaker_map` (label → имя участника или `name` или null), `speaker_mapping` (сырой запрос с participant_id), `speakers_confirmed_at`, переводит встречу в `GENERATING_PROTOCOL` и создаёт `ProtocolGenerationJob` через `enqueueProtocolGenerationJob` (как uc-004); `action: 'skip'` — то же без имён. Повторный PUT → 409.
5. `GET /api/meetings/:id` и список задач отдают новый статус; SSE `meeting.status` с ним; `uc-004` retry не ломается (FAILED после подтверждения — повтор генерации с сохранённой картой).
6. `.tl/external-contracts/speakers-confirmation.md`: маршруты, формы, кто пишет `speaker_map` (воркер — предзаполнение, api — подтверждение, воркер — чтение при генерации), ограничение «объединять можно, разделять нельзя».
7. Тест изоляции: новые маршруты классифицированы (`api/test/auth-isolation.db.test.ts`, допустимо вне путей — A-14).

### Не входит

- merge, деплой, PROD, запись в БД
- другие модули и рабочее пространство оркестратора
- файлы вне разрешённых путей; общие пути, не объявленные выше
- подъём версий и release notes, если не перечислены выше

## 3. Критерии приёмки

1. DB-тесты: миграция вверх/вниз по образцу `program-schema.down.db.test.ts`; `GET /speakers` на встрече с 3 метками и проектом с 2 участниками отдаёт 3 метки с образцами и 2 участников; `PUT confirm` с объединением (`SPEAKER_0`→участник A, `SPEAKER_2`→участник A, `SPEAKER_1`→name «Гость») пишет `speaker_map {SPEAKER_0:'A', SPEAKER_1:'Гость', SPEAKER_2:'A'}`, статус `GENERATING_PROTOCOL`, одно задание генерации; `skip` — имена не меняются; повтор → 409; чужой `participant_id` → 404; не в `AWAITING_SPEAKERS` → 409.
2. Тест изоляции WP-BACKEND-01 зелёный с новыми маршрутами; чужая встреча → 404.
3. `pnpm -r typecheck`, `pnpm test` зелёные; контракт в `shared` собран; `.tl/external-contracts/speakers-confirmation.md` описывает всё, что нужно worker и web без чтения кода api.
4. В PR: что происходит со встречами, которые уже в `TRANSCRIBED` на момент деплоя (ничего — новый статус ставит только воркер после деплоя WP-WORKER-06).

## 4. Порядок сдачи

- PR из `feature/wp-backend-07-speakers` в `main`; не мержить.
- Тело PR = отчёт разработки + `Deviations` (чем результат отличается от пакета и почему).
- Затем сообщение `product-coord`: `[PRODUCT] READY WP-BACKEND-07 :: <sha> :: ref=<PR URL>`.

## 5. Start prompt

```text
Прочитай /home/cloudpc/projects/transcriber-orch/docs/orchestration/product/work-packages/WP-BACKEND-07-speakers.md и выполни. Сначала раздел 0 (подготовка worktree). Ветка feature/wp-backend-07-speakers от origin/main, PR в main, не мержить. По готовности — сообщение product-coord: [PRODUCT] READY WP-BACKEND-07 :: <sha> :: ref=<PR URL>

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
cd /home/cloudpc/projects/transcriber && claude -w wp-backend-07-speakers --model sonnet --name product-backend "Прочитай /home/cloudpc/projects/transcriber-orch/docs/orchestration/product/work-packages/WP-BACKEND-07-speakers.md и выполни. Сначала раздел 0 (подготовка worktree). Ветка feature/wp-backend-07-speakers от origin/main, PR в main, не мержить. По готовности — сообщение product-coord: [PRODUCT] READY WP-BACKEND-07 :: <sha> :: ref=<PR URL>

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
- Пришли `product-coord`: `[PRODUCT] QUESTION WP-BACKEND-07 :: отказ: <точный текст отказа> :: ref=<команда>`; продолжай работу, которой это не нужно, или жди `ANSWER`.
- Ресурсы по запросу (`graph`, `dev-stack`): перед использованием пришли `product-coord`: `[PRODUCT] LOCK WP-BACKEND-07 :: <ресурс> :: ref=<зачем>` и жди `ACK`; как только закончишь — `[PRODUCT] UNLOCK WP-BACKEND-07 :: <ресурс> :: ref=<результат>`. READY возвращает все замки по запросу.

## Пересдачи

<Циклы REVISE: дата, пункты, коммит.>
