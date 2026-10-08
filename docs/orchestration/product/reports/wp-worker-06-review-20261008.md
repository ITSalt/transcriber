# Сверка — WP-WORKER-06 (PR https://github.com/ITSalt/transcriber/pull/30, `a87e135916` -> `main @ 2e131fe287`) — 2026-10-08

Раунд 1. Дифф: 8 files changed, 284 insertions(+), 55 deletions(-) (файлов: 8).

**Решение: `ACCEPTED WP-WORKER-06`** — гейт AWAITING_SPEAKERS в той же транзакции, без задания и enqueue на этом пути; текст промпта из `segments_blob` + `speaker_map` с записью в `raw_text`; правило промпта про подтверждённые имена (RU/EN), паритет без карты байт-в-байт; CI pass, worker 478 passed, мутации M1–M6 убиты; регрессий нет (legacy-поток без контекста не изменён); находки Low/Info.

## Пункты REVISE

нет

### Не требуется

—

## Вопросы владельцу

нет

## Принято как есть / backlog

- L-1: gate-тест не проверяет `include: { context: true }` в запросе (мутация ловится чужим keyterms-тестом и typecheck); backlog: одно ожидание в `transcription.speakers-gate.test.ts`.
- L-2: `raw_text` пересобирается при любых валидных сегментах, без проверки `speakers_confirmed_at` (контракт §4) — идемпотентно и безвредно; принято, недекларированное отклонение зафиксировано.
- I-1: механизм «память читает raw_text» в пакете/PR описан неверно — память читает `segments_blob` + `speaker_map` (`worker/src/memory/postgres.ts:21,33`), имена доходят напрямую; результат верный. I-2: возможная двусмысленность «use it as is» vs правило орфографии по глоссарию для свободно введённого имени — наблюдать. I-3: устаревший комментарий в `publisher.ts` (base).
- Отклонения PR приняты: вынос `buildFullText` в `worker/src/lib/transcript-text.ts`, правило и в EN, полный `pnpm test` не прогонялся (CI зелёный).
- graph: checked — узлы не меняются (поле «Граф: нет»; UC-200/300 помечены stale в графе BACKEND-07 с program_delta).
- Слот слияния: следующий; живой сценарий — итоговая проверка волны 4 вместе с FRONTEND-06 (загрузка с контекстом → AWAITING_SPEAKERS → PUT confirm → протокол с именами).

## Автоматические находки

- не найдено

Дифф ревизии (пересдачи): —

---

## Отчёт рецензента (дословно)

# Отчёт рецензента — WP-WORKER-06, PR #30, head `a87e1359168062685cd2c7b083ed84acc441f8cc` → `main @ 2e131fe287`

## 1. Вердикт: **ACCEPT**

Все пять пунктов объёма реализованы в разрешённых путях, четыре критерия приёмки покрыты тестами, CI на `a87e135` зелёный, worker 478 passed / 9 skipped, `pnpm -r typecheck` чистый, все шесть мутаций M1–M6 убиты. Регрессий против base не найдено: единственное изъятое поведение — автогенерация протокола для встреч с замороженным контекстом — и есть цель D-38; legacy-поток (без контекста / черновик) не изменён. Два неточных утверждения (в теле PR и в фактах пакета) о том, что память проекта читает `raw_text`: на деле `worker/src/memory/postgres.ts:21,33` читает `segments_blob` + `speaker_map`, так что имена доходят до EXTRACT напрямую, а не через `raw_text` — результат верный, механизм описан неверно (Info). Недекларированное отклонение от контракта (пересборка `raw_text` без проверки `speakers_confirmed_at`) идемпотентно и безвредно (Low, принять).

## 2. Объём и критерии приёмки → код → статус (head `a87e135`)

