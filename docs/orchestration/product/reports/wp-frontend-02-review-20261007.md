# Сверка — WP-FRONTEND-02 (PR https://github.com/ITSalt/transcriber/pull/13, `feb98efd46` -> `main @ 2570d0a669`) — 2026-10-07

Раунд 1. Дифф: 25 files changed, 1197 insertions(+), 266 deletions(-) (файлов: 25).

**Решение: `ACCEPTED WP-FRONTEND-02`** — весь объём реализован, оба режима D-20 и текст блокировки D-8 проверены тестами, автоподключение D-15 цело (проверено временной фичей), 8 из 9 мутаций ловятся, CI зелёный; остальное low/info — в backlog. Условие доставки: merge строго после WP-BACKEND-01 (без него `/me` → 404 и приложение показывает экран ошибки сессии) — уже в слоте слияния пакета.

## Пункты REVISE

нет

### Не требуется

—

## Вопросы владельцу

нет

## Принято как есть / backlog

- Отклонения PR 1–8 приняты (E2E после BACKEND-01 — при доставке; пространство в localStorage; подстановка `workspace_id` в `lib/api.ts` вместо правки `routes/upload` — с backlog: владелец `routes/upload` (web-projects) передаёт `useWorkspaceId()` явно и подстановка убирается; охрана в AppShell; протокол 404 без изменений; колонки каталога по пакету; `tokens.test.ts`; D-17). Необъявленные: новые файлы `lib/session.tsx`, `lib/test-utils.tsx`, `components/NotFound.tsx` (внутри путей потока), изменение retry в `queryClient.ts`, правки `routes/meeting|transcript` (нужны по п. 6) — приняты.
- Автоматические находки review-start: файлы вне объявленных путей пакета — все внутри путей потока frontend, конфликтов нет; `web/src/i18n/{en,ru}.json` — замок выдан ретроактивно, правки аддитивные/переименования, чужие страницы ключей не теряют (проверено ревьюером).
- Backlog (low): L1 тест 423 слеп к захардкоженному тексту (мок использует ту же строку D-8); L2 флаки теста «после Выйти снова legacy» под нагрузкой; L3 `logout` не чистит `transcrib.workspace` в localStorage (фолбэк по членству безопасен); L5 подстановка `workspace_id` — убрать после явной передачи в `routes/upload`. Info: retry-предикат без теста; PIN остаётся в `variables` мутации до GC; `/login/` с хвостовым слэшем — лишний редирект.
- Скриншоты AC-3 (artifact, 10 PNG извлечены оркестратором): вход, неверный PIN, 423 с точным текстом D-8 и отключёнными полями, «Задачи» с переключателем, 1440/390 — в порядке. E2E «два пользователя, разные пространства» — при доставке (после BACKEND-01) оркестратор проверяет вживую; если потребуются коммиты — новый раунд.
- graph: не требуется (пакет без спецификации).

## Автоматические находки

- **пути и замки**: WP-FRONTEND-02: web/src/components/NotFound.tsx is outside the allowed paths
- **пути и замки**: WP-FRONTEND-02: web/src/components/layout/app-shell.tsx is outside the allowed paths
- **пути и замки**: WP-FRONTEND-02: shared path web/src/i18n/en.json changed but not declared
- **пути и замки**: WP-FRONTEND-02: shared path web/src/i18n/ru.json changed but not declared
- **пути и замки**: WP-FRONTEND-02: web/src/lib/api.ts is outside the allowed paths
- **пути и замки**: WP-FRONTEND-02: web/src/lib/features.test.tsx is outside the allowed paths
- **пути и замки**: WP-FRONTEND-02: web/src/lib/queryClient.ts is outside the allowed paths
- **пути и замки**: WP-FRONTEND-02: web/src/lib/session.tsx is outside the allowed paths
- **пути и замки**: WP-FRONTEND-02: web/src/lib/test-utils.tsx is outside the allowed paths
- **пути и замки**: WP-FRONTEND-02: web/src/routes/catalog/components/MeetingRow.tsx is outside the allowed paths
- **пути и замки**: WP-FRONTEND-02: web/src/routes/catalog/index.test.tsx is outside the allowed paths
- **пути и замки**: WP-FRONTEND-02: web/src/routes/catalog/index.tsx is outside the allowed paths
- **пути и замки**: WP-FRONTEND-02: web/src/routes/meeting/index.test.tsx is outside the allowed paths
- **пути и замки**: WP-FRONTEND-02: web/src/routes/meeting/index.tsx is outside the allowed paths
- **пути и замки**: WP-FRONTEND-02: web/src/routes/transcript/index.test.tsx is outside the allowed paths
- **пути и замки**: WP-FRONTEND-02: web/src/routes/transcript/index.tsx is outside the allowed paths
- **пути и замки**: WP-FRONTEND-02: web/src/styles/tokens.test.ts is outside the allowed paths

