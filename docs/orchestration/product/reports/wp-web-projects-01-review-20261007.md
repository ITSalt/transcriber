# Сверка — WP-WEB-PROJECTS-01 (PR https://github.com/ITSalt/transcriber/pull/19, `d2d18ffef1` -> `main @ 2570d0a669`) — 2026-10-07

Раунд 1. Дифф: 21 files changed, 2392 insertions(+), 14 deletions(-) (файлов: 21).

**Решение: `REVISE WP-WEB-PROJECTS-01`** — объём выполнен, контракт сверен по Zod-схемам, 5/5 мутаций ловятся, CI зелёный; два средних дефекта в путях пакета (встреча застревает в AWAITING_START без выхода из UI; статус ответа complete не учитывается) и один пункт при rebase на FRONTEND-02 (жёсткий legacy-workspace ломает изоляцию).

## Пункты REVISE

1. `web/src/routes/upload/index.tsx:67-68,225-226` -> после `complete` (defer_start) пользователь перезагрузил страницу, кликнул в навигацию или выбрал другой файл до «Начать» → встреча в `AWAITING_START`, ни карточка встречи, ни каталог не дают запустить её, черновик контекста потерян -> требование: действие «Начать распознавание» в слоте `meeting.actions` для встреч в `AWAITING_START` (путь `features/context/`, там же форма контекста для дополнения перед стартом) и/или сохранение `{meetingId, draft}` в localStorage с возобновлением на `/upload`; тест; medium.
2. `web/src/routes/upload/index.tsx:216-226` -> сервер ответил `status:"TRANSCRIBING"` (текущий прод-бэкенд игнорирует `defer_start`; A-5 допускает оба значения) → UI показывает «ждёт старта», «Начать» → POST /start → 404/409, навигации нет -> требование: при `result.status === "TRANSCRIBING"` сразу переходить на карточку встречи; тест с моком `TRANSCRIBING`; medium (делает зависимость от порядка merge отказоустойчивой).
3. `index.tsx:251-254` -> 409 `MEETING_NOT_AWAITING_START` на `/start` оставляет пользователя на странице загрузки, хотя встреча уже запущена -> при `ApiError.status === 409` переходить на карточку; low.
4. **При rebase на WP-FRONTEND-02** (после его merge, отдельное сообщение): `features/projects/workspace.ts` удалить; `useProjects`/`useCreateProject` берут `useWorkspaceId()` из `lib/session.tsx` (хук, чтобы ключ запроса следовал за переключателем); убрать явный `workspace_id` из тел init/complete/abort (его подставляет `lib/api.ts`); тесты обернуть в `test-utils` сессии. Без этого после FRONTEND-02 проекты и загрузки попадут в legacy-пространство независимо от выбранного (high при rebase; сейчас не дефект).

### Не требуется

- Не трогать `lib/api.ts`, `lib/session.tsx` (чужой поток, FRONTEND-02 ещё не в main); пункт 4 — только после rebase.
- Low: Enter в полях контекста отправляет форму загрузки (F4), тихий даунгрейд источника предыдущего протокола (F6), клиентская проверка длины вставленного протокола (F7), `text-red-600` вместо токена (F8, как в базе) — backlog; inline-редактирование участников/терминов не требуется пакетом.
- E2E/скриншоты — после merge API-PROJECTS-01 и WORKER-01; `/nacl-tl-sync` — принят через Zod.

## Вопросы владельцу

нет (P-16 про бюджет предыдущего протокола открыт; сервер ограничивает 200 000 символов)

## Принято как есть / backlog

