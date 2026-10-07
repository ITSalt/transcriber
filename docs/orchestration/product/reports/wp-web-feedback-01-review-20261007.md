# Сверка — WP-WEB-FEEDBACK-01 (PR https://github.com/ITSalt/transcriber/pull/18, `966f21b6e9` -> `main @ 2570d0a669`) — 2026-10-07

Раунд 1. Дифф: 11 files changed, 1523 insertions(+) (файлов: 11).

**Решение: `REVISE WP-WEB-FEEDBACK-01`** — контракт (multipart-поля, схемы, скачивание) и аутлет `protocol.toolbar` верны (аутлет рендерит все зарегистрированные фичи — проверено временной второй фичей), 25 тестов на реальных компонентах; но два теста, которые требует пакет (аутлет на странице протокола; «каждое сохранение видно в истории»), отсутствуют — мутации проходят зелёными, и два пользовательских дефекта: текст с вкладки «Замечания» отправляется вместе с Word-файлом; `.md`/`.txt` с пустым MIME браузера отвергается. Четыре мелких пункта.

## Пункты REVISE

1. `web/src/routes/protocol/index.tsx:305-306` -> пакет п. 8 требует тест «временная фича со слотом protocol.toolbar отображается на странице протокола»; теста нет — удаление аутлета оставляет 56/56 зелёными (мутация f) -> требование: тест, рендерящий `ProtocolPage` с реестром, содержащим временный компонент слота, и проверяющий его в панели действий (шаблон — throwaway-тест ревьюера, Q2); medium.
2. `web/src/routes/protocol/index.tsx:99-102` -> п. 4 «каждое сохранение видно в истории» без теста — удаление инвалидации оставляет 56/56 зелёными (мутация b) -> требование: в `routes/protocol/index.test.tsx` после Save проверить инвалидацию `["protocol-versions", id]` (spy на `invalidateQueries` или перезапрос засеянного запроса); medium.
3. `web/src/features/feedback/components/FeedbackDialog.tsx:64-70,79-86` -> состояние `text` общее для вкладок и не сбрасывается при переключении, а `fields.text` отправляется всегда: набрал замечание → переключился на «Word с комментариями» → загрузил .docx → отправил: POST несёт `kind=DOCX_REVIEW` и скрытый `text` (воспроизведено) -> требование: `text` только для COMMENT/CORRECTED_PROTOCOL (как уже сделано с `category`) или сброс `text`/`category` в `selectTab`; тест; medium.
4. `FeedbackDialog.tsx:90` -> `mime: file.type` без фолбэка: `.md` с пустым MIME браузера (частый случай) → `checkFeedbackSubmission` даёт FEEDBACK_FILE_TYPE, хотя контракт принимает `application/octet-stream` для всех расширений и браузер именно его и пошлёт -> требование: `mime: file.type || "application/octet-stream"` + тест с пустым `type`; medium.
5. (по желанию, в том же раунде) `VersionHistoryDialog.tsx:57-63` без `DialogDescription` (предупреждение Radix, нет описания для скринридера); `FeedbackDialog.tsx:46-55` и `VersionHistoryDialog.tsx:29-30` — состояние не сбрасывается при закрытии (после отправки повторное открытие показывает «Отзыв отправлен» над пустой формой) -> сброс в `onOpenChange(false)`; low.

### Не требуется

- Не менять api.ts (multipart через raw fetch без Content-Type — верно), diff.ts (LCS корректен на вставке/удалении/перемещении), выбор «исходной» версии (A-7: сейчас первая GENERATED; при появлении регенерации — последняя GENERATED перед выбранной).
- Сырые цвета палитры и нативный `<select>` — как в базе, backlog; `/nacl-tl-sync` — принят через Zod-моки.
- E2E/скриншоты — после merge WP-API-FEEDBACK-01.

## Вопросы владельцу

нет (вопрос ревьюера о базе сравнения при регенерации закрыт допущением A-7: регенерации пока нет)

## Принято как есть / backlog

