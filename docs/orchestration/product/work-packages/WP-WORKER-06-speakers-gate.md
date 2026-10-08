# WP-WORKER-06 — Воркер: остановка на AWAITING_SPEAKERS, имена спикеров в транскрипте и промпте

| Поле | Значение |
|------|----------|
| Поток | worker (area) |
| Репозиторий | /home/cloudpc/projects/transcriber |
| Базовая ветка | main |
| Линия | main |
| Рабочая ветка | `feature/wp-worker-06-speakers-gate` |
| Worktree | `.claude/worktrees/wp-worker-06-speakers-gate` (создаёт `claude -w wp-worker-06-speakers-gate`) |
| Заголовок PR | `[PRODUCT] WP-WORKER-06: Воркер: остановка на AWAITING_SPEAKERS, имена спикеров в транскрипте и промпте` |
| Сессия | `product-worker` |
| Модель | `sonnet` |
| Усилие | — |
| Почему такая модель | модель реализатора по умолчанию (orch.yaml models.implement) |
| Режим | nacl: `/nacl-tl-dev-be` по TDD (UC-200/UC-300 расширение по контракту BACKEND-07), `/nacl-tl-review --be`; граф — только если BACKEND-07 оставил узлы worker-части (`graph` по запросу) |
| Команды методологии: разрешены | nacl: `nacl-tl-dev-be`, `nacl-tl-dev`, `nacl-tl-fix`, `nacl-tl-review`, `nacl-tl-regression-test`, `nacl-tl-verify-code`, `nacl-tl-sync`, `nacl-tl-docs`, `nacl-tl-stubs`, `nacl-sa-uc`, `nacl-sa-domain`, `nacl-sa-feature`, `nacl-sa-validate`, `nacl-tl-plan`, `nacl-tl-status` |
| Команды методологии: запрещены | `nacl-tl-release`, `nacl-tl-deploy`, `nacl-tl-deliver`, `nacl-tl-hotfix`, `nacl-tl-ship`, `nacl-tl-conductor`, `nacl-tl-full`, `nacl-goal`, `nacl-publish` |
| Разрешённые пути | `worker/{tsconfig.json,vitest.config.ts}`, `worker/test/**`, `worker/src/{asr,jobs,lib,llm}/**`, `worker/src/{config.ts,config.test.ts,logger.ts,shutdown.ts,shutdown.test.ts,job-processor.test.ts,queues.test.ts,queues.regression.test.ts}` |
| Общие пути, которые трогает пакет | нет (контракт из `shared` читается; `worker/src/job-processor.ts`/`queues.ts` не менять — очереди прежние) |
| Миграции | нет |
| Ресурсы (замки) | `graph` по запросу |
| Тестовая БД и порты | нет; нет |
| Слот слияния | <место в очереди слияний, задаётся при приёмке> |
| Контракт | потребляет speakers v1 (`.tl/external-contracts/speakers-confirmation.md`, `shared/src/api/speakers.ts`) |
| Зависит от | WP-BACKEND-07 (в main) |
| Размер | S |
| Спецификация | UC-200, UC-300, RQ-016, RQ-017 |
| Граф | нет (или шаги UC-200, если BACKEND-07 укажет) |
| Решения | D-38, D-21 |

Общие пути этого репозитория (объяви те, что трогает пакет): `pnpm-lock.yaml`, `package.json`, `**/package.json`, `shared/**`, `api/prisma/**`, `.tl/{status.json,master-plan.md,changelog.md,release-status.json,deploy-plan.md}`, `.tl/external-contracts/**`, `graph-infra/**`, `config.yaml`, `CLAUDE.md`, `api/src/server.ts`, `worker/src/index.ts`, `worker/src/job-processor.ts`, `worker/src/queues.ts`, `web/src/App.tsx`, `web/src/i18n/**`.
Ресурсы этого репозитория, требующие замка: `migrations`, `graph` (по запросу: LOCK/UNLOCK, см. раздел 6), `dev-stack` (по запросу: LOCK/UNLOCK, см. раздел 6).

## 0. Подготовка worktree

1. Переключи worktree на ветку пакета: `git fetch origin && git switch -c feature/wp-worker-06-speakers-gate origin/main`.
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

