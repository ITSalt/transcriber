# Сверка — WP-WORKER-01 (PR https://github.com/ITSalt/transcriber/pull/17, `4c1a580e4b` -> `main @ 2570d0a669`) — 2026-10-07

Раунд 1. Дифф: 21 files changed, 1899 insertions(+), 52 deletions(-) (файлов: 21).

**Решение: `REVISE WP-WORKER-01`** — условие merge выполнено (ревьюер независимо воспроизвёл запрос kie.ai старым адаптером с `2570d0a`: байт-в-байт с голденами и с новым адаптером без контекста, RU и EN; URL Deepgram без флага идентичен), поведение прода не меняется, 8/8 мутаций ловятся, CI зелёный; один пункт low, но с реальным ущербом для разработчиков: три существующих тестовых файла не мокают S3 и с `S3_*` в окружении зальют промпты в настоящий бакет.

## Пункты REVISE

1. `worker/src/jobs/protocol-generation.test.ts`, `protocol-generation.regression.test.ts`, `protocol-generation.language.regression.test.ts` -> разработчик с экспортированными `S3_ENDPOINT/S3_BUCKET/S3_KEY/S3_SECRET` запускает `pnpm --filter @transcrib/worker test` → `archivePrompt` вызывает `createStorage()` и PUT'ит `ws/<ws>/prompts/<uuid>.txt` в реальный бакет (CI безопасен: там нет S3 env) -> требование: `vi.mock('../lib/storage.js', …)` в трёх файлах, как в `protocol-generation.context.test.ts:22-26` (одна строка на файл); low, но в этом раунде.
2. (по желанию, в том же раунде) `worker/src/jobs/protocol-generation.ts:142` -> провайдер памяти, который не бросает и не резолвится, держит задание (lock BullMQ) бесконечно -> `Promise.race` с таймаутом, как у `archivePrompt` (сейчас провайдер PR #16 сам ограничивает 10 с, так что это защита в глубину); low.

### Не требуется

- Не трогать адаптеры, промпты, голдены, транзакцию — приняты как есть.
- Бюджет `<previous_protocol>` (L4) — вопрос владельцу P-16, не в этом раунде.
- `putObject` без unit-теста (L3) — backlog.
- CLAUDE.md/AGENTS.md — D-17; `.tl/**` — не объявлен, не трогать.

## Вопросы владельцу

- P-15 — архив промптов в S3 под `ws/*/prompts/` попадает под 3-дневный lifecycle прод-бакета (`.tl/deploy-plan.md`): нужна ли ему исключающая политика (хранить дольше)?
- P-16 — `<previous_protocol>` без бюджета размера (до 200 000 символов) + длинный транскрипт могут превысить окно модели; kie.ai 400 — постоянная ошибка → встреча FAILED. Ввести бюджет в рендерере (обрезать с пометкой) или ограничить размер на API?

## Принято как есть / backlog

- Отклонения PR 1–12 приняты (правила в `protocol-context.md`, `protocol.md` не менялся — sha256 ru/en совпадают с базой; `keyterms`/`asr_options` реконструируются; архив best effort; `ProtocolGeneration` только при успехе; дата = дата загрузки с подписью; `Speaker N`; min/max_speakers убраны — wire без изменений; без миграции — слот слияния после BACKEND-01; `.tl/**` не трогал; D-17; эвристика токенов; ветка от 2570d0a).
- Q-2 закрыт (D-21). Q-1 не измерен честно: флаг `ASR_KEYTERMS_ENABLED` выключен, поведение прода не меняется; замер — отдельным пунктом владельца при появлении записей.
- Условие доставки: merge после WP-BACKEND-01 и с применённой миграцией BACKEND-06 (воркер пишет `protocol_generations`/`protocol_versions` в транзакции протокола).
- L3 `putObject` без теста; Info: таймаут архива не прерывает PUT; транскрипт не триммится внутри тега; оценка токенов для CJK; `<input_format>` говорит «date» при подписи «Recording uploaded».
- graph: checked — RQ-059..RQ-062, DEC-010, UC-200 v3 / UC-300 v4 записаны сессией под замком graph (UNLOCK 2026-10-07; граф спецификаций был доступен в тот момент); при доставке перепроверить read-cypher, если граф снова доступен.

## Автоматические находки

- не найдено

Дифф ревизии (пересдачи): —

---

## Отчёт рецензента (дословно)

# Review — WP-WORKER-01, PR https://github.com/ITSalt/transcriber/pull/17, head `4c1a580e4bbfe055df626baa2cfc9cec915c4b98` vs `main @ 2570d0a669`

## 1. Verdict: ACCEPT with condition

The merge condition (AC-2, byte-identical no-context request) holds: I reproduced the pre-package kie.ai request through the base adapter checked out from `2570d0a669` (`git worktree add ../old` inside the clone) with a fake `fetch`, and it is byte-identical (`cmp`, sha256) to both committed goldens and to the head adapter's output for context absent / `{}` / all-null, RU and EN. The Deepgram URL is identical old vs head for RU/EN/AUTO with `speakerCount` set (D-21 confirmed independently: `min_speakers`/`max_speakers` occur 0 times in `@deepgram/sdk@5.2.0`'s media client). `protocol.md` ru/en sha256 unchanged. Status transitions, FAILED/retry classification and SSE are untouched. 315/315 tests pass in a clean shell; 8/8 of my own mutations were caught. Conditions: (a) merge after WP-BACKEND-01 and deploy with the BACKEND-06 migration applied (the head worker writes `protocol_generations`/`protocol_versions` inside the Protocol transaction); (b) the three pre-existing protocol test files should mock `../lib/storage.js` (Low). No High or Medium findings.