- Отклонения PR приняты (E2E отложен; `/nacl-tl-sync` — через Zod; D-17; RQ-008 вне путей).
- Аутлет `protocol.toolbar`: внутри `data &&`, после Export PDF, рендерит все зарегистрированные компоненты (feedback → memory) — требование WEB-MEMORY-01 M-1 закрыто.
- Low 8 (палитра/select), Info 9–12 (дублирование констант, косметика diff, плюрал en, raw fetch вне `request`) — backlog.
- Слот слияния: после WP-API-FEEDBACK-01.
- graph: не требуется.

## Автоматические находки

- не найдено

Дифф ревизии (пересдачи): —

---

## Отчёт рецензента (дословно)

## Review report — PR #18, WP-WEB-FEEDBACK-01 (head `966f21b6e917fc0d976a706c5d2802e3968fc91f` vs `main @ 2570d0a669`)

### 1. Verdict: **REVISE** (round 1, four small items)

The feature is implemented against the shared contract correctly (field names, schemas, no JSON content-type on the multipart path), the `protocol.toolbar` outlet is in the right place and renders every registered feature (verified with a throwaway second feature), and the 25 new tests exercise real components with Zod-validated mocks; 4 of 7 mutations were caught. What blocks acceptance: the test the package explicitly requires for item 8 (temporary feature visible on the protocol page) is absent — removing the outlet leaves all tests green; item 4 (every save visible in history) is likewise untested — removing the invalidation leaves all tests green; and two user-facing defects that the deferred E2E would hit: text typed on the "Замечания" tab is silently sent with a "Word с комментариями" submission, and a `.md`/`.txt` file whose browser MIME is empty is rejected client-side although the contract accepts it. All four are small, one-round fixes.

### 2. Scope → code → status

| Item | Where (head `966f21b`) | Status |
|---|---|---|
| 2.1 Button «Обратная связь» → panel, 3 tabs; D-12 counts after upload | `web/src/features/feedback/components/FeedbackToolbar.tsx:19-26`; `FeedbackDialog.tsx:131-156` (tabs), `:166-241` (forms), `:260-268` (comments/revisions counts from server `extracted`) | Done; tests `feedback.test.tsx:137-273` |
| 2.2 List of sent feedback (who, when, kind, file) | `FeedbackList.tsx:48` (kind), `:53` (author, time, version), `:68-77` (download link = `file.download_path`) | Done; tests `:379-412` |
| 2.3 Version history: list, view, line diff vs original | `VersionHistoryDialog.tsx:82-125` (list: kind/author/time/current), `:148-155` (view), `:42-48,171-190` (diff), `:157-159` (LEGACY → no original); `diff.ts:8-40` (LCS) | Done; tests `:475-560`. "Original" = first GENERATED (`:23-25`) — see P-1 |
| 2.4 Editor unchanged; every save visible in history | `web/src/routes/protocol/index.tsx:99-102` invalidates `["protocol-versions", meetingId]` in `saveMutation.onSuccess`; editor/save flow otherwise untouched | Implemented, **untested** (mutation b) |
| 2.5 No feedback analytics | nothing in diff | OK |
| 2.8 `protocol.toolbar` outlet | `routes/protocol/index.tsx:24` (import), `:305-306` `<SlotOutlet name="protocol.toolbar" meetingId={meetingId} />` inside the action bar `div` (`:267`), inside `data &&` (`:204`) | Implemented; **required test missing** (mutation f) |
| AC1 web tests: 3 kinds, size/type errors, history & diff | `feedback.test.tsx:137-248` (COMMENT/CORRECTED text/CORRECTED .md/DOCX), `:275-308` (client size/type), `:322-357` (413/415), `:475-560` (history, diff, LEGACY) | Met |
| AC2 `/nacl-tl-sync`, typecheck, tests green | typecheck exit 0; web 180/181 (RQ-008 upload timeout, file not in diff, CI green); `/nacl-tl-sync` **not run** (declared) | Partially — sync deviation for the orchestrator |
| AC3 local E2E + screenshots | deferred by orchestrator | — |
| AC4 mocks per Zod schemas; "E2E after merge API" mark | `feedback.test.tsx:69,79,87,101` parse every mock body with the shared schemas; PR body carries the mark | Met |

### 3. Answers to the risk questions

