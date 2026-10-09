# Сверка — WP-WORKER-08 (PR https://github.com/ITSalt/transcriber/pull/36, `41687f703a` -> `main @ 5392bbe5e1`) — 2026-10-09

Раунд 1. Дифф: 15 files changed, 99 insertions(+), 80 deletions(-) (файлов: 15).

**Решение: `REVISE WP-WORKER-08`** — все пять пунктов объёма реализованы, CI зелёный, главный риск («Спикер N» в `raw_text`) проверен: ни один потребитель не разбирает текст по метке; остаются два однострочных пункта — непокрытая тестом передача языка в `transcription.ts` и устаревший `speakerCount` в wire-тесте (TS2353, скрыт исключением тестов из tsconfig).

## Пункты REVISE

1. `worker/src/jobs/transcription.ts:251` → `buildFullText(..., resolveProtocolLanguage(meeting.language))` не покрыт тестом: мутация «третий аргумент = 'EN'» оставляет 146/146 зелёными; при рефакторинге EN-встречи получат «Спикер N» (или RU — «Speaker N») незаметно → объём п. 5 (тесты на метку по языку). Требование: в `transcription.test.ts` кейс `processTranscriptionJob`, проверяющий `rawText` с «Спикер 1:» для `RU`/`AUTO` и «Speaker 1:» для `EN`. Серьёзность: Medium.
2. `worker/test/wire/deepgram-keyterm.wire.test.ts:8,96` → `asr.transcribe({ …, speakerCount: 3 })` — TS2353 против нового `AudioInput`, скрыто тем, что `worker/tsconfig.json` исключает тесты; комментарий в строке 8 устарел → объём п. 4 (`speakerCount` удалён). Требование: убрать `speakerCount: 3`, оставить проверку отсутствия `min_speakers`/`max_speakers`, обновить комментарий. Серьёзность: Low (входит в раунд: одна строка, путь разрешён).

### Не требуется

- `worker/src/memory/transcript.ts:47` («Speaker N» в цитатах памяти) — WP-WORKER-MEMORY-03.
- `api/src/features/speakers/service.ts:105` `display`, `api/src/services/uc-100.service.ts:45` устаревший комментарий, `uc100.ts`/`uc200.ts` `speaker_count` — WP-BACKEND-08 / WP-FRONTEND-07.
- Бамп `PROTOCOL_PROMPT_TEMPLATE_VERSION` — не нужен: `prompt_version` = sha256 файла шаблона (`protocol-prompt.ts:33,50`).

## Вопросы владельцу

нет

## Принято как есть / backlog

- Протокол с обоими заголовками «## Задачи» и «## Поручения» принимается валидацией (проверки «ровно четыре секции» в коде нет) — принято; промпт сам требует четыре секции.
- Поведение vs base: при следующей генерации/retry старой RU-встречи с `segments_blob` `raw_text` один раз переписывается на «Спикер N» — ожидаемо по D-41; транскрипты без `segments_blob` остаются «Speaker N», промпты это принимают.
- Падение `web/src/routes/upload/context.test.tsx` в полном `pnpm test` клона — флаки под нагрузкой (web не менялся, повтор 12/12, CI зелёный).
- Отклонения PR (память вне области, UC-300 не проверялся, AGENTS.md — D-17) — приняты.

## Автоматические находки

- не найдено

Дифф ревизии (пересдачи): —

---

## Отчёт рецензента (дословно)

Verdict: ACCEPT with condition. All five scope items implemented where the package says; every PR-body claim checks out; CI green (`Lint + Typecheck + Test pass 2m39s`); main risk empty: no code in api/worker/web parses `raw_text` by label — UC-201 (`uc-201.service.ts:107,168`) and web `SegmentList.tsx:18` pass it through; speakers service builds samples from `segmentsBlob` keyed by `SPEAKER_n`; memory `transcript.ts:45-66` parses `segmentsBlob`; guard `SPEAKER_LABEL = /^(speaker|спикер)\s*\d+\b/i`; WP-WORKER-06 substitution looks up `speakerMap[seg.speaker]` by key.

Allowed paths: no file outside (shared/src/asr/IAsrProvider.ts declared). Prompts: `git grep "Задач" -- worker/src/llm/prompts/ru` empty; rules at `protocol-context.md:46-51` consistent, line 51 says both label forms are unconfirmed; `protocol.md` no-context mode says «Спикер»; EN prompts untouched. Section validation (`protocol-generation.ts:103-115`, `LEGACY_SECTION_ALIASES`): RU accepts both headings, EN keeps `## Action Items`; both headings together accepted; retry of an old meeting passes via alias. Golden fixture: `system` differs in exactly 12 hunks matching the diff; `prompt_version` = sha256 of template bytes (`protocol-prompt.ts:33,50`), constant `1.1.0` persisted nowhere — bump unnecessary. `speakerCount` leftovers: `uc100.ts:94`, `uc200.ts:11` (expected), api/prisma/web (WP-BACKEND-08/FRONTEND scope), unexpected `worker/test/wire/deepgram-keyterm.wire.test.ts:96` (TS2353 masked by tsconfig excluding tests).

Findings: M1 Medium — `transcription.ts:251` language argument untested (mutation C: `'EN'` constant → 146/146 green). L1 Low — wire test leftover. I1 — memory `transcript.ts:47` still `Speaker N` (out of scope). I2 — next generation/retry of an old RU meeting with `segments_blob` rewrites `raw_text` once to «Спикер N». I3 — speakers `display` still `Speaker N` (API). I4 — stale comment `uc-100.service.ts:45`.

Clone `orch-review.S1U6Ug` at 41687f7: setup exit 0; worker tests `38 passed | 2 skipped`, `481 passed | 9 skipped`; `pnpm -r typecheck` exit 0; `pnpm test` 1 failed (`web/.../context.test.tsx`, web byte-identical to base, rerun 12/12 twice — flaky). Mutations: A (RU rejects «## Задачи») 1 failed; B (`buildFullText` Speaker for RU) 4 failed; C (transcription passes 'EN') 0 failed → M1; D (protocol-generation passes 'EN') 2 failed; E (guard speaker-only) 1 failed; F (protocol.md heading reverted) 3 failed. Disclosure: one worker test pass and a no-op mutation attempt were run in another review's clone (`WE6d5f`, no file changed, results discarded). Cleanup: `S1U6Ug` removed; other clones left to their reviewers.
