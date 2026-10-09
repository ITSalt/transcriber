# Сверка — WP-WEB-PROJECTS-02 (PR https://github.com/ITSalt/transcriber/pull/34, `d155b8f0fa` -> `main @ 5392bbe5e1`) — 2026-10-09

Раунд 1. Дифф: 8 files changed, 164 insertions(+), 50 deletions(-) (файлов: 8).

**Решение: `REVISE WP-WEB-PROJECTS-02`** — объём и пути соблюдены, но критерий 3 не выполнен: собственный тест PR падает детерминированно (CI run 37919106478 красный), предзаполнение `?project=` не покрыто тестом, граф по шапке пакета не обновлён.

## Пункты REVISE

1. `web/src/features/projects/projects.test.tsx:129-133` → мок встречи без `language`, `updated_at`, `duration_sec`; `WorkspaceMeetingListResponse.parse` в моке бросает, компонент показывает `meetings.error`, `findByTestId` (`:137`) таймаутит — падает в CI и в клоне поодиночке → критерий приёмки 3 (`pnpm --filter @transcrib/web test` зелёный). Требование: дополнить мок (`updated_at`, `language: null`, `duration_sec: null`), CI зелёный. Серьёзность: High.
2. `web/src/routes/upload/index.tsx:57,65-68` → предзаполнение проекта из `?project=` не покрыто ни одним тестом (мутация «prefill → null» остаётся зелёной 19/19 и 12/12) → объём п. 4 (тесты на всё). Требование: тест рендера `/upload?project=<PID>` с проверкой значения `context-project` (и `project_id` в PUT context). Серьёзность: Medium.
3. `web/src/routes/upload/index.tsx:67` + `web/src/features/context/ContextForm.tsx:138-151` → чужой/удалённый/неизвестный id в `?project=` остаётся в черновике: select показывает «Без проекта», `useProject` 404 не показан, «Начать распознавание» шлёт PUT context с этим id → 404/400 и необъяснимая ошибка → объём п. 3 («предзаполняет проект»). Требование: применять prefill только если id есть в `useProjects().data.items`, иначе сбрасывать `projectId`; тест на неизвестный id. Серьёзность: Medium.
4. Шапка пакета: «Режим: `/nacl-sa-ui` под замком `graph`», «Граф: форма карточки проекта (блок «Встречи»); FORM-MeetingUpload — поле удаляется» → не сделано, замок не запрашивался (Deviations 3) → правило модуля spec-first. Требование: `LOCK graph` → `/nacl-sa-ui`: блок «Встречи» на форме карточки проекта; проверить FORM-MeetingUpload — поля «Количество спикеров» быть не должно (WP-SPEC-01 переводил подписи полей, мог оставить) → `UNLOCK graph`. Серьёзность: Medium.
5. `web/src/features/projects/api.ts:22` → ключ `["projects","meetings",id]` не инвалидируется удалением/повтором встречи (`routes/meeting/hooks/useDeleteMeeting.ts:18` инвалидирует только `["meetings"]`, staleTime 30 с) → после удаления встречи с карточки проекта она 30 с видна в блоке, клик даёт 404. Требование: ключ под `["meetings", workspaceId, {project_id}]` (правка в области модуля). Серьёзность: Low, входит в раунд (одна строка).

### Не требуется

- Подпись `catalog.status.AWAITING_START` в `web/src/i18n/**` — не в области; добавлена в WP-FRONTEND-07 (PR #35, Deviations 1).
- Переносить блок «Встречи» во вкладку — размещение над участниками принято.
- Правки хуков `routes/meeting/**` (вне области).

## Вопросы владельцу

нет

## Принято как есть / backlog

- Deviations 1 (`speaker_count` остаётся строкой в `not.toHaveProperty`) — принято.
- Deviations 2 («файлы поодиночке проходят») — не подтверждено для `projects.test.tsx` (падает и поодиночке); таймауты `auth.test.tsx`/`context.test.tsx` в полном прогоне — нагрузка, поодиночке зелёные.
- Deviations 4 (AGENTS.md) — D-17.
- Backlog: `toLocaleString()` без локали i18n в `ProjectMeetings.tsx:7` (как в `MeetingRow.tsx:13`).

## Автоматические находки

- не найдено

Дифф ревизии (пересдачи): —

---

## Отчёт рецензента (дословно)

Verdict: REVISE. Acceptance criterion 3 ("pnpm --filter @transcrib/web test green") is not met: the PR's own new test `projects feature > shows the project's meetings with links to /meetings/:id` fails deterministically, both in CI (run 37919106478 on this exact SHA) and in the clone (full run and single-file run). Cause: the mocked meeting lacks `language`, `updated_at`, `duration_sec` required by `MeetingListItem` (`shared/src/api/uc001.ts:11-14`); the mock calls `WorkspaceMeetingListResponse.parse`, throws, the component renders `meetings.error`, `findByTestId` at `:137` times out. M0 (add fields) → 7/7 pass.

F1 High — PR's own test fails; CI red (above). F2 Medium — `?project=` prefill (`routes/upload/index.tsx:57,65-68`) has no test: mutation M2 (prefill → null) leaves 19/19 and 12/12 green. F3 Medium — graph/spec not updated although the package header required `/nacl-sa-ui` under the graph lock; session skipped without requesting the lock. F4 Medium — unknown/foreign `?project=` id silently kept in the draft (`index.tsx:67`, `ContextForm.tsx:138-151`): select shows «Без проекта», `useProject` 404 not surfaced, PUT context with the foreign id → backend 404/400 → raw error banner, state stays `uploaded`. F5 Low (pre-existing) — `AWAITING_START` has no `catalog.status.*` label in core i18n. F6 Low — key `["projects","meetings",id]` (`api.ts:22`) not invalidated by `useDeleteMeeting.ts:18` (`["meetings"]`), staleTime 30 s.

Allowed paths: all 8 files inside `web/src/routes/upload/**` and `web/src/features/projects/**`; no shared paths. Request shape: `workspace_id` from `useWorkspaceId()`, query disabled until ids known, `project_id` asserted (M1 caught after M0). i18n keys present in ru/en; no hardcoded Cyrillic in rendered TSX. Status labels resolve through default namespace like `StatusBadge.tsx`. `speaker_count`/`speakerCount` gone from upload state, validation, init/complete bodies and `features/context` (only `index.test.tsx:285,293` assertions remain); M3 (speaker_count back in complete body) caught.

Claims: nav label — verified; block + request — verified in code, test broken; `title ?? filename`/date/status/link — verified; empty state + upload link — verified; field removal — verified (init never sent it on base, only complete did); prefill — verified in code, untested; "tests for all" — not verified; "files pass individually" — false for `projects.test.tsx`; graph skipped — verified; AGENTS.md absent — verified; `pnpm -r typecheck` green — verified.

CI: `Lint + Typecheck + Test` fail on d155b8f (run 37919106478): Test Files 1 failed | 18 passed; Tests 1 failed | 267 passed. Clone (orch-review.WE6d5f): setup exit 0; `pnpm --filter @transcrib/web test` exit 1; full rerun 3 failed files (projects F1; auth and context timeouts under load — green individually); `pnpm -r typecheck` exit 0. Mutations: M0 proves cause; M1 caught; M2 NOT caught; M3 caught. Cleanup: clone removed, temp ref deleted, main checkout untouched.