**Q1 Contract conformance.** `api.ts:65-69` appends exactly `kind`, `category` (only when set), `text` (only when set), and part `file` with the file name — matches `shared/src/api/feedback.ts:85-89` and the `file` part at `:12`. The POST uses raw `fetch` with `body: form` and **no headers** (`api.ts:71-74`), so the browser sets `multipart/form-data; boundary=…`; it does not go through `lib/api.ts` at all, so the "Content-Type for string bodies" logic (`lib/api.ts:21-25`) is not involved. Response parsed with `FeedbackCreateResponse.parse` (`:87`); the list/versions/version GETs use `apiGet` with `FeedbackListResponse`, `ProtocolVersionListResponse`, `ProtocolVersionResponse` (`:19,28-31,40-43`); download URL is the server's `file.download_path` (`FeedbackList.tsx:70`), as the contract prescribes (`feedback.ts:172-173`). Error body `{code, message}` is read (`api.ts:79-81`) matching `errors.ts:9-13`. Dependence on `lib/api.ts`: only the public `ApiError` class and `apiGet` — no reliance on `request` internals; FRONTEND-02's `/api/uploads/*` injection cannot conflict. Caveat (Info): because the POST bypasses `request`, any cross-cutting header/credential FRONTEND-02 might later add to `request` would not reach this POST; today `request` adds nothing but Content-Type. Verified by tests asserting `posts[0].get("kind"|"category"|"text"|"file")` and by mutation (a).

**Q2 Outlet.** Placed at `routes/protocol/index.tsx:305-306`, last child of the action-bar `div.flex.gap-2` (`:267`) after Export PDF, with props `meetingId={meetingId}`; it sits inside `{data && (…)}` (`:204`), so nothing renders while loading/error. `SlotOutlet` (`components/layout/slot.tsx:20-22`) maps over `registry.slots[name]` and renders **every** component; `collectFeatures` (`lib/features.ts:70-73`) pushes each feature's component in path order, so with PR #14 (`features/memory/index.ts` registers `MeetingMemoryRefs` on `protocol.toolbar`) both will render — feedback first, memory second. Throwaway check in the clone: added `features/zz-throwaway/index.ts` with a `protocol.toolbar` component and rendered `ProtocolPage` via memory router with mocked fetch — `featureRegistry.slots["protocol.toolbar"].length >= 2` passed, both `tmp-toolbar-slot` (with `tmp:<meetingId>`) and `btn-feedback` found inside the same parent as `btn-export-pdf`, and neither rendered while fetch is pending (3/3 passed).

**Q3 Other changes in the +8.** Three additions only: the import (`:24`), the invalidation (`:99-102`, key `["protocol-versions", meetingId]`, a string literal duplicating `versionsKey` in `features/feedback/api.ts:12-13`; the prefix also invalidates the `[…, n]` detail queries, which is desirable), and the outlet. The `onSuccess` still patches `["protocol", meetingId]`, resets editing/dirty, sets success (`:87-105`); `handleSave`, blocker, PDF link unchanged; no removals (diff is +8/−0). Base protocol tests: 31 in `routes/protocol/index.test.tsx` green in the clone (56/56 with the feedback file) and in CI. The invalidation is not asserted anywhere — mutation (b).

**Q4 File handling.** `checkFeedbackSubmission` from shared is called with `{fileName, mime: file.type, sizeBytes}` (`FeedbackDialog.tsx:87-92`); the size in the message comes from `FEEDBACK_FILE_MAX_BYTES` (`:38`), `accept` attributes mirror `FEEDBACK_FILE_TYPES` (`:220` `.md,.txt,.docx`; `:236` `.docx`). The browser never reads `.docx`: the `File` is only appended to `FormData` (`api.ts:69`); counts come from the server's `extracted` (`:260-268`), per D-12. 413/415/400 codes are mapped to i18n texts (`:31-36`, `:106-113`), any other failure → `errors.generic` (test `:359-369`). A failed upload keeps text and file: `resetForm()` runs only in `onSuccess` (`:102-105`). Two defects: (i) `file.type` is passed through unchanged — an empty browser MIME is rejected by the shared check although the contract lists `application/octet-stream` for every extension (Finding 4, evidence below); (ii) `fields.text` is built from the shared `text` state regardless of tab (`:79-86`), and `selectTab` (`:64-70`) does not clear it (Finding 3).