## 2. Scope items and acceptance criteria

| Item | Where | Status |
|---|---|---|
| S2.1 keyterms from frozen MeetingContext, order, dedup, caps, repeated `keyterm=`, flag off | `worker/src/asr/keyterms.ts:21-24,52-71,109-125,132-137`; `deepgram-adapter.ts:220-221`; `transcription.ts:259-275` | Done; URL captured with repeated keyterm params |
| S2.2 user message with 7 sections then `<transcript>`, closing tags escaped, no-context byte-identical | `protocol-context.ts:116-147`, `protocol-prompt.ts:56-71`, `kieai.ts:181-188` | Done; byte-identity reproduced |
| S2.3 system prompt rules | `prompts/ru/protocol-context.md:34,36,45-52,54-59,38-42`; `en:25-42` | Done (context-only templates, Deviation 1) |
| S2.4 ProtocolGeneration + S3 archive + ProtocolVersion(1, GENERATED) in the Protocol transaction | `protocol-generation.ts:326-349,342,350-407`; `storage.ts:114-122` | Done |
| S2.5 Q-2 | SDK `_queryParams` has `keyterm`, no `min_speakers`/`max_speakers`; old vs head URLs identical | Done |
| S2.6 no API/UI/memory changes | diff stat: 21 files under `worker/**` | Done |
| S8 no migration (merge after BACKEND-01); FR-005 reconciliation is `ON CONFLICT DO NOTHING` | — | Done (condition) |
| AC-1 | `test/wire/deepgram-keyterm.wire.test.ts:33-99`; `transcription.keyterms.test.ts:133-152` | Pass; M1/M2 caught |
| AC-2 | `protocol-prompt.test.ts:51-76,92-107` | Pass; reproduced |
| AC-3 | `protocol-generation.context.test.ts:127-174` | Pass; M3 caught |
| AC-4 | typecheck 0; worker 23 files / 315 tests, 0 skipped | Pass |
| AC-5 | PR body: Q-1 not measured, flag off; Q-2 never sent (verified) | Present |

## 3. Risk questions (abridged)