- Отклонения PR приняты: E2E отложен; `/nacl-tl-sync` через Zod; D-17; нативный `<select>` (токены ITSALT используются, jsdom-обоснование верно); RQ-008 таймаут 30 с в своём файле; lazy-страницы проектов (цикл импорта реален: slot.tsx читает featureRegistry на верхнем уровне); `defer_start` всегда и состояние «загружено, ждёт старта» — по D-9, с поправками п. 1–2.
- Хост `project.tabs` для WEB-MEMORY-01 есть (`ProjectDetailPage.tsx:208-210`).
- Слот слияния: после WP-API-PROJECTS-01 и WP-WORKER-01 — обязателен (без API /start текущий бэкенд даёт 404).
- Info: нет метки `catalog.status.AWAITING_START` в root i18n (вне путей; поручить FRONTEND-02-потоку при rebase или WEB-PROJECTS — через свою фичу нельзя; оркестратор внесёт в пакет уборки frontend); хуки обновления участников/терминов не используются.
- graph: не требуется (шапка «Граф: нет»; UC-100/UC-500 уточняет `/nacl-sa-ui` при желании).

## Автоматические находки

- не найдено

Дифф ревизии (пересдачи): —

---

## Отчёт рецензента (дословно)

# Review — WP-WEB-PROJECTS-01, PR #19 (`d2d18ffef1` → `main @ 2570d0a669`)

## 1. Verdict: **ACCEPT with condition**