**Q5 Diff and original.** `diff.ts` is a standard O(n·m) LCS with `del`-before-`add` tie-break. Extra cases run in the clone: insertion `a,b,c → a,b,X,c` = same,same,add X,same; deletion `a,b,c,d → a,d` = same,del b,del c,same; moved block `a,b,c,d → c,d,a,b` = del a,del b,same c,same d,add a,add b (no move detection — correct for a line diff; both sides reconstruct from the ops). Edge: empty original → `- ` (an empty "deleted" line) and trailing newline differences → an empty del/add line (cosmetic). 4000×4000 lines: 438 ms, 44 MB heap — fine for protocols. LEGACY: `findOriginal` returns null → `history.noOriginal` (`VersionHistoryDialog.tsx:23-25,157-159`, test `:527-548`). Which version is the original: the **first GENERATED in the ascending list** — neither "n=1" nor "latest GENERATED". There is no regeneration on main (`git grep -i regenerat` in `api/src`, `shared/src`, `web/src` at `2570d0a669` returns nothing), so today it is unambiguous; after a future regeneration a USER_EDIT would be compared with the pre-regeneration text. Mutation (g) (latest GENERATED instead) stays green — the choice is untested. → P-1.

**Q6 Mutations** (clone `/tmp/orch-review.f7sx4x`, `npx vitest run --pool=forks --maxWorkers=2 --testTimeout=60000`, baseline 56/56 over `feedback.test.tsx` + `routes/protocol/index.test.tsx`):
- (a) `form.append("kind"…)` → `"type"` (`api.ts:66`): **3 failed** (remarks with category; corrected as text; Word counts). Covered.
- (b) delete `routes/protocol/index.tsx:99-102` (history invalidation): **56 passed**. Not covered.
- (c) drop `FEEDBACK_FILE_TOO_LARGE` from `SERVER_ERRORS` (`FeedbackDialog.tsx:35`): **1 failed** ("shows the server's size error (413)"). Covered.
- (d) swap add/del in `diff.ts:32,34`: **2 failed** (compare line by line; diffLines unit). Covered.
- (e) delete list invalidation `api.ts:94-95`: **1 failed** ("refreshes the list after sending"). Covered.
- (f) delete the `<SlotOutlet …/>` line: **56 passed**. Not covered.
- (g) original = last GENERATED: **25 passed**. Not covered.

**Q7 i18n and a11y.** `ru.json`/`en.json`: 63 leaf keys each (85 lines each), key sets identical (script output: `only ru []`, `only en []`); every `t()` key used in the five source files exists in both. No hard-coded user strings besides separators (`·`, `—`). Dialogs are Radix (`role=dialog`, focus trap, Esc, close button); `FeedbackDialog` has `DialogTitle` + `DialogDescription` (`:127-128`); `VersionHistoryDialog` has a title only (`:61-63`) — no description/`aria-describedby` (Finding 6). Tabs: `role=tablist` with `aria-label`, `role=tab` with `aria-selected`/`aria-controls`, `role=tabpanel` with `aria-labelledby` (`:131-165`); no arrow-key navigation (buttons are tabbable — acceptable). Inputs labelled (wrapping `<label>`, `aria-label` on file inputs); error `role=alert` (`:244`), success `role=status` (`:254`).

**Q8 Tests.** `feedback.test.tsx` renders the real `FeedbackToolbar` → `FeedbackDialog`/`FeedbackList`/`VersionHistoryDialog` under a `QueryClientProvider`, with `fetch` spied and routed by URL; every mock body is validated with the shared Zod schema (`:69,79,87,101`); multipart bodies are captured and asserted field by field. Not covered: the outlet on the protocol page, history invalidation after save, CORRECTED_PROTOCOL with `.txt`/`.docx` file, server 400 codes (`FEEDBACK_TEXT_REQUIRED`/`FILE_REQUIRED` from the server), feedback-list error/retry, LEGACY "view", multiple GENERATED, text carried across tabs, reopen state.

