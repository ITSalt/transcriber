# Сверка — WP-WEB-MEMORY-01 (PR https://github.com/ITSalt/transcriber/pull/14, `dd0ee730e5` -> `main @ 2570d0a669`) — 2026-10-07

Раунд 1. Дифф: 14 files changed, 1458 insertions(+) (файлов: 14).

**Решение: `REVISE WP-WEB-MEMORY-01`** — весь объём реализован в своей папке, контракт парсится Zod-схемами shared, 6 мутаций ловятся, CI зелёный; два мелких дефекта в своих файлах закрываются одной пересдачей (сессия жива, merge всё равно после API-MEMORY-01 и WEB-PROJECTS-01), аутлет `protocol.toolbar` — обязанность WEB-FEEDBACK-01 (вписано в его пакет).

## Пункты REVISE

1. `web/src/features/memory/api.ts:114` -> двое подтверждают одно событие: второй получает 409, alert показан, но элемент (уже CONFIRMED/REJECTED на сервере) остаётся в очереди с активными кнопками и счётчик устарел до ручного обновления -> требование: инвалидировать `["memory", projectId]` в `onSettled` (или и при ошибке), чтобы очередь перезапрашивалась после 409/404; тест: 409 → очередь перезапрошена; low.
2. `web/src/features/memory/components/TaskDetail.tsx:97` + `TaskEditForm.tsx` -> форма ключуется `${code}-${updated_at}`: реальный PATCH меняет `updated_at`, перезапрос перемонтирует форму и «Сохранено» исчезает (ревьюер воспроизвёл: `SAVED_VISIBLE_AFTER_REFETCH=false`); тест проходит только потому, что мок GET возвращает старый `detail` -> требование: поднять состояние `saved` выше ключуемой формы (или toast через `use-toast`), а в тесте мок перезапроса должен возвращать обновлённую задачу; low.

### Не требуется

- Аутлет `protocol.toolbar` на странице протокола (M-1) — чужой путь, вписан в WP-WEB-FEEDBACK-01 п. 8; E2E/скриншоты — по-прежнему после merge API-MEMORY-01 и WEB-PROJECTS-01.
- A11y вкладок (L-3), неиспользуемые ключи i18n, дедупликация участников по имени (Info) — backlog, не в этом раунде.
- `/nacl-tl-sync` не запускать: контракт подтверждён парсингом ответов Zod-схемами shared (AC-2 принят).
- CLAUDE.md/AGENTS.md — D-17.

## Вопросы владельцу

нет

## Принято как есть / backlog

- Отклонения PR 1–7 приняты (E2E отложен; D-17; флаки полного прогона — только предсуществующий RQ-008; исполнители из существующих задач — по контракту; версии сводки без текста — по контракту; ссылки `/projects/:id?mem=…` и `?t=<ms>` — якорь на стороне страницы транскрипта остаётся её владельцу; ветка от 2570d0a). Необъявленное: счётчик очереди на вкладке, а не «в шапке проекта» — принято (слота шапки проекта нет), WEB-PROJECTS-01 может вывести `useReviewQueue(projectId).data.count` в своей шапке.
- M-1 аутлет `protocol.toolbar` — зависимость доставки, вписана в WP-WEB-FEEDBACK-01 п. 8; проверяется при E2E доставки.
- L-3 a11y вкладок (aria-controls/labelledby, стрелки) — backlog.
- Info: неиспользуемые `refs.tasks`/`refs.decisions`; UUID встречи как текст ссылки без CREATED-упоминания; дедуп участников по имени; определение недоступности памяти только по статусу 503 (`ApiError` без `code` — правка `lib/api.ts` вне пакета; возможно, FRONTEND-02 добавил `ApiError.code` — проверить при merge); `errorElement` в роутере отсутствует — до WEB-PROJECTS-01 ссылка `/projects/:id` вела бы на стандартную ошибку, неактуально без аутлета.
- Не покрыто тестами (к сведению): смена исполнителя на участника, фильтр по имени, бейджи pending_count/merged_into, generic-ошибка и loading, reject → перезапрос, 409 на reject.
- graph: не требуется (пакет без спецификации — UI уточнение UC-60x делает `/nacl-sa-ui` при желании; в шапке «Граф: нет»).

## Автоматические находки

