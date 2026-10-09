# Сверка — WP-WORKER-MEMORY-03 (PR https://github.com/ITSalt/transcriber/pull/33, `4998d25fc5` -> `main @ 655830416e`) — 2026-10-09

Раунд 1. Дифф: 5 files changed, 31 insertions(+), 14 deletions(-) (файлов: 5).

**Решение: `REVISE WP-WORKER-MEMORY-03`** — объём выполнен, пути соблюдены, CI зелёный, ветка чисто сливается с текущим main (тесты на слитом дереве 485 passed), но два теста отсутствуют: передача языка в `postgres.ts` и EN-ветка `mappedSpeakerNames` не ловятся мутациями (та же класс пробела, что в WP-WORKER-08 раунд 1).

## Пункты REVISE

1. `worker/src/memory/postgres.ts:35` → `resolveProtocolLanguage(m.language)` не покрыт тестом: мутация «константа 'EN'» оставляет 479/479 зелёными; при рефакторинге `createMeetingLoader` RU-встречи незаметно получат «Speaker N» в цитатах памяти → объём п. 3 (тесты на оба языка). Требование: тест `createMeetingLoader` со stub `prisma.meeting.findUnique`, проверяющий `segments[*].label` «Спикер 1» для `RU`/`AUTO` и «Speaker 1» для `EN`. Серьёзность: Medium.
2. `worker/src/memory/transcript.ts:213` → EN-ветка `mappedSpeakerNames` не покрыта: мутация «только RU-форма» оставляет 53/53; для EN-встречи неподтверждённая «Speaker 2» попала бы в `speakerNames`, и гейт счёл бы её известным человеком → объём п. 1 (обе формы). Требование: утверждение `mappedSpeakerNames(toMemorySegments(blob, {SPEAKER_0:'Peter'}, 'EN'))` = `['Peter']`. Серьёзность: Low, входит в раунд.

### Не требуется

- Импорт общей функции из `worker/src/lib/transcript-text.ts` (приватная, вне области) — backlog.
- Разбор секций протокола в памяти — его нет, пункт 2 объёма закрыт фактом.

## Вопросы владельцу

нет

## Принято как есть / backlog

- Отклонения PR (нет разбора секций; локальный дубликат метки; AUTO → RU по `resolveProtocolLanguage`, как у протокола; AGENTS.md — D-17) — приняты.
- Поведение vs base: старые RU-встречи при повторной обработке памяти получат «Спикер N», прежние рёбра MENTIONED_IN сохранят «Speaker N»; UI показывает как есть — ожидаемо по D-41.
- Backlog: экспортировать `speakerLabelToDisplay` из `worker/src/lib/transcript-text.ts` и использовать в памяти вместо дубликата.

## Автоматические находки

- **merge-base**: WP-WORKER-MEMORY-03: branch point 5392bbe5e1 is 4 commits behind origin/main (no overlapping files) - rebase before merge

Дифф ревизии (пересдачи): —

---

## Отчёт рецензента (дословно)

Verdict: ACCEPT with condition. Scope item 1 implemented at `worker/src/memory/transcript.ts:46-51,54,65` (`speakerDisplay(label, language)`, `toMemorySegments(..., language='RU')`), `postgres.ts:9,22,35` (`resolveProtocolLanguage(m.language)`); item 2 correctly empty (no protocol-section parsing in memory; `git grep "Задач"` hits only prompt wording `provider.ts:50,56` and fixtures); tests `transcript.test.ts:17-36` (RU «Спикер 2», new EN), `gate.test.ts:40,70`, `pipeline.neo4j.test.ts:140`. All 5 files under `worker/src/memory/`. Label flows as an opaque string: `verifyQuote` → `VerifiedQuote.speakerLabel` → gate → Cypher `MENTIONED_IN.speakerLabel` (`shared/src/memory/meeting-update.ts:182,194,244,264`) → `mappers.ts:53` → `TaskDetail.tsx:62`; no consumer parses it; `mappedSpeakerNames` (`transcript.ts:213`) now excludes both RU and EN forms. Helper semantically identical to main's private `speakerLabelToDisplay` (`transcript-text.ts:31-38`). Language agreement: same `resolveProtocolLanguage` as protocol/transcription (RU→RU, AUTO→RU, EN→EN).

Findings: M1 Medium — `postgres.ts:35` language wiring untested (mutation C 'EN' → 479 passed). L1 Low — EN branch of `mappedSpeakerNames` untested (mutation D → 53 passed). I1 duplicate helper. I2 old RU meetings re-processed write «Спикер N» while old edges keep «Speaker N».

CI pass 2m46s, MERGEABLE/CLEAN; 5 files +31/−14. Clone `orch-review.Yc9bG6`: setup exit 0; worker tests `38 passed | 2 skipped`, `479 passed | 9 skipped`; `pnpm -r typecheck` exit 0. Merge onto main 6558304: `git merge-tree --write-tree` clean, scratch merge 786dae0 → worker tests `485 passed | 9 skipped`, `tsc --noEmit` exit 0; scratch branch deleted, nothing pushed. Mutations: A (RU → 'Speaker') 2 failed; B (EN → 'Спикер') 1 failed; C 0 failed → M1; D 0 failed → L1. Cleanup: clone removed.