| Пункт | Где | Статус |
|---|---|---|
| Объём 1: шаг 10 — `AWAITING_SPEAKERS` при `snapshot_hash` не NULL, SSE, без задания | `worker/src/jobs/transcription.ts:263-267` (`awaitingSpeakers = Boolean(meeting.context?.snapshotHash)`, `nextStatus`), `:291-295` (status в той же транзакции), `:312-334` (`if (!awaitingSpeakers)` — create + enqueue), `:337-346` (SSE со `nextStatus`); `resolveSpeakers` на `:76-109` не тронут | Сделано |
| Объём 2: текст промпта из `segments_blob` + `speaker_map`, запись в `raw_text`, без сегментов — прежний текст | `worker/src/jobs/protocol-generation.ts:209-242` (`applySpeakerMap`, `isSegment`), `:362` (`transcriptText = await applySpeakerMap(transcript, log)`) | Сделано |
| Объём 3: правило в `protocol-context.md`, паритет без карты байт-в-байт | `worker/src/llm/prompts/ru/protocol-context.md:46`, `worker/src/llm/prompts/en/protocol-context.md:27`; `protocol.md` RU/EN не в диффе; golden-тест `protocol-prompt.test.ts:51-68` зелёный | Сделано |
| Объём 4: память не трогать, подтвердить тестом | `worker/src/memory/**` не в диффе; тест записи `raw_text` в `protocol-generation.context.test.ts:416-423`. Но память читает не `raw_text` (см. Q8) | Сделано с неточной формулировкой |
| Объём 5: не менять Deepgram, очереди, классификацию ошибок | `git diff --stat`: 8 файлов, только `worker/src/{jobs,lib,llm}/**` | Соблюдено |
| КП 1: тесты `transcription.ts` (гейт + старый поток) | `worker/src/jobs/transcription.speakers-gate.test.ts:86-114` (3 теста) | Зелёные; M2, M3 убиты |
| КП 2: `{SPEAKER_0:'Антон', SPEAKER_1:null}` → `[..] Антон:` / `[..] Speaker 2:`, `raw_text` обновлён, без blob — прежний | `protocol-generation.context.test.ts:416-449` (5 тестов) | Зелёные; M4, M5 убиты |
| КП 3: снапшот промпта без карты не изменился, с картой — правило есть | `protocol-prompt.test.ts:296-303` + golden `:51-68`, `:130-133` (sha256 шаблонов) | Зелёные; M6 убит |
| КП 4: `pnpm -r typecheck`, тесты | в клоне: оба exit 0; CI `Lint + Typecheck + Test` pass (2m54s) | Зелёные |

## 3. Ответы на вопросы о рисках

**Q1 — include `context`.** Запрос на `transcription.ts:160-167`: `prisma.transcriptionJob.findUnique({ where: { id }, include: { meeting: { include: { recording: true, context: true } } } })` — `context: true` есть (добавлен ещё в FR-004 для keyterms, в main). Новый gate-тест мокает `findUnique` и форму запроса не проверяет: при M1 (убрать `context: true`) `transcription.speakers-gate.test.ts` остаётся зелёным (3/3). Мутацию ловит существующий тест main `worker/src/jobs/transcription.keyterms.test.ts:129` (`expect.objectContaining({ include: { meeting: { include: { recording: true, context: true } } } })`) — при M1: `1 failed | 10 passed`. Кроме того, M1 не пройдёт `typecheck` (`meeting.context` исчезает из типа). Итого гейт защищён, но чужим тестом — см. находку L-1.

**Q2 — границы транзакции и задание.** `transcription.ts:270-304`: один `prisma.$transaction` — `transcript.create` (`raw_text`, `speaker_map`, `segments_blob`), `recording.update`, `meeting.update({ status: nextStatus })`, `transcriptionJob.updateMany(PROCESSING→DONE)`. Структура транзакции идентична base, изменён только литерал статуса. Создание `ProtocolGenerationJob` и enqueue — после коммита, под `if (!awaitingSpeakers)` (`:312`); на гейт-пути строки нет (тест `:86-100`, M3 убит). В api `confirmSpeakers` (`api/src/features/speakers/service.ts:197-215`) делает `tx.protocolGenerationJob.upsert({ where: { meetingId }, create: { meetingId }, update: { status: 'PENDING', startedAt: null, finishedAt: null, errorMsg: null, attemptCount: 0 } })`; `meetingId @unique` в `api/prisma/schema.prisma:212`. Застарелая PENDING-строка старого потока конфликта не даст: такая встреча находится в `TRANSCRIBED`/`GENERATING_PROTOCOL`, а PUT отсекает всё, кроме `AWAITING_SPEAKERS` (`service.ts:156`, плюс `updateMany where status='AWAITING_SPEAKERS'` на `:199-203`). Ничего наполовину сделанного не остаётся.

