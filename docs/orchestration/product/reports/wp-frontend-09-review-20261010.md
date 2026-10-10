# Сверка — WP-FRONTEND-09 (PR https://github.com/ITSalt/transcriber/pull/42, `ad04147344` -> `main @ 06582ba529`) — 2026-10-10

Раунд 1. Дифф: 4 files changed, 19 insertions(+), 2 deletions(-) (файлов: 4).

**Решение: `ACCEPTED WP-FRONTEND-09`** — диф ровно по объёму (4 файла, +19/−2): `.default(null)` снят у обоих полей, тест контракта чувствителен к мутации (M1), единственные две фикстуры без полей исправлены, остальные уже в main; клон: `pnpm test` 90 файлов / 1194 теста passed, typecheck зелёный, CI pass 3m3s; AGENTS.md не создан.

## Пункты REVISE

— нет.

### Не требуется

— ничего.

## Вопросы владельцу

— нет.

## Принято как есть / backlog

- Отклонение 1 (тест контракта как новый `it` в существующем `shared/src/api/api.test.ts`, а не отдельный файл) — принято: критерий 4 требует «один новый тест», не файл.
- Отклонение 2 (`pnpm test`/typecheck в чистом worktree требуют `pnpm --filter @transcrib/shared build`) — поведение репозитория до пакета, не связано с дифом.
- Info: PR-отчёт «13 тестов упали» воспроизведено точно (11 speakers + 2 start-action). Мутации M2/M2b/M3: фикстуры проходят через `schema.parse` в `web/src/lib/api.ts:96-97`, поля в них несущие.
- graph: checked — пакет граф не трогает (`Граф: нет`; в дифе нет `graph-infra/**`, `.tl/**`).

## Автоматические находки

- не найдено

Дифф ревизии (пересдачи): —

---

## Отчёт рецензента (дословно)

<отчёт рецензента как есть; для пересдачи, которую оркестратор сверяет сам, — чтение диффа и CI>

ACCEPT. Verdict: the PR does exactly what the package asks and nothing more: two `.default(null)` removed in `shared/src/api/uc002.ts`, a mutation-sensitive contract test added in `shared/src/api/api.test.ts`, and the only two web fixtures that lacked the fields patched (`start-action.test.tsx:23-24`, `speakers.test.tsx:27-28`; `RetryProcessingButton.test.tsx:71-72` and `meeting/index.test.tsx:71-72` already had them on base). Every `MeetingDetailResponse`-shaped fixture in `web/src/**/*.test.ts*` carries both fields; nothing bypasses the schema (`web/src/lib/api.ts:96-97` parses every response; consumers `routes/meeting/index.tsx:18`, `features/context/StartRecognitionAction.tsx:32`, `features/speakers/SpeakersConfirmation.tsx:32`). API always emits both keys (`api/src/services/uc-002.service.ts:68-69`), route uses the schema as the 200 response (`api/src/routes/uc-002.ts:25`), `api/src/routes/uc-002.test.ts:107-119` asserts both cases. Diff = exactly 4 files inside allowed paths; no AGENTS.md on head or base (D-17).
CI: `Lint + Typecheck + Test pass 3m3s` (run 38054847229). Clone (`review_clone.sh --keep`, log scratchpad/clones/review_run.log): setup ×3 exit 0; web test exit 0; `pnpm -r typecheck` exit 0; `pnpm test` exit 0 → Test Files 90 passed | 12 skipped; Tests 1194 passed | 104 skipped; shared `api.test.ts` 48 passed.
Mutations: M1 re-add `.default(null)` on `project_id` → the new test fails (`expected true to be false`), 47 others pass; restored, 48/48. M2 drop `project_id: null` from `speakers.test.tsx` → 11 failed. M2b same in `start-action.test.tsx` → 2 failed | 2 passed. M3 drop from untouched `RetryProcessingButton.test.tsx` base fixture → 12 failed (untouched fixtures are schema-checked; the earlier 63-failure M5 no longer reproduces because those fixtures were fixed on main between WP-FRONTEND-08 and this base). Working tree clean after every restore.
Findings: none above Info. graph: checked — package touches no graph (header `Граф: нет`).
Cleanup: `review_clone.sh --cleanup .../orch-review.JixzQc` → removed, exit 0. Nothing pushed, posted, merged or approved; main checkout untouched.