All five scope items are implemented inside the allowed paths, every acceptance criterion that is not deferred has a test, the mocks are parsed through the shared Zod schemas, the five mutations I ran each break exactly the test that claims to cover them, CI is green for the head SHA, and the clone reproduces 179/179 + typecheck. The condition is twofold: (a) the merge slot "after WP-API-PROJECTS-01 and WP-WORKER-01" is **mandatory, not advisory** — against the current backend the upload flow becomes a dead end (evidence in Q2); (b) at rebase onto FRONTEND-02 (PR #13) the workspace id derivation in `features/projects/workspace.ts` must be replaced, or uploads and projects will silently land in the legacy workspace regardless of the selected one (Q4). Neither is a defect of the PR against today's `main`; both are integration conditions the orchestrator owns. One Medium finding (meeting orphaned in `AWAITING_START` after reload/navigation; no UI path out) I recommend fixing in a follow-up or as a REVISE item at the orchestrator's discretion — the package does not require a start from the meeting card, so I do not block on it.

## 2. Scope → code → status (head `d2d18ffef1`)

| # | Item | Where | Status |
|---|---|---|---|
| S1 | Projects section: list, create, card (description, participants name/aliases/role/org/side, glossary term/variants/definition/asr flag) | `web/src/features/projects/ProjectsListPage.tsx`, `ProjectDetailPage.tsx:109-206`, `forms.tsx`, `api.ts`, `index.ts` (routes `/projects`, `/projects/:projectId`, nav item order 15) | Done. No edit UI for an existing participant/term (hooks `useUpdateParticipant`/`useUpdateGlossaryTerm` exist in `api.ts:111,142` but are unused) — package wording does not require it. |
| S2 | Upload screen: optional project → read-only participants/glossary «из проекта»; additions block (type, goal, agenda, extra participants/terms, previous protocol project/paste/.md/.txt/none, notes); «Добавить в проект» button only; `deferStart`; «Начать распознавание» after upload | `routes/upload/index.tsx:40-47,67-69,217-228,237-256,356-360,403-423`; `features/context/ContextForm.tsx`; `draft.ts` | Done. `defer_start: true` at `index.tsx:222`; start button `index.tsx:403-413` gated on `canStart = uploadState === "uploaded"`. |
| S3 | Meeting card: view of used context (snapshot) | `features/context/ContextSnapshotAction.tsx` via `slots["meeting.actions"]` (`context/index.ts:6-8`); host exists at base `routes/meeting/index.tsx:99` | Done. |
| S4 | Hint: ≤50 names/terms go to recognition | `ContextForm.tsx:345-357`, `draft.ts:117-130`, ru `limitHint` | Done, with live count and over-limit warning. |
| S5 | Not done: editing context after start | No edit path exists; snapshot dialog is read-only | Respected. |

| AC | Evidence | Status |
|---|---|---|
| AC1 web tests: project fill-in, additions don't change project, start after upload, skip context | `routes/upload/context.test.tsx:183,197,205,216,264` | Pass; mutation-verified (§6). |
| AC2 `/nacl-tl-sync` no drift; typecheck/tests green | sync not run (Neo4j MCP down, deviation accepted by orchestrator); typecheck exit 0 in clone; 179/179 | Pass with accepted deviation. |
| AC3 local E2E + screenshots | — | Deferred by orchestrator. |
| AC4 mocks parsed by shared Zod schemas; "E2E after API merge" mark | `context.test.tsx:26,51,65,118,122,131,243`; `projects.test.tsx:31-39`; `snapshot.test.tsx:12`; PR body states deferral | Pass. |

## 3. Risk questions

**Q1 Contract conformance.** Every call matches `shared/src/api/project.ts` / `context.ts` / `uc100.ts` at base. `GET /api/projects?workspace_id=` → `ProjectListResponse` (`projects/api.ts:29`); `POST /api/projects` body `{workspace_id,name,description}` → `ProjectDetailResponse` (`:74-79`); `GET/PATCH/DELETE /api/projects/:id` (`:36,89,97`); `POST/PATCH/DELETE …/participants[/:id]` with `ParticipantInput`/`ParticipantUpdate` (`:106,115,128`); same for glossary (`:137,146,159`); `GET …/last-protocol` → `LastProtocolResponse`, 404 → `null` (`:47-52`). PATCH project always sends both `name` and `description` (`ProjectDetailPage.tsx:89-92`) — satisfies the `nonEmpty` refine; `description: null` is allowed by the schema. Side enum is driven by `ParticipantSide.options` and re-parsed on change (`forms.tsx:103,107`); meeting type likewise (`ContextForm.tsx:217,224`). `PUT /context` body built by `draft.ts:69-106`: additions carry `source:"meeting"`, `participant_id:null`/`term_id:null`; `previous_protocol` emits exactly the three discriminated shapes (`:73-86`); blanks → `null` (`:61-63`), which matters because the schema uses `shortText.min(1).nullable()` — an empty string would 400. `POST /start` uses `apiPostEmpty` (no body, no Content-Type) → `StartMeetingResponse` (`context/api.ts:22`). All responses go through `request()` → `schema.parse` (`lib/api.ts:41-42` at base). Gaps (Low): no client-side `maxLength` for goal/agenda/notes (2 000/10 000/20 000) or the 100/300 array caps — the server rejects and the error is surfaced, draft retained.

**Q2 Upload flow regression / current backend.** What changed in `routes/upload/index.tsx`: init/parts/complete sequence is untouched; `workspace_id: currentWorkspaceId()` added to init/complete/abort bodies (`:107,165,220`), `defer_start: true` added to complete (`:222`), and the post-complete branch replaced `setUploadState("done"); navigate(...)` with `setMeetingId(...); setUploadState("uploaded")` (`:225-226`). `result.status` is **not inspected**. Against the current backend: `api/src/services/uc-100.service.ts:226-229,257` at base always transitions to `TRANSCRIBING`, enqueues, and returns `status:'TRANSCRIBING'`; `defer_start` is accepted by the non-strict Zod object and ignored (no match for `defer_start` anywhere in `api/src` at base); there is no `/api/meetings/:id/start` route. So after this merge without API-PROJECTS-01: the file uploads, the server starts transcribing, the UI shows «файл загружен, ждёт старта», the user clicks «Начать» → POST /start → 404 → error banner, no navigation, and the user never reaches the meeting card from this screen. **The merge slot must hold.** Even after API-PROJECTS-01, the UI should branch on `result.status === "TRANSCRIBING"` → navigate immediately (A-5 says both values are valid); today it treats both as "waiting to start" — Medium finding F2.

**Q3 Order and failure modes.** `handleStart` (`index.tsx:238-255`): PUT only when `!isDraftEmpty(draft)`, then `startMeeting`, then navigate; any throw → `errorMsg` set, state back to `"uploaded"`, so the draft (React state) is intact and the button is enabled again — retry works for PUT failure and for 503. On 409 `MEETING_NOT_AWAITING_START` the server message («Распознавание уже запущено») is shown but the UI stays on the upload page although the meeting is running — it should navigate (Low F5). The draft does **not** survive reload: `draft.ts` is pure helpers; state lives in `useState` (`index.tsx:67-68`) and `localStorage` is not used; `meetingId` is also lost. After a reload or any nav click between complete and start the meeting stays `AWAITING_START` with no UI that can start it (the meeting page's slot only shows a read-only snapshot/draft) — Medium F1. There is no draft to clear after start since navigation unmounts the page. Skip without context: `context.test.tsx:216-225` asserts zero PUTs and one POST /start; mutation M4 confirms.

**Q4 Workspace id derivation.** Single source: `features/projects/workspace.ts:8-14` — `localStorage.getItem("workspace_id") ?? LEGACY_WORKSPACE_ID`. Call sites: `projects/api.ts:25` (`useProjects`, non-reactive, baked into the query key), `:75` (`useCreateProject`), `routes/upload/index.tsx:107,165,220`. FRONTEND-02 (PR #13, head `feb98efd`) uses key `transcrib.workspace` via `SessionProvider` (`lib/session.tsx`, `WORKSPACE_STORAGE_KEY`), exposes `useWorkspaceId()`, and injects `workspace_id` into `/api/uploads/*` bodies **only if the body has none** (`withWorkspace`: `if (id && parsed.workspace_id === undefined)`). Consequence at rebase: this PR's explicit `workspace_id: LEGACY…` in upload bodies **wins over the selected workspace**, and the projects list/create also pin to LEGACY — uploads and projects go to the wrong workspace, and with BACKEND-01 membership checks a user who is not a member of the legacy workspace gets 404/400. REVISE-at-rebase items: (1) delete `workspace.ts`; (2) `useProjects`/`useCreateProject` take `useWorkspaceId()` (hook, so the query key follows the switch); (3) drop `workspace_id` from the three upload bodies and let `lib/api.ts` inject it; (4) `projects.test.tsx:73,83` and `context.test.tsx` wrap in the FRONTEND-02 session test-utils. Severity at rebase: High (data isolation).

**Q5 Mutations.** M1 additions auto-POST to project → 2 tests fail; M2 `defer_start:false` → 1 fails; M3 start before PUT → 1 fails; M4 always PUT → skip test fails; M5 start never disabled → 1 fails. Details in §6.

**Q6 Previous protocol.** Source *project*: `GET /api/projects/:id/last-protocol` (`projects/api.ts:42-58`) is fetched on project selection; the PUT sends `{source:"project", meeting_id, text:null}` (`draft.ts:81-85`) — the text is filled server-side per the contract comment. If the query has not resolved or errored (non-404) when Start is clicked, `lastProtocol.data` is undefined and the client silently downgrades to `{source:"none"}` (`draft.ts:76-86`) — Low F6; since `meeting_id` is nullable in the schema, sending `{source:"project", meeting_id:null}` and letting the server resolve would be safer. Source *upload*: textarea paste or `<input type="file" accept=".md,.txt,text/markdown,text/plain">` read with `File.text()` (`ContextForm.tsx:108-117`); no docx. Size: file text checked against `PREVIOUS_PROTOCOL_MAX_CHARS` (200 000) after reading (`draft.ts:108`), but **pasted** text is not checked client-side and the file is read fully into memory before the check. The API schema caps at 200 000 chars, so nothing unbounded reaches the server (P-16 satisfied server-side); Low F7.

**Q7 Slots.** `ContextSnapshotAction` (`:16-32`): 404 → `useMeetingContext` returns `null` → renders nothing; also hides when the context is empty and has no project. Non-frozen draft shows «Черновик» text. `ProjectDetailPage.tsx:208-210` renders `<SlotOutlet name="project.tabs" projectId={projectId} />` — WEB-MEMORY-01's host is present. Import cycle: real — `lib/features.ts:81` eager-globs `features/*/index.{ts,tsx}`; `ProjectDetailPage` imports `components/layout/slot.tsx`, which imports `featureRegistry` from `lib/features.ts` and evaluates it at module top level (`createContext(featureRegistry)`, `slot.tsx:9-10`) → TDZ error if imported eagerly from a feature index. `lazy` route objects (`projects/index.ts:10-18`) are the correct fix; `context/index.ts` only imports `SlotContext` as a type, so no cycle there. React Router 7 data routers resolve `lazy` before rendering (no Suspense needed); `projects.test.tsx:62-67` and the registry test pass.

**Q8 Native `<select>`.** `NATIVE_SELECT_CLASS` (`ContextForm.tsx:29-30`, `forms.tsx:23-24`) uses `border-[var(--color-input)]`, `bg-card`, `focus-visible:ring-[var(--color-ring)]` — all defined in `web/src/styles/globals.css` at base (`--color-input`, `--color-ring`, `--color-card`). Raw colour: `text-red-600` for error text (`ContextForm.tsx:77,349,409`; `ProjectsListPage.tsx:57,74`; `ProjectDetailPage.tsx:44`) while a `--color-destructive` token exists (`globals.css:31`); the base upload page already used `text-red-600` (`upload/index.tsx:311` at base), so this is consistent-with-base rather than new — Low F8. Acceptable under D-5 in my judgement; the jsdom rationale is valid.

**Q9 Existing test changes.** 18 `it()` at base, 18 at head; no test removed. Changes: `FAKE_COMPLETE_RESPONSE.status` → `AWAITING_START`; a shared `contextApiResponse` fallback for `/api/projects?` and `/start`; `clickStart()` inserted in the four success-path tests; the navigation test renamed to «after upload and Start recognition»; RQ-008 test gets a 30 s timeout. The file is in their paths. Note: the other reviewer's clone at `966f21b6e9` (not this PR) hit exactly that RQ-008 timeout at 5 s on this loaded host, which corroborates the stated reason.

**Q10 i18n.** Programmatic parity (plural suffixes normalised): context 48/48 keys, projects 35/35, zero diff either way; ru has `meetingCount_{one,few,many,other}`, en `_{one,other}` — correct per language. Every `t()`/`tp()`/`tc()` key used in code exists. Hard-coded strings: only glyphs `✕`, `←` and `%`. 50-term hint present in both languages (`limitHint`). Note outside their paths: there is no `catalog.status.AWAITING_START` label in `web/src/i18n/*.json`, so the catalog badge will show the raw enum for such meetings (`StatusBadge.tsx:26` falls back to the status) — Info F9 for the orchestrator.

**Q11 CI.** Run 37696013859 for `d2d18ffef1…`: `Lint + Typecheck + Test` **pass** (2m1s) — `gh pr checks 19` at the end of my review.

## 4. Findings

**Medium — F1. Meeting stranded in `AWAITING_START` with no UI exit.** `routes/upload/index.tsx:67-68,225-226`. Scenario: upload completes (`defer_start`), the user reloads, clicks a nav link, or picks a new file (`handleFileChange` resets to `idle` at `:70`, `meetingId` kept but `canStart` false) before pressing Start → meeting exists in `AWAITING_START`; neither the meeting card nor the catalog offers a Start; the context draft is also lost. Require (follow-up acceptable): either a "Start recognition" action in the `meeting.actions` slot for `AWAITING_START` meetings (their path `features/context/`), or persist `{meetingId, draft}` in `localStorage` keyed by meeting id and resume on `/upload`. Not a regression against base (base had no such state), but it is a state that cannot be left.

**Medium — F2. `UploadFinalizeResponse.status` ignored.** `index.tsx:216-226`. Scenario: server answers `status:"TRANSCRIBING"` (current prod backend; or a future server that ignores `defer_start`) → UI shows "waiting to start", Start → POST /start → 404/409, no navigation. Require: `if (result.status === "TRANSCRIBING") { navigate(...); return; }` before entering `"uploaded"`, plus a test with a `TRANSCRIBING` mock. Cheap and makes the merge-order dependency fail-soft.

**High at rebase only — F3. Workspace id pinned to LEGACY / wrong storage key.** `features/projects/workspace.ts:10`, `projects/api.ts:25,75`, `upload/index.tsx:107,165,220`. Scenario after FRONTEND-02: user selects shared workspace W → projects listed/created in LEGACY; uploads carry explicit `workspace_id: LEGACY` which `withWorkspace()` does not override → meeting created in the wrong workspace. Require at rebase: items (1)–(4) in Q4. Not a defect against today's `main`.

**Low — F4. Enter in a context input submits the upload form.** `ContextForm` sits inside the upload `<form>` (`index.tsx:356-360`); `Input` fields have no key handling. Scenario: file selected, user presses Enter in «Цель» → upload starts. Suggest `onKeyDown` guard or move the fieldset out of the form.

**Low — F5. 409 on `/start` leaves the user on the upload page.** `index.tsx:251-254`. Suggest: on `ApiError.status === 409` navigate to the meeting.

**Low — F6. Silent downgrade of previous protocol source.** `draft.ts:76-86` with `index.tsx:245` — unresolved/errored last-protocol query → `{source:"none"}` instead of letting the server resolve `{source:"project", meeting_id:null}`.

**Low — F7. Pasted previous protocol not length-checked client-side; file read fully before the check.** `ContextForm.tsx:110-112,393-399`. Server cap holds; UX only.

**Low — F8. `text-red-600` instead of `--color-destructive`.** Lines in Q8. Consistent with base.

**Info — F9.** No `catalog.status.AWAITING_START` label in `web/src/i18n` (outside this package's paths).

**Info — F10.** `useUpdateParticipant`/`useUpdateGlossaryTerm`/`useUpdateProject` partially unused (no inline edit for participants/terms). Package wording satisfied.

## 5. Deviations (PR body)

- E2E/screenshots deferred — accepted (orchestrator's call; AC3 deferred).
- `/nacl-tl-sync` not run, contract verified through Zod — accepted; I confirmed the mocks are parsed by the shared schemas and the bodies conform (Q1).
- `orch.py instructions check` exit 1 / D-17 — not verifiable by me; CLAUDE.md/AGENTS.md untouched in the diff (21 files, all in allowed paths).
- `LEGACY_WORKSPACE_ID` + `workspace_id` localStorage key — accepted against today's `main`, **conditioned** on the rebase changes in Q4/F3.
- Native `<select>` — accepted (tokens used; Q8).
- RQ-008 timeout 30 s — accepted; file is in their paths, assertion unchanged, and the 5 s timeout is reproducible on this host.
- Lazy project pages — accepted; the cycle is real (Q7).
- `defer_start` always on, "uploaded, waiting" state, no auto-navigation — accepted as D-9; but see F2 (status not inspected) and F1.

## 6. CI, size, tests, mutations

- CI: run 37696013859 on `d2d18ffef1` — pass (Lint, Typecheck, Test).
- Diff: 21 files, +2392/−14, all under `web/src/routes/upload/**` and `web/src/features/{projects,context}/**`; single commit `d2d18ff`.
- Clone `/tmp/orch-review.HIdiM8/repo` at `d2d18ffef1db3ea83d8dd126faddfd655354110a`; setup `pnpm install --frozen-lockfile`, `db:generate`, `shared build` → exit 0; `pnpm -r typecheck` → exit 0. Web tests re-run with `vitest run --pool=forks --maxWorkers=2 --testTimeout=60000` → **13 files passed, 179 passed (179)**, exit 0 (the script's own first run was clobbered in the shared log by a concurrent reviewer's clone `f7sx4x` at `966f21b6e9`, whose RQ-008 timeout failure is not this PR's).
- Mutations (each on `src/routes/upload/context.test.tsx`, reverted after): M1 auto-POST additions → 2 failed/8 passed (`additions do not touch the project…`, `«Add to project» posts…`); M2 `defer_start:false` → 1 failed (`completes the upload with defer_start…`); M3 start before PUT → 1 failed (`…PUT context … before /start`); M4 always PUT → 1 failed (`skipping the context…`); M5 start never disabled → 1 failed (`start is disabled until the file is uploaded…`). All five caught.

## 7. Cleanup

`review_clone.sh --cleanup /tmp/orch-review.HIdiM8` → `removed /tmp/orch-review.HIdiM8`, exit 0; tree was clean (`git status --short` empty) before removal. `/tmp/orch-review.f7sx4x` belongs to another reviewer and was left untouched. Nothing was pushed, merged, approved or commented.