- не найдено

Дифф ревизии (пересдачи): —

---

## Отчёт рецензента (дословно)

# Review report — PR #14, WP-WEB-MEMORY-01, head `dd0ee730e57fc918cbed30dd72705fd4a6b3b00f` vs `main@2570d0a669`

## 1. Verdict: ACCEPT with condition

The feature implements every section-2 item inside `web/src/features/memory/**` only, parses every response with the shared Zod schemas, hides illegal status transitions, sends only changed PATCH fields, handles 503 distinctly, and wires confirm/reject to the contract endpoints with cache invalidation. CI is green; typecheck clean; 16/16 feature tests green; all 6 mutations I applied were caught. Conditions are delivery-side, not code-side: (a) scope item 4 (T-n/D-n links on the protocol page) has **no host outlet on main** — `routes/protocol/**` renders no `SlotOutlet name="protocol.toolbar"`, so the orchestrator must make sure the web-feedback package adds it before this item is considered delivered; (b) the two Low findings below (stale queue item after 409; "Saved" flash lost on refetch) can be fixed in a follow-up or together with the deferred E2E. No regression against base: the diff is additive (14 new files, 0 deletions).

## 2. Scope / acceptance → code → status (head dd0ee73)

| Item | Where | Status |
|---|---|---|
| 2.1 «Задачи» tab, filters status/assignee | `components/TasksTab.tsx:42-78` (selects), `api.ts:33-46` (`?status=&assignee=`) | Done; test `tasks tab: filters` |
| 2.1 task history: created-in meeting, mentions with quote + transcript timecode link, change log | `components/TaskDetail.tsx:35-45` (created in), `:53-72` (mentions, `?t=<ms>` link at `:64`), `:81-92` (events) | Done; test `task history` |
| 2.1 «Решения» | `components/DecisionsTab.tsx` | Done; test `lists decisions` |
| 2.1 «Сводка» current + version history | `components/SummaryTab.tsx:17-35` | Done (versions as metadata list, deviation 5); 2 tests |
| 2.2 «На подтверждение»: PENDING list, quote, was → became, Confirm/Reject | `components/ReviewQueueTab.tsx:23-59`; `api.ts:100-116` POST `/api/task-events/:id/confirm|reject` | Done; 3 tests |
| 2.2 counter «в шапке проекта» | `components/ProjectMemoryTabs.tsx:93-97` — badge on the «На подтверждение» tab, not in a project header | Done with placement deviation (no project-header slot exists on main) |
| 2.3 manual edit status/assignee/due (source=USER is server-side) | `components/TaskEditForm.tsx:43-54`, transitions `:39-41` | Done; 4 tests |
| 2.4 protocol page links to T-n/D-n | `components/MeetingMemoryRefs.tsx`, registered at `index.ts:10` as `protocol.toolbar` | Implemented in the feature, **not visible on main** (no outlet in `routes/protocol/**`; Finding M-1) |
| 2.5 no graph viz / kanban | — | Respected |
| AC1 web tests: filters, history, confirm/reject, manual edit | `memory.test.tsx:160-364` | Met |
| AC2 `/nacl-tl-sync`, typecheck, tests green | typecheck exit 0 in clone; CI pass; `/nacl-tl-sync` **not run** (PR body dev. 1) | Partially met (sync not run — orchestrator to decide) |
| AC3 local E2E + screenshots | — | Deferred by the orchestrator; not evaluated |
| AC4 mocks via Zod schemas | `memory.test.tsx:52,144,148,289,335,372,400,450` (10 `.parse(` calls) | Met |

## 3. Answers to the risk questions

**Q1 Contract conformance.** Every request matches `shared/src/api/memory.ts`: `GET ${base}/tasks?status=&assignee=` (`api.ts:41-44`), `GET /tasks/:code` (`:52`), `PATCH /tasks/:code` (`:95`), `GET /decisions` (`:60`), `GET /memory` (`:67`), `GET /review-queue` (`:75`), `POST /api/task-events/:id/confirm|reject` (`:110-113`), `GET /api/meetings/:id/memory-refs` (`:84`). All responses go through `apiGet/apiPatch/apiPostEmpty(path, Schema)` which call `schema.parse(json)` with the shared schemas, so a drift throws a ZodError → QueryState shows the generic error. The PATCH body is typed as `TaskPatchRequest` and built field-by-field with the contract's names (`TaskEditForm.tsx:45-51`). No invented fields: participants are derived from `items[].assignee` of the unfiltered task list (`TasksTab.tsx:27-37`); summary history shows `version`/`created_at` only.