Дифф ревизии (пересдачи): —

---

## Отчёт рецензента (дословно)

# Review — WP-FRONTEND-02, PR https://github.com/ITSalt/transcriber/pull/13, head `feb98efd465f032e13871caae1b9dbaf393a0725` vs. merge-base `2570d0a66924` (main)

## 1. Verdict: ACCEPT with condition

Every section-2 item is implemented and every acceptance-criterion test exists and is mutation-sensitive (8 of 9 mutations caught). The D-15 auto-wiring contract is intact (verified with a throwaway feature in the clone), the catch-all `*` cannot shadow later feature routes, the PIN input submits exactly once on paste and on over-typing, and both D-20 modes are tested. The condition is a merge-order one, not a code defect: the shell now blocks every page behind `GET /api/auth/me`, and on a backend without WP-BACKEND-01 (`/me` → 404, `/api/meetings` items without `workspace_id`) the whole app shows the session error screen — my throwaway test `/me 404 → error screen, not the app` proves it. The package already says "deliver in one window right after WP-BACKEND-01"; that must hold strictly. Remaining findings are Low/Info (a test blind to hard-coded 423 text, a load-flaky logout test, localStorage workspace not cleared on logout, undeclared new files under `lib/` and `components/`).

## 2. Scope -> code -> status (head `feb98efd`)

| Section 2 item | Where | Status |
|---|---|---|
| 1. PIN login: 6 cells, `inputmode=numeric`, auto-submit on 6th, «Неверный PIN» on 401, 423 → response text, field disabled | `web/src/features/auth/components/PinInput.tsx:33-47,62-66,76-79`; `web/src/features/auth/LoginPage.tsx:29-51,63-73` | Done; tests `auth.test.tsx:111-168,170-190` |
| 2. Route guard + global 401 in `lib/api.ts` | `web/src/components/layout/app-shell.tsx:81-128` (`SessionGate`, `Navigate to=/login?next=`); `web/src/lib/api.ts:25-47,92,144,164`, `web/src/lib/session.tsx:100-103` | Done; tests `auth.test.tsx:77-101`; mutations b, h caught |
| 3. Workspace switcher from `/me`, localStorage with fallback to first, switch drops TanStack cache | `AuthHeader.tsx:19-37`; `session.tsx:84-88`, `:105-116`; `routes/catalog/index.tsx:24-29` | Done (localStorage variant, declared dev. 2); tests `auth.test.tsx:266-304`; mutations d2, i caught |
| 4. Catalog → «Задачи»: file, date, status, protocol link; only current workspace; upload into current workspace | `web/src/i18n/{ru,en}.json`; `routes/catalog/index.tsx:24-31,78-81`; `MeetingRow.tsx:16-37`; `lib/api.ts:53-65,75` (`withWorkspace`) | Done; tests `catalog/index.test.tsx` (14), `auth.test.tsx:331-347`; mutations e, f caught |
| 5. User menu: name, «Выйти» | `AuthHeader.tsx:39-56`; `session.tsx:118-126` | Done; tests `auth.test.tsx:217-231,306-329` |
| 6. Foreign/nonexistent meeting → «Не найдено» without distinction | `components/NotFound.tsx`; `lib/api.ts:19-21`; `routes/meeting/index.tsx:55`; `routes/transcript/index.tsx:48`; catch-all `features/shell/index.ts:8-10` | Done for meeting/transcript/unknown URL; protocol page unchanged (declared dev. 5); mutation g caught |
| 7. No projects/context | — | Nothing of FRONTEND-03 present |