**Q3 — порядок с api.** `processProtocolGenerationJob` (`protocol-generation.ts:264-325`) проверяет только `pgJob.status` (терминальный → skip на `:281-288`; claim `updateMany where status in [PENDING, PROCESSING]` на `:307-310`). Статус встречи нигде не читается и не требуется `TRANSCRIBED`; на успехе — безусловный `tx.meeting.update({ status: 'PROTOCOL_READY' })` (хвост файла, строки 46-50 среза), на провале — `FAILED`. API ставит `GENERATING_PROTOCOL` до enqueue (`service.ts:199-203`), что совпадает с ожидаемым потоком контракта §2. Конфликта нет.

**Q4 — испорченные `segments_blob`.** `protocol-generation.ts:217-221` (`isSegment`: `text` string, `speaker` string, `start` number) и `:226` (`!Array.isArray(blob) || blob.length === 0 || !blob.every(isSegment)` → `stored`). Ad hoc тест в клоне (11 кейсов, все зелёные): строка, объект, `[]`, `null`, `[null]`, без `start`, `start` строкой, «один хороший + один плохой» → возвращается прежний `raw_text`, `transcript.update` не вызывается, исключений нет; `speakerMap` массив → трактуется как `{}` (`Speaker 4`); `rawText: null` + валидные сегменты → пересборка и запись. Legacy pre-fill: `rawText` на `transcription.ts:275` строится той же `buildFullText(asrResult.segments, speakerMap)`, что и сохранённые `segments_blob`/`speaker_map` (`:276-277`), поэтому `rebuilt === stored` → записи нет (ad hoc тест «legacy pre-fill» и PR-тест `:437-442`).

**Q5 — стабильность сравнения, гонки.** Единая функция `worker/src/lib/transcript-text.ts:13-28` для обеих сторон; таймкод через `Math.floor` — устойчив к JSONB-округлениям (`3.9 → 00:03`). После первой записи `rebuilt` второй прогон (retry) даёт равенство → без записи. Запись — одиночный `UPDATE` одной строки по `id` вне транзакции генерации; api читает `rawText` только в `api/src/services/uc-201.service.ts:107,168` (выдача/скачивание), атомарность строки сохраняется. Low, без требований.

**Q6 — правило промпта и WORKER-07.** RU, `ru/protocol-context.md:46`: «A name already present on a transcript line ("[MM:SS] Имя: …") was confirmed by the author: use it as is, never replace it with another participant and never doubt it. Only the remaining "Speaker N" labels are handled by the rules below.» EN, `en/protocol-context.md:27`: «A name already present on a transcript line ("[MM:SS] Name: …") was confirmed by the author: use it as is, never replace it with another participant. Only the remaining "Speaker N" labels are handled by this rule: …». Конфликта с WORKER-07 нет: правило «## Участники — ONLY people who speak in the transcript (their name is on a transcript line …)» (`ru/protocol-context.md:53`, `en:28`) уже включает имена из строк транскрипта. `protocol-guard.ts:61-63`: `known = words([transcriptText, ...Object.values(speakerMap)])` — `transcriptText` на `protocol-generation.ts:372` это уже пересобранный текст с именами, плюс `speakerMap` — подтверждённые имена сохраняются. Небольшая двусмысленность: «use it as is» vs прежнее «Use the spelling … from <participants> and <glossary> when a name in the transcript is a misspelled … variant» для свободно введённого имени — Info, без требований.