**Q2 Slots.** `index.ts:7-14` exports `default { slots: { "project.tabs": ProjectMemoryTabs, "protocol.toolbar": MeetingMemoryRefs } }`; the loader does `raw.default ?? raw` and `mod.routes ?? []` (`lib/features.ts:66-69`), so routes are optional. Both components take `SlotContext` (`{ meetingId?, projectId? }`); `ProjectMemoryTabs` returns null without projectId (`:23-26`); `MeetingMemoryRefs` runs its query with `enabled: Boolean(meetingId)` and returns null until `data.project_id` exists. My probe rendered both with no props: empty DOM, zero fetch calls. Caveat: on main no page renders `protocol.toolbar` (outlets only for `header.right` and `meeting.actions`), see M-1.

**Q3 D-14 queue.** Confirm/reject post to `/api/task-events/${eventId}/${action}` (`api.ts:110`) and `onSuccess` invalidates `["memory", projectId]` (`:114`); mutation M4 (invalidation removed) failed that test. Errors are shown via `role="alert"` (`ReviewQueueTab.tsx:14-18`), tested for 409. After a 409/404 **error** nothing is invalidated (`onSuccess` only), so the already-reviewed item stays on screen with live buttons until the user navigates (Finding L-1).

**Q4 Status transitions.** `statusOptions = STATUSES.filter(s => s === task.status || canTransitionTaskStatus(task.status, s))` (`TaskEditForm.tsx:39-41`) hides disallowed options; a server rejection is still displayed (`:110-114`). Mutation M1 (all statuses offered) → `restricts a DONE task to reopening` fails.

**Q5 Mutations.** M2 `QueryState.tsx:18` `unavailable = false` → `degradation` test fails. M3 PATCH sends all three fields → `PATCHes only the changed fields` and `can unassign` fail. Details in section 6.

**Q6 i18n.** `jq paths` on both files: 68 leaf keys each, `diff` empty — key sets identical. No Cyrillic and no JSX text literals in any component. `refs.tasks` and `refs.decisions` are defined but unused (Info). Server error messages are Russian regardless of UI language — inherited from the contract design.

**Q7 Auto-wiring safety.** `git diff --stat 2570d0a669..dd0ee73`: 14 files, all under `web/src/features/memory/`. No `routes`, no `navItems`, so no collisions; the base's `features.test.tsx` assertions on navItems stay true (full web suite ran). i18n namespace `memory` auto-registered.

**Q8 States and a11y.** Each tab wraps its query in `QueryState` (loading, 503 vs generic error, `role="alert"`); empty states present. Selects carry `aria-label` and a wrapping `<label>`, tabs use `role="tab"`/`aria-selected`. Gaps: no `aria-controls`/`aria-labelledby` between tab and `tabpanel`, no arrow-key navigation (L-3). Only `MeetingMemoryRefs` is silent on error (returns null) — intended for a toolbar.

**Q9 Tests.** All 16 tests render real components inside `QueryClientProvider` + `MemoryRouter` with `vi.stubGlobal("fetch")`; 10 mock bodies are built with `.parse()` of the shared schemas. Not covered: assignee change to a participant (only unassign), free-text assignee filter by name, `pending_count`/`merged_into` badges, generic (non-503) error state, loading state, decisions/tasks empty states, reject → queue refresh (only the call is asserted), 409 on reject, tab switching with an invalid `?mem=`, deep link `?task=` (probed: works), slot components without props (probed: fine), `TaskDetail` with `created_in_meeting_id=null`.

**Q10 CI.** `gh pr checks 14`: "Lint + Typecheck + Test — pass — 1m57s" (run 37692403976) for head dd0ee73.

## 4. Findings