**Q1** Old adapter from `2570d0a669` vs goldens vs head: `cmp` IDENTICAL ×8; sha256 RU `cc5773cc…` (5929 bytes), EN `474fa06e…` (1699 bytes); goldens are committed data. Unconditional wrapping: none — `renderProtocolUserMessage` returns the raw transcript when `!hasProtocolContext`; `buildProtocolContext` returns `undefined` unless meeting_type/goal/a section is non-empty; `meeting_meta` only after that guard. Edge: a frozen snapshot with only `meeting_type` counts as context (user froze it).
**Q2** Wire test uses the real SDK with injected fetch; old vs head URLs character-identical for RU/AUTO/EN with speakerCount; keyterm repeated, commas replaced, caps tested with 120 terms; estimate pessimistic. M1 (comma-join) 2/5 fail; M2 (skip re-cap) 3/5 fail.
**Q3** `frozenContextSnapshot` → null when row missing or `snapshotHash` null; invalid → warn + null; data via existing `findUnique` include — no extra query; FR-001 unchanged. M7 (accept draft) → 3 fail.
**Q4** The 15 removed lines are comments/imports/include/one generate call/one log. Untouched: DEC-003 language, status guards, `tx.protocol.create`, PROTOCOL_READY, job DONE, SSE, catch (transient vs FAILED). `kieai.ts` −18/+11: only local `loadSystemPrompt` replaced; DEC-001 classification unchanged. Regeneration: `Protocol.meetingId @unique`; UC-004 retry never resets DONE jobs nor deletes a Protocol; no new failure mode.
**Q5** `loadProjectMemory` returns null without a project, catches all exceptions → warn + null; default `NoProjectMemoryProvider`; M5 (rethrow) → 1 fail. No time-box in the consumer (L2); PR 16's provider races 10 s itself.
**Q6** Escape regex byte-identical to shared's; probe with embedded tags: exactly one `<transcript>` and `</transcript>`, tags neutralised; cosmetic: transcript not trimmed.
**Q7** Key `ws/${workspaceId}/prompts/${generationId}.txt`, LEGACY fallback; 15 s race; failure → warn, null; archive awaited BEFORE `$transaction`; CI has no `S3_*`; three pre-existing test files do not mock storage (L1).
**Q8** Both templates keep the four headings; required rules present in ru/en; no contradiction with `protocol.md`; parity mirrors base structure.
**Q9** 315 tests, 0 skipped; `putObject` untested (L3); spot-check of 8 mutations: all caught; M9 control passes.
**Q10** No shared paths touched. **Q11** CI run 37692525860 success, 1m46s.

## 4. Findings (no High, no Medium)

- **L1** three protocol test files don't mock `../lib/storage.js` → real PUT with `S3_*` exported locally. Require: `vi.mock('../lib/storage.js', …)` as in `context.test.ts:22-26`.
- **L2** `protocol-generation.ts:142` — `getPromptMemory` awaited with no time-box; suggest `Promise.race` like `archivePrompt`.
- **L3** `storage.ts:114-122` `putObject` untested. Backlog.
- **L4** (declared) `<previous_protocol>` no size budget → kie.ai 400 permanent → FAILED. Owner decision.
- **Info** archive timeout doesn't abort the PUT; transcript not trimmed; CJK token estimate; `<input_format>` wording; flag read from `process.env` vs `deps.env`.
- Regressions against base: none found.

## 5. Deviations (1–12): all accepted (details in the PR body); undeclared: none.

## 6. CI, size, tests, mutations

CI run 37692525860 success. 21 files, +1899/−52. Clone setup/tests exit 0 with a clean shell (no S3/Deepgram/kie env). Worker suite 23/315, 0 skipped. Reproduction via `git worktree add ../old 2570d0a669`: 3/3 pass; `cmp` IDENTICAL ×8. Mutations 8/8 caught, M9 control 15/15 pass; files restored.

## 7. Cleanup

`review_clone.sh --cleanup /tmp/orch-review.7j5OKK` → removed (clone, `../old` worktree, scratch). Main checkout read-only. No PR actions, no real external calls.