**Q7 — SSE.** Воркер публикует через `worker/src/lib/publisher.ts:20-31` (`publishMeetingEvent(redisUrl, event: SseEvent, meetingId)` → Redis `meetingChannel`), вызов на `transcription.ts:337-346` с `status: nextStatus` — тот же код-путь, что для `TRANSCRIBED`. Тип `SseEvent` → `MeetingStatusEvent` (`shared/src/api/uc002.ts:43-48`, `status: MeetingStatus`), `MeetingStatus` содержит `'AWAITING_SPEAKERS'` (`shared/src/enums.ts:14`, из BACKEND-07). api-сторона (`api/src/sse/pubsub.ts:45`) не парсит схемой, пробрасывает как есть. Тест `speakers-gate.test.ts:95-99` проверяет точный payload.

**Q8 — память проекта.** `worker/src/memory/postgres.ts:21`: `transcript: { select: { segmentsBlob: true, speakerMap: true } }`, `:33`: `toMemorySegments(m.transcript?.segmentsBlob, m.transcript?.speakerMap)`; `worker/src/memory/transcript.ts:51-68` подставляет имя из `speakerMap` в `label` (тест `memory/transcript.test.ts:17-20` — `label: 'Петров'`). `git grep rawText|raw_text -- worker/src/memory` → пусто. Вывод: память читает строку БД при запуске (не кэш из payload), но **не `raw_text`**; подтверждённые имена доходят до EXTRACT через `speaker_map`, записанный api, независимо от этого PR. Факт оркестратора и п. 5 тела PR в части механизма неверны; результат (имена в памяти) верен.

**Q9 — что изъято относительно base.** Единственное: для встречи с `meeting_contexts.snapshot_hash IS NOT NULL` после распознавания не создаётся и не ставится `ProtocolGenerationJob`, статус `AWAITING_SPEAKERS` вместо `TRANSCRIBED` — цель D-38 и §2 контракта. Для `context == null` и `snapshotHash: null` путь байт-в-байт прежний (дифф `transcription.ts` меняет только два литерала и обёртку `if`; тест `:102-114`). Retry (uc-004): `api/src/services/uc-004.service.ts:10-11` возвращает `TRANSCRIBING` и перезапускает TranscriptionJob; после успеха гейт срабатывает снова → `AWAITING_SPEAKERS`, задания нет — согласовано с контрактом («выход — только PUT /speakers»). Retry после FAILED генерации сбрасывает `ProtocolGenerationJob` → воркер использует сохранённую карту (контракт §4). Новое, чего base не делал: `raw_text` может быть перезаписан на этапе генерации — только при фактическом отличии, см. Q5.

**Q10 — мутации.** См. таблицу в разделе 6: все шесть убиты; M1 — чужим тестом.

## 4. Находки

**Low**

- **L-1** `worker/src/jobs/transcription.speakers-gate.test.ts:41-47` — сетап мокает `findUnique` с `meeting.context` без проверки `include`. Сценарий: кто-то уберёт `context: true` из `transcription.ts:165` и одновременно изменит keyterms-тест → гейт молча перестанет срабатывать, gate-тест останется зелёным. Сейчас прикрыто `transcription.keyterms.test.ts:129` и typecheck. Backlog: добавить в gate-тест `expect(mockPrisma.transcriptionJob.findUnique).toHaveBeenCalledWith(expect.objectContaining({ include: { meeting: { include: expect.objectContaining({ context: true }) } } }))`. Не блокирует.
- **L-2** `worker/src/jobs/protocol-generation.ts:226-233` — контракт §4: пересобирать текст «если `speakers_confirmed_at IS NOT NULL`»; код пересобирает всегда при валидных сегментах, `speakersConfirmedAt` не читается. Поведенчески безопасно (legacy: равенство → без записи; доказано тестами), но это отклонение от контракта, не указанное в Deviations. Принять как есть; зафиксировать в отчёте.

**Info**

- **I-1** Тело PR п. 5 и пакет §1/§2.4 («пайплайн читает тот же `raw_text`») — неверный механизм: память читает `segments_blob` + `speaker_map` (`worker/src/memory/postgres.ts:21,33`). Тест «записи `raw_text`» подтверждает выдачу транскрипта (`uc-201.service.ts:107,168`), а не память. Имена в память попадают независимо. Поправить формулировку в пакете/отчёте; кода не требует.
- **I-2** `ru/protocol-context.md:46` «never doubt it» + `:52` правило орфографии по `<participants>`/`<glossary>` — для свободно введённого имени возможна неоднозначность «как есть» vs «исправить написание». Наблюдать по протоколам; кода не требует.
- **I-3** `worker/src/lib/publisher.ts:6` устаревший комментарий «TRANSCRIBING → TRANSCRIPT_READY» (base, не из PR).