**Medium**
- **M-1 — `protocol.toolbar` has no host on main; scope item 4 is invisible.** `index.ts:10` registers `MeetingMemoryRefs`, but `git grep SlotOutlet` on `2570d0a669` finds outlets only in `components/layout/app-shell.tsx:48` (`header.right`) and `routes/meeting/index.tsx:99` (`meeting.actions`); `routes/protocol/**` has none. Not a defect of this package (allowed paths exclude `routes/protocol`). Require: the orchestrator verifies the web-feedback package adds `<SlotOutlet name="protocol.toolbar" meetingId={id} />` and includes it in the deferred E2E.

**Low**
- **L-1 — Stale queue item after confirm/reject error.** `api.ts:114` invalidates only `onSuccess`. Scenario: two users review the same event; second gets 409 → alert shown, but the item remains listed with enabled buttons and the counter stays stale until a manual refresh. Require: invalidate `onSettled` (or on error).
- **L-2 — "Saved" confirmation vanishes immediately in production.** `TaskDetail.tsx:97` keys `TaskEditForm` by `${code}-${updated_at}`; a real PATCH changes `updated_at`, the refetch remounts the form and resets `saved` (probe: `SAVED_VISIBLE_AFTER_REFETCH=false`). The existing test only passes because the mocked GET returns the unchanged `detail`. Require: lift `saved` state above the keyed form (or a toast), and have the test's refetch mock return the updated task.
- **L-3 — Tab a11y wiring.** `ProjectMemoryTabs.tsx:81-99` tabs lack `id`/`aria-controls`, the `tabpanel` lacks `aria-labelledby`, no roving tabindex/arrow keys. Follow-up.

**Info**
- `i18n/{ru,en}.json` keys `refs.tasks`, `refs.decisions` unused.
- `TaskDetail.tsx:38-41` falls back to the raw meeting UUID as link text when no CREATED mention exists.
- `TasksTab.tsx:33` dedupes people by name.
- `QueryState.tsx:18` detects unavailability by `status === 503` only, since base `ApiError` carries no `code`.
- `createBrowserRouter` in `App.tsx` has no `errorElement`; until WP-WEB-PROJECTS-01 lands, `/projects/:id` links would hit react-router's default error page. Irrelevant on main today (no outlet, M-1).

No regressions against base: no base file is touched; `features.test.tsx` still passes with the new feature registered.

## 5. Deviations (PR body)

1. E2E/screenshots deferred — accepted by the orchestrator; `/nacl-tl-sync` not run — orchestrator's call.
2. `instructions check` exit 1 — D-17; accepted.
3. Flaky full `pnpm test` — reproduced: only `RQ-008` (upload) timed out at 5 s, passes with `--testTimeout=60000`; no failure from this feature. Accepted.
4. Assignee options from existing tasks' assignees — matches the contract; accepted.
5. Summary versions as metadata list — matches `ProjectMemoryVersion`; accepted.
6. Links to `/projects/:id?mem=tasks&task=T-n` and `/meetings/:id/transcript?t=<ms>` — accepted; `?task=` deep link verified.
7. Branch from local `origin/main` 2570d0a — verified: merge-base `2570d0a66924…`, single commit.
Undeclared: counter placed on the tab instead of «в шапке проекта» (2.2). Accept; record so WEB-PROJECTS-01 can surface `useReviewQueue(projectId).data.count` in its header.

## 6. CI, size, tests, mutations

- CI: `gh pr checks 14` → pass (run 37692403976) for dd0ee73.
- Size: 14 files, +1458/−0, all `web/src/features/memory/**`.
- Clone: install 0, db:generate 0, shared build 0; `pnpm --filter @transcrib/web test`: 171/172 (RQ-008 timeout, pre-existing), rerun with `--testTimeout=60000` → 18/18; `memory.test.tsx` 16/16; `pnpm -r typecheck` 0.
- Mutations: M1 all statuses offered → 1 failed; M2 503 as generic → 1 failed; M3 PATCH all fields → 2 failed; M4 no invalidation → 1 failed; M5 assignee filter dropped → 1 failed; M6 Confirm posts reject → 2 failed. All reverted, `git status` clean.
- Probes: slot components without props → empty DOM, 0 fetches; `?mem=tasks&task=T-1` → detail + form open; "Saved" lost after refetch with bumped `updated_at`.

## 7. Cleanup

`review_clone.sh --cleanup /tmp/orch-review.9a1iXp` → removed. No files written to the module repository or its worktrees; no PR actions taken.