| Acceptance criterion | Evidence | Status |
|---|---|---|
| 1. Web tests: redirect without session, login, PIN error, 423 exact text + disabled, workspace switch refreshes list, 404 page | `auth.test.tsx:77-85, 111-137, 139-152, 154-168, 278-290, 103-107` | Met |
| 2. `pnpm -r typecheck`, `pnpm test` green; sync with contract | typecheck green (4/4); web 167/169 in full run (RQ-008 pre-existing; auth logout test flaky under load, 3/3 alone); contract parsed with `@transcrib/shared` schemas | Met |
| 3. Local E2E two users / screenshots | Deferred to delivery (declared dev. 1); screenshots viewed by the orchestrator | Deferred, accepted by package text |

## 3. Answers to the risk questions

**Q1 — Removed catalog behaviour.** Base showed title with filename fallback, status badge, language, uploaded date, duration, Open button; header upload button; polling of transient statuses. Head shows filename, date, status, protocol link (`PROTOCOL_READY`/`EDITED` only), Open button; upload button and polling retained. Removed: title display, language, duration — exactly what package 2.4 lists, declared as deviation 6. Base had 20 tests, head 14. Deleted outright (feature removed): column headers CT01/03/04/05, filename fallback, title, duration, em-dash. Rewritten with equivalent assertion: container, loading, empty, error, rows, status badges, a11y table name, aria-live, Open navigates, both upload-button tests. New: "requests only the current workspace", column set, "links to the protocol only when it exists". Every surviving base behaviour is still covered.

**Q2 — Guard with AUTH_REQUIRED=false; loading; network error; SSE/health.** `auth.test.tsx:202-215` renders `/catalog` with `/me` → 200 (synthetic «Роман») — same as before for an anonymous user, plus the new header. While `/me` loads the frame renders brand + «Загрузка…» (no login flash). On a non-401 failure `session-error` with retry (throwaway test: TypeError then retry → recovers). SSE uses `new EventSource` (not wrapped); `/api/health` not called by the web app. **Delivery-order caveat:** against a backend without BACKEND-01, `/me` → 404 → error screen on every page; `/api/meetings` items lack `workspace_id` → Zod parse error. Merge strictly after BACKEND-01.

**Q3 — `lib/api.ts` injection.** `withWorkspace` (`api.ts:53-65`): only for string bodies on `/api/uploads/*`, only when a workspace id exists and `parsed.workspace_id === undefined`; parse failure → unchanged. FormData/Blob skipped; S3 part PUTs use raw fetch; explicit `workspace_id` never overwritten (throwaway test). No workspace selected → body sent as before (throwaway test; `routes/upload/index.test.tsx` 18 green). No PR test for the non-injecting path (L5).

**Q4 — `app-shell.tsx` and D-15.** Shell split into `Brand`, `Frame`, `SignedInShell` gated by `SessionGate`; nav still from `FeatureRegistryContext.navItems`, `header.right` outlet kept; `App.tsx`, `lib/features.ts`, `slot.tsx`, `i18n/config.ts` unchanged. Throwaway feature `features/zzz-tmp` (routes `/projects`, `/projects/:id`) picked up without edits. Mutation a → `features.test.tsx` fails. The +9/−6 in `features.test.tsx` are consequences only (`/me` mock, «Встречи» → «Задачи»).

**Q5 — PIN input.** `commit()` calls `onComplete` only at 6 digits; paste prevents default. Throwaway tests: paste → 1 login call; over-typing with pending login → 1 call. PIN never logged, never in URL, cleared on error; unmounts on success. 423 text: `setError(e.message)` from the response body — verbatim. Mutation c (hard-coding the D-8 string) leaves tests green because the mock uses the same string (L1).