Регрессий против base: нет.

## 5. Deviations из тела PR

1. Вынос `buildFullText` в `worker/src/lib/transcript-text.ts` с реэкспортом (`transcription.ts:112`) — принято: тело функции перенесено дословно (дифф), путь разрешён, импорты тестов не менялись.
2. Правило добавлено и в EN-шаблон — принято: `loadProtocolSystemPrompt(lang, hasContext)` выбирает шаблон по языку встречи; без EN-строки EN-встречи с подтверждёнными именами остались бы без правила.
3. Полный `pnpm test` не прогонялся — принято с оговоркой: дифф целиком в `worker/`, CI (`Lint + Typecheck + Test`) на `a87e135` зелёный.
4. Недекларированное: L-2 (пересборка без проверки `speakers_confirmed_at`) — принять.

## 6. CI, размер, тесты, мутации

- CI: `gh pr checks 30 --repo ITSalt/transcriber` → `Lint + Typecheck + Test  pass  2m54s` (run 37835575857); при старте ревью был pending.
- Размер: 8 files changed, +284/−55; один коммит `a87e135`; merge-base = `2e131fe287`.
- Клон: `review_clone.sh --sha a87e135… --keep` → HEAD `a87e1359168062685cd2c7b083ed84acc441f8cc`; `pnpm install --frozen-lockfile` exit 0; `pnpm --filter @transcrib/api run db:generate` exit 0; `pnpm --filter @transcrib/shared build` exit 0; `pnpm --filter @transcrib/worker test` exit 0 — `Test Files 38 passed | 2 skipped (40)`, `Tests 478 passed | 9 skipped (487)`; `pnpm -r typecheck` exit 0.
- Ad hoc тест (11 кейсов испорченных `segments_blob`/`speaker_map`, временный экспорт `applySpeakerMap`): 11 passed; файлы откачены, `git status` чистый.

| Мутация | Изменение | Прогон | Результат |
|---|---|---|---|
| M1 | `transcription.ts:165` `include: { recording: true }` (без `context`) | `speakers-gate.test.ts` + `keyterms.test.ts` | exit 1: `1 failed | 10 passed` — красный `keyterms.test.ts:129`; gate-тест зелёный |
| M2 | `const nextStatus = 'TRANSCRIBED'` | `speakers-gate.test.ts` | exit 1: `1 failed | 2 passed` (frozen context → AWAITING_SPEAKERS…) |
| M3 | `if (!awaitingSpeakers)` → `if (true)` | `speakers-gate.test.ts` | exit 1: `1 failed | 2 passed` |
| M4 | `prisma.transcript.update(...)` → `void 0` | `protocol-generation.context.test.ts` | exit 1: `1 failed | 23 passed` (stores it as raw_text) |
| M5 | `buildFullText(blob, {})` | `protocol-generation.context.test.ts` | exit 1: `2 failed | 22 passed` (confirmed map; merged labels) |
| M6 | удалена строка `A name already present…` в `ru/protocol-context.md` | `protocol-prompt.test.ts` | exit 1: `1 failed | 26 passed` |

Каждая мутация откачена `git checkout`; после серии `git status --porcelain` пуст, HEAD `a87e135`.

## 7. Очистка

`review_clone.sh --cleanup /tmp/claude-1004/-home-cloudpc-projects-transcriber/4310f49e-95eb-4aeb-8d49-40bf49c26179/scratchpad/clones/orch-review.LlxrRI` → `removed …/orch-review.LlxrRI`, exit 0; в `clones/` остался только `node-compile-cache`. Основной checkout `/home/cloudpc/projects/transcriber` не менялся (`git status`: только ранее изменённый `config.yaml`); в worktrees и workspace оркестратора не входил; PR не комментировал, не одобрял, не мержил.