1. `transcription.ts` шаг 10: если у встречи заморожен контекст (`meeting_contexts.snapshot_hash` не NULL) — статус `AWAITING_SPEAKERS`, SSE-событие, задание генерации НЕ создаётся; иначе прежний поток (`TRANSCRIBED` → задание). Предзаполнение `speaker_map` через `resolveSpeakers` остаётся.
2. `protocol-generation.ts`: текст для промпта строить из `segments_blob` + актуальной `speaker_map` (`buildFullText`) и сохранять в `transcripts.raw_text` перед генерацией (чтобы скачивание транскрипта и память проекта видели имена); при отсутствии сегментов — прежний `raw_text`.
3. Промпт `protocol-context.md`: в `<speaker_mapping>` добавить правило: имя в строке транскрипта («[MM:SS] Имя: …») — подтверждённый пользователем факт, использовать как есть; оставшиеся «Speaker N» — по прежним правилам. Паритет промпта для встреч без подтверждения — байт-в-байт.
4. Память проекта (`worker/src/memory/*` не трогать): пайплайн читает тот же `raw_text` — имена доходят автоматически; подтвердить тестом в своей области (чтение `raw_text`).
5. Не менять: адаптер Deepgram, очереди, классификацию ошибок.

### Не входит

- merge, деплой, PROD, запись в БД
- другие модули и рабочее пространство оркестратора
- файлы вне разрешённых путей; общие пути, не объявленные выше
- подъём версий и release notes, если не перечислены выше

## 3. Критерии приёмки

1. Тесты `transcription.ts`: с замороженным контекстом → `AWAITING_SPEAKERS`, задание генерации не создано, SSE отправлен; без контекста → прежнее поведение (регрессионные тесты зелёные).
2. Тесты `protocol-generation.ts`: `speaker_map {SPEAKER_0:'Антон', SPEAKER_1:null}` → в промпте строки `[..] Антон:` и `[..] Speaker 2:`; `raw_text` обновлён; без `segments_blob` — прежний текст.
3. Снапшот промпта без карты спикеров не изменился байт-в-байт; с картой — новое правило присутствует.
4. `pnpm -r typecheck`, `pnpm test` зелёные.

## 4. Порядок сдачи

- PR из `feature/wp-worker-06-speakers-gate` в `main`; не мержить.
- Тело PR = отчёт разработки + `Deviations` (чем результат отличается от пакета и почему).
- Затем сообщение `product-coord`: `[PRODUCT] READY WP-WORKER-06 :: <sha> :: ref=<PR URL>`.

## 5. Start prompt

```text
Прочитай /home/cloudpc/projects/transcriber-orch/docs/orchestration/product/work-packages/WP-WORKER-06-speakers-gate.md и выполни. Сначала раздел 0 (подготовка worktree). Ветка feature/wp-worker-06-speakers-gate от origin/main, PR в main, не мержить. По готовности — сообщение product-coord: [PRODUCT] READY WP-WORKER-06 :: <sha> :: ref=<PR URL>

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
cd /home/cloudpc/projects/transcriber && claude -w wp-worker-06-speakers-gate --model sonnet --name product-worker "Прочитай /home/cloudpc/projects/transcriber-orch/docs/orchestration/product/work-packages/WP-WORKER-06-speakers-gate.md и выполни. Сначала раздел 0 (подготовка worktree). Ветка feature/wp-worker-06-speakers-gate от origin/main, PR в main, не мержить. По готовности — сообщение product-coord: [PRODUCT] READY WP-WORKER-06 :: <sha> :: ref=<PR URL>

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
- Пришли `product-coord`: `[PRODUCT] QUESTION WP-WORKER-06 :: отказ: <точный текст отказа> :: ref=<команда>`; продолжай работу, которой это не нужно, или жди `ANSWER`.
- Ресурсы по запросу (`graph`, `dev-stack`): перед использованием пришли `product-coord`: `[PRODUCT] LOCK WP-WORKER-06 :: <ресурс> :: ref=<зачем>` и жди `ACK`; как только закончишь — `[PRODUCT] UNLOCK WP-WORKER-06 :: <ресурс> :: ref=<результат>`. READY возвращает все замки по запросу.

## Пересдачи

<Циклы REVISE: дата, пункты, коммит.>