**Q9 Design tokens (D-5).** Uses shadcn `Dialog`, `Button`, `Badge`, `Textarea` from main. No `Tabs` component exists on main (`components/ui/` list), so hand-rolled tabs are justified (the feature cannot add to `components/ui`). A native `<select>` is used (`FeedbackDialog.tsx:182-194`) although `components/ui/select.tsx` (Radix) exists; it is styled with tokens (`border-[var(--color-input)] bg-card`). `border-brand` resolves to `--color-brand` declared inside `@theme` (`globals.css:9,22`). Raw palette classes: `text-green-600` (`FeedbackDialog.tsx:257`), `bg-green-100 text-green-900`, `bg-red-100 text-red-900` (`VersionHistoryDialog.tsx:182-183`) — not tokens, but the base already does this (`routes/protocol/index.tsx:259` `text-green-600`, `JobErrorBanner.tsx:29` red palette).

**Q10 CI.** Run 37696012587: `headSha 966f21b6e917fc0d976a706c5d2802e3968fc91f`, workflow "CI" job "Lint + Typecheck + Test", `conclusion: success`, completed 2026-10-07T22:26:45Z (`gh run view --json`; `gh pr view --json statusCheckRollup`).

### 4. Findings

**Medium**
1. `web/src/routes/protocol/index.tsx:305-306` — package item 8 requires "Тест: временная фича со слотом protocol.toolbar отображается на странице протокола"; no such test exists (`feedback.test.tsx` renders `FeedbackToolbar` directly, `routes/protocol/index.test.tsx` unchanged). Mutation (f): outlet removed → 56/56 green. Require: a test rendering `ProtocolPage` with a registry (or `FeatureRegistryContext`) containing a temporary `protocol.toolbar` component and asserting it renders in the action bar (my throwaway test in Q2 is a template).
2. `web/src/routes/protocol/index.tsx:99-102` — item 4 ("каждое сохранение видно в истории") has no test; mutation (b) → 56/56 green. Require: in `routes/protocol/index.test.tsx` assert that after Save the `["protocol-versions", id]` query is invalidated (e.g. spy on `queryClient.invalidateQueries` or seed a versions query and assert a refetch).
3. `web/src/features/feedback/components/FeedbackDialog.tsx:64-70, 79-86` — the `text` state is shared by all tabs and not cleared on tab switch, while `fields.text` is always sent. Scenario (reproduced in the clone): type "stale remark" on «Замечания», switch to «Word с комментариями», upload `.docx`, send → the POST carries `kind=DOCX_REVIEW` **and** `text=stale remark` (hidden on that tab); the server stores it as the feedback text and the list shows it under the Word entry; switching back to «Замечания» still shows the text, inviting a duplicate send. Require: build `text` only for COMMENT/CORRECTED_PROTOCOL (and `category` only for COMMENT, as already done), or reset `text`/`category` in `selectTab`.
4. `web/src/features/feedback/components/FeedbackDialog.tsx:90` — `mime: file.type` is passed through; for a `.md`/`.txt` whose browser MIME is `""` (extension unknown to the OS MIME DB — common for `.md`), `checkFeedbackSubmission` returns `FEEDBACK_FILE_TYPE` (verified in the clone: `mime: ""` → `FEEDBACK_FILE_TYPE`; `application/octet-stream` → `null`), so the user sees «Этот тип файла не принимается» for a valid file, although the contract accepts `application/octet-stream` for every extension (`feedback.ts:73-78`) and the browser sends exactly that as the part's Content-Type when `type` is empty. Require: `mime: file.type || "application/octet-stream"`, plus a test with an empty `type`.