**Q6 — Session/workspace state.** Logout clears the query cache but not `transcrib.workspace` in localStorage (throwaway test) — safe via membership fallback (`session.tsx:84-88`, test `:299-304`, mutation i caught). Switching removes every non-`auth` query and the list key includes the workspace id.

**Q7 — i18n.** Root files: renamed values `nav.catalog`, `catalog.title`, `catalog.tableLabel`, `catalog.empty`; removed `catalog.columns.{title,language,uploaded_at,duration}`; added `catalog.columns.{file,date,protocol}`, `catalog.openProtocol`, `notFound.{title,back}`. No use of removed keys outside `routes/catalog`. Feature namespace `auth` via the FRONTEND-01 glob.

**Q8 — Catch-all priority.** `features/shell/index.ts:8-10` registers `*`; React Router ranks splats lowest regardless of order: `/projects`, `/projects/:id` from a throwaway feature render, `/projects/abc/zzz` → NotFound. No shadowing.

**Q9 — Files outside declared paths.** `lib/api.ts` named in item 2; `app-shell.tsx` needed for the guard (dev. 4); `features.test.tsx` consequential; `lib/queryClient.ts` 4xx no longer retried (untested, I1); `lib/session.tsx`, `lib/test-utils.tsx`, `components/NotFound.tsx` new, not declared (L4); `routes/catalog|meeting|transcript` required by items 4 and 6; `tokens.test.ts` declared dev. 7; `i18n/*.json` additive/renames.

**Q10 — CI.** Run 37687669036 pass (1m58s); `pnpm -r run test`; web 10/10 files; no `.skip/.todo/.only` in `web/src`.

## 4. Findings (no High or Medium)

- **L1** `auth.test.tsx:18,154-168` — 423 mock uses the D-8 string, so a hard-coded message passes (mutation c green). Require (backlog): mock a non-canonical 423 message.
- **L2** `auth.test.tsx:217-231` — logout-legacy test flaky under load; passes alone and in CI. Backlog: `findByText` timeout / `waitFor`.
- **L3** `lib/session.tsx:118-126` — logout does not clear `transcrib.workspace`. Safe fallback; backlog: `localStorage.removeItem`.
- **L4** New files `lib/session.tsx`, `lib/test-utils.tsx`, `components/NotFound.tsx` undeclared. Accept; record.
- **L5** `lib/api.ts:34-65` — workspace injection via module-level provider (declared dev. 3); backlog: `routes/upload` owner passes `useWorkspaceId()` and injection is removed.
- **Info** I1 retry predicate untested; I2 PIN in mutation `variables` until GC; I3 delivery order (merge after BACKEND-01); I4 protocol page 404 generic (dev. 5); I5 `/login/` trailing slash extra redirect.

## 5. Deviations (PR body)

1–8 accepted (E2E deferred; localStorage; injection with backlog L5; guard in AppShell; protocol 404; columns; tokens.test.ts; D-17). Undeclared: new files in `lib/` and `components/` (L4); `queryClient.ts` retry change (I1); `routes/meeting|transcript` edits (required by item 6). All acceptable.

## 6. CI, size, tests, mutations

- CI: run 37687669036 pass; PR MERGEABLE. Size: 25 files, +1197/−266; single commit.
- Clone: install, db:generate, shared build — exit 0. `pnpm --filter @transcrib/web test`: 167/169 (RQ-008 pre-existing; logout-legacy flaky, 17/17 on three reruns). `pnpm -r typecheck` done.
- Throwaway tests (13, all passed; removed with the clone). Mutations: a caught; b caught; c **not caught (L1)**; d1 passes (covered by removeQueries); d2 caught; e, f, g, h, i caught. All restored.

## 7. Cleanup

`review_clone.sh --cleanup /tmp/orch-review.M5wpqq` → removed. Main checkout used read-only; nothing pushed, commented, approved or merged.