**Low**
5. `VersionHistoryDialog.tsx:23-25` — "original" = first GENERATED in the list; untested (mutation g) and ambiguous once regeneration exists. → P-1 for the owner; no code change required this round unless the owner decides otherwise.
6. `VersionHistoryDialog.tsx:57-63` — `DialogContent` without `DialogDescription`/`aria-describedby` (Radix logs a dev warning; screen readers get no description). Require: add a short `DialogDescription` (key exists pattern-wise) — trivial.
7. `FeedbackDialog.tsx:46-55`, `VersionHistoryDialog.tsx:29-30` — dialog state lives above `<Dialog>` and is never reset on close: send → close → reopen shows «Отзыв отправлен» over an empty form; History reopens with the previously selected version/diff panel still open. Require: reset `result`/`error` (and optionally `selected`/`compare`) in `onOpenChange(false)`.
8. `FeedbackDialog.tsx:257`, `VersionHistoryDialog.tsx:182-183` — raw palette colours instead of D-5 tokens (base precedent exists); `FeedbackDialog.tsx:182-194` native `<select>` while shadcn `Select` exists. Backlog candidate, not required.

**Info**
9. `FeedbackDialog.tsx:174,207` — `maxLength={200000}` duplicates `FEEDBACK_TEXT_MAX`; `routes/protocol/index.tsx:101` duplicates the `"protocol-versions"` key literal (the route cannot import the feature without inverting the dependency — acceptable, but a shared constant in `lib/` would be cleaner).
10. `diff.ts` — empty original renders a `- ` line; trailing-newline differences render an empty del/add line (cosmetic).
11. `en.json` `extracted` → "1 edits" (no plural forms); tabs lack arrow-key navigation.
12. `api.ts:71-74` — the multipart POST bypasses `lib/api.ts`'s `request`, so future cross-cutting headers added there would not apply to it (no gap today).

No regressions against the base: the diff is additive (+1523/−0); every base action on the protocol page (edit, save, cancel, PDF, back, unsaved-changes guard) is intact and its 31 tests pass.

### 5. Deviations from the PR body
- E2E/screenshots deferred ("E2E после merge API") — accepted (criterion 3 deferred by the orchestrator; API package not in main; mocks validated with contract schemas per criterion 4).
- `/nacl-tl-sync` not run — not accepted as satisfied: criterion 2 names it; orchestrator to decide whether the Zod-validated mocks substitute for it in this stream.
- `orch.py instructions check` exit 1 / CLAUDE.md untouched — accepted per D-17.
- RQ-008 upload test failing — accepted: `web/src/routes/upload/index.test.tsx` is not in the diff, it is a 5000 ms timeout on the loaded host, and CI (same head) is green.

### 6. CI, size, tests, mutations
- CI: run 37696012587 on head `966f21b…`, `success` (22:26:45Z).
- Size: 11 files, +1523/−0 (`git diff --stat 2570d0a669 966f21b6…`).
- Clone (`/tmp/orch-review.f7sx4x/repo`): `pnpm install --frozen-lockfile` 0; `db:generate` 0; `shared build` 0; `pnpm --filter @transcrib/web test` → **1 failed | 180 passed (181)**, failure = `UploadPage > RQ-008 … Test timed out in 5000ms` (pre-existing file, not in diff); `pnpm -r typecheck` → 0.
- Targeted baseline for mutations: 56/56 (`feedback.test.tsx` 25 + `routes/protocol/index.test.tsx` 31).
- Mutations: (a) 3 failed ✔, (b) green ✘, (c) 1 failed ✔, (d) 2 failed ✔, (e) 1 failed ✔, (f) green ✘, (g) green ✘.
- Extra runs: throwaway `protocol.toolbar` feature 3/3; diff extra cases 5/5 (outputs in Q5); evidence tests 2/2 (text carried to DOCX_REVIEW; empty-MIME `.md` rejected).

### 7. Cleanup
`review_clone.sh --cleanup /tmp/orch-review.f7sx4x` → `removed /tmp/orch-review.f7sx4x`; directory confirmed gone. A second directory `/tmp/orch-review.HIdiM8` (HEAD `d2d18ff`, another review's clone) was never touched by me and had already been removed by its owner when I checked. No files were written to the module repository or the orchestrator workspace; no PR actions taken.

**Owner question P-1:** after a future regeneration (several GENERATED versions), should "Сравнить с исходной" compare with the first GENERATED (current code), the latest GENERATED before the selected version, or let the user pick the base? Recommendation: latest GENERATED preceding the selected version (it is what the user's edits were made against); no change needed until regeneration exists.

