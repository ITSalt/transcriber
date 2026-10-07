# Сверка — WP-FRONTEND-01 (PR https://github.com/ITSalt/transcriber/pull/9, `c8de8c2e8c` -> `main @ 343f4a108a`) — 2026-10-07

Раунд 1. Дифф: 41 files changed, 601 insertions(+), 65 deletions(-) (файлов: 41).

**Решение: `REVISE WP-FRONTEND-01`** — объём выполнен, CI зелёный, мутации ловятся; два пункта: тест автоподключения утверждает глобальный реестр точно и сломается у первого параллельного потока (нарушение D-15), и скриншоты страницы встречи показывают только состояние ошибки (AC-3 для встречи не подтверждён).

## Пункты REVISE

1. `web/src/lib/features.test.tsx:51-56` и `:482-487` -> первая же фича с `navItems` или слотом `header.right` (WP-FRONTEND-02 `features/{auth,tasks}`, web-projects `features/projects`) роняет `pnpm --filter @transcrib/web test`, и чужой поток вынужден править файл вне своих путей (воспроизведено ревьюером: on-disk фича `features/zzreview` -> `expected ['/zz','/catalog','/upload'] to deeply equal ['/catalog','/upload']`) -> требование D-15 / п. 5a пакета: утверждать вклад shell через `expect.arrayContaining`/`toContain` (или строить ожидание из `collectFeatures({shell})`), а пустой `header.right` проверять на явном реестре, не на глобальном `featureRegistry`; medium.
2. Скриншоты AC-3: «Встреча после 1440» и «Встреча после 390» в artifact показывают только состояние ошибки «Что-то пошло не так / Повторить» (мок встречи не отработал) -> страница встречи в новом оформлении и слот `meeting.actions` визуально не подтверждены, а «Повторить» в состоянии ошибки выглядит как голый текст, не кнопка -> требование AC-3 пакета: приложить скриншоты страницы встречи с мок-данными (1440 и 390) и проверить, что «Повторить» отрисован кнопкой дизайн-системы (если это кнопка в коде); medium.

### Не требуется

- Не править `App.tsx`, `i18n/config.ts`, `lib/features.ts` (проводка верна, доказана мутациями M1, M2, M4).
- Не менять primary-цвет (отклонение 1 принято), не добавлять аутлеты `protocol.toolbar`/`project.tabs` (чужие пути).
- Не трогать `routes/upload` (RQ-008 — вне путей, предсуществующая медленность).
- Не создавать AGENTS.md, не трогать CLAUDE.md (D-17).

## Вопросы владельцу

нет

## Принято как есть / backlog

- Принятые отклонения PR: 1 (primary `#C84312`, брендовый `#F4510B` остаётся в ring/brand/shadow), 2 (слоты без аутлета — чужие пути), 3 (upload/protocol внутри AppShell без правок), 4 (`vite-env.d.ts`), 5 (D-17), 6 (RQ-008: 6.4 с на базе в том же клоне).
- Скриншоты AC-3 поданы как claude.ai artifact, а не изображения в PR — принято: оркестратор извлёк 16 PNG (каталог/загрузка/протокол до/после 1440 и 390 в порядке; каталог на 390 скрывает те же колонки, что и до пакета).
- L-1 `globals.css:73 body{overflow-x:hidden}`: «нет горизонтального скролла» достигается обрезкой; backlog — проверить при мобильном QA.
- I-1 дублирующиеся пути маршрутов фич разрешаются порядком без предупреждения — backlog (`console.warn` в `collectFeatures`).
- I-2 нав-ссылка «Загрузить» дублирует кнопку каталога — косметика.
- I-3 аутлет `meeting.actions` без теста в PR (покрыт M4 ревьюера) — backlog.
- graph: не требуется (пакет без спецификации).

## Автоматические находки

- не найдено

Дифф ревизии (пересдачи): —

---

## Отчёт рецензента (дословно)

# Review report — PR #9 / WP-FRONTEND-01, head `c8de8c2e8c` vs `main @ 343f4a108a`

## 1. Verdict: **ACCEPT with condition**

All seven scope items of section 2 are implemented and every acceptance criterion except the screenshot one has verifiable evidence in the diff and in the clone run; all four mutations I applied were caught by the new tests; no base route, provider, i18n key, action or text was removed. The one condition is a D-15 defect in the PR's own test file: `web/src/lib/features.test.tsx:51-56` and `:486` assert the *global* registry exactly (`navItems == ["/catalog","/upload"]`, `header.right` empty), so the first parallel stream that adds a nav item or fills `header.right` (WP-FRONTEND-02, web-projects) turns the suite red and must edit a file outside its paths — precisely what D-15 is meant to prevent. That is a one-line fix in a file this package owns; everything else can be accepted as is. Screenshot evidence (AC-3) is a claude.ai artifact I cannot open and is left for the orchestrator to judge.

## 2. Scope -> code -> status (head `c8de8c2e8c`)

| Item | Where | Status |
|---|---|---|
| 2.1 ITSALT tokens in `@theme` | `web/src/styles/globals.css:10-57` (colors, `--radius-sm/md/lg/xl/pill`, `--shadow-soft/card/lift/orange`, `--font-sans/display/mono`); values match `itsalt-site/web/assets/css/tokens.css` lines 11-65 | Done. Compiled CSS (clone build): `--radius-md:14px`, `.rounded-md{border-radius:var(--radius-md)}`, 0 occurrences of `hsl(`, no bare `--radius:` |
| 2.2 Fonts Inter Tight / Inter / JetBrains Mono, Cyrillic | `web/src/styles/fonts.css:1-145` (18 `@font-face`, `font-display: swap`, `unicode-range` latin + cyrillic); 18 woff2 under `web/public/fonts/` (265 KB total) | Done. cmap decoded with Node: every `*-cyrillic-*` file holds 92-96 codepoints in U+0400-045F, every `*-latin-*` 0; `package.json`/`pnpm-lock.yaml` unchanged |
| 2.3 shadcn variants | `button.tsx:7-24` (primary `shadow-orange`/`hover:bg-primary-hover`, ghost `hover:text-brand`, sm `rounded-sm`), `card.tsx:11,37`, `input.tsx:12`, `textarea.tsx:11`, `badge.tsx:6-10` (pill, mono), `table.tsx:75`, `dialog.tsx:35`, `select.tsx:73`, `toast.tsx:25` | Done |
| 2.4 AppShell | `web/src/components/layout/app-shell.tsx:7-58` (brand link "Transcrib" `t("shell.brand")`, nav from registry, `header.right` outlet at :132, `<main><Outlet/>`); all six pages are children of the pathless layout route in `App.tsx:28-43` | Done; no login, no new API calls |
| 2.5 Light only, no horizontal scroll | no dark tokens anywhere; `globals.css:73 body { overflow-x: hidden }`; header `flex-wrap` at `app-shell.tsx:98,109` | Done, but "no horizontal scroll" is enforced by clipping (see Low finding L-1); not verified in a browser here |
| 2.5a Feature auto-wiring (D-15) | `web/src/lib/features.ts:74-78` (`import.meta.glob("../features/*/index.{ts,tsx}", {eager:true})`), `collectFeatures` :44-72; `App.tsx:28-43` spreads `registry.routes`; `i18n/config.ts:14-38` globs `../features/*/i18n/{ru,en}.json` eagerly as namespace `<name>`; slots `SLOT_NAMES` :8-13; outlets `header.right` (`app-shell.tsx:132`), `meeting.actions` (`routes/meeting/index.tsx:91-98`); `protocol.toolbar`/`project.tabs` declared, no outlet (declared deviation 2) | Done; test `lib/features.test.tsx` + my M4 on-disk feature confirm |
| 2.6 Not done: login, workspace switcher | nothing in diff | Respected |

| Acceptance criterion | Evidence | Status |
|---|---|---|
| AC-1 web tests + `pnpm -r typecheck` green | clone: typecheck exit 0; web 156/156 with `--testTimeout=60000`; with default 5 s RQ-008 times out (pre-existing: 6.4 s at base SHA `343f4a1` in the same clone) | Pass (RQ-008 environmental) |
| AC-2 no stock shadcn values; button `rounded-md` = token radius | `tokens.test.ts:30-39`; compiled CSS `.rounded-md{border-radius:var(--radius-md)}` + `--radius-md:14px`; button base class `rounded-md` at `button.tsx:7` | Pass |
| AC-3 screenshots 1440/390 before/after | PR body links `https://claude.ai/artifact/8QgUYYrAaR59zfgJdmr61W` — not images in the PR; not openable with my tools | **Not verifiable by me — orchestrator to judge** |
| AC-4 contrast >= 4.5:1 with values in PR | PR table 15.8 / 7.5 / 4.92 / 6.4; `tokens.test.ts:41-54` computes from the real file (mutation M3 turned it red with 3.48) | Pass |
| AC-5 auto-wiring test green + "how to add a feature" | `features.test.tsx` 3/3; instruction in PR body ("Как добавить фичу") | Pass, with condition C-1 (brittle assertions) |

## 3. Answers to the risk questions

**Q1 Removed behaviour in App.tsx.** Base `App.tsx` (`git show 343f4a108a:web/src/App.tsx`) had: `QueryClientProvider` > `ToastContextProvider` > `RouterProvider` + `Toaster`, and six flat routes `/`, `/catalog`, `/upload`, `/meetings/:id`, `/meetings/:id/transcript`, `/meetings/:id/protocol` with `CatalogPage`, `CatalogPage`, `UploadPage`, `MeetingDetailPage`, `TranscriptPage`, `ProtocolPage`. Head `App.tsx:46-56` keeps the provider tree byte-identical; `App.tsx:33-38` keeps all six paths and elements identical, now as `children` of a pathless layout route whose element is `FeatureRegistryContext.Provider > AppShell`. The base had no error boundary, Suspense, redirect or 404 route, and none was added. Nothing removed; the package did not ask for removals.

**Q2 i18n.** Key diff of `ru.json` and `en.json` (flattened, sorted): only additions `shell.brand`, `shell.navLabel`; zero removals or renames. `config.ts:40-48` keeps `defaultNS = "translation"`, `fallbackLng: "en"`, `lng` from localStorage default `ru`. Feature glob at `config.ts:30-33` is **eager** (`eager: true, import: "default"`), so namespaces are in `resources` at init — no lazy load, no untranslated flash, no async in tests. Fallback verified in M4: `i18n.t("zzreview:nav.missing")` returns `"nav.missing"` (key, no throw), `t("nav.catalog")` still resolves from the default namespace.

**Q3 Auto-wiring robustness.** Pattern `../features/*/index.{ts,tsx}` (`features.ts:75`): a single `*` does not cross `/`, so `features/<name>/components/index.tsx` is not matched — proven in M4 (decoy route `/decoy` absent, registry routes == `["/zz"]`). Both `index.ts` and `index.tsx` in one feature would both be collected (Info). Modules are iterated in `Object.keys(modules).sort()` order (`features.ts:59`) and `navItems` sorted by `order ?? 100` with a stable sort (`:70`), so ties are broken deterministically by path. Two features declaring the same route path: both are pushed after the core routes (`App.tsx:40`); react-router ranks equal-score routes by definition order, so the core/earlier one silently wins — no warning (Info). `features/shell/index.ts:6-11` registers no routes and two nav items (`/catalog` 10, `/upload` 20): it is needed because `AppShell` builds its nav exclusively from the registry (`app-shell.tsx:111`); without it the header would have no links.

**Q4 Mutations.** M1 glob pattern changed to `nope.{ts,tsx}` -> `features.test.tsx` test 1 fails ("expected [] to equal ['/catalog','/upload']"). M2 `...registry.routes` removed from `App.tsx` -> test 2 fails (`/tmp` page not found). M3 `--color-primary: #f4510b` -> `tokens.test.ts` fails with `expected 3.4835 >= 4.5`. M3b `--color-popover: hsl(0 0% 100%)` -> "has no stock shadcn values" fails. `tokens.test.ts:5-15` reads `src/styles/globals.css` with `readFileSync` and regex-extracts hex per token — real values, not literals. All four restored, clone clean after each.

**Q5 routes/meeting/index.tsx.** Diff is +9/-0 (`:7` import `SlotOutlet`; `:90-98` a `div[data-testid=slot-meeting-actions]` with `empty:hidden` containing `<SlotOutlet name="meeting.actions" meetingId={meetingId}/>`, inside the `data &&` block after `StatusSection`). No action, state, SSE handler, query or text removed; base and head otherwise identical.

**Q6 Styles.** Source `globals.css` and compiled CSS both contain no `hsl(` and no bare `--radius:`. `fonts.css` uses `font-display: swap` and Google-Fonts-style `unicode-range` on every face (`U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116` for Cyrillic). Fonts total 270,988 bytes (265 KB) across 18 files; because of `unicode-range` and weight matching a typical page fetches only the weights it uses (Inter 400/500/600 latin+cyr about 96 KB, Inter Tight 800 about 30 KB), which is acceptable for first paint. `--radius-xl: 20px` is set so Tailwind's default `rounded-xl` also maps to the token.

**Q7 Screenshots.** The PR provides a claude.ai artifact link, not images attached to the PR. I cannot open it with Read/Grep/Glob/Bash and did not try; this is a deviation from AC-3 ("скриншоты в PR") for the orchestrator to accept or reject. Note Docker is unavailable and I did not render pages in a browser; the 390 px claim is unverified by me beyond the CSS reasoning in L-1.

**Q8 Brand orange.** `#F4510B` survives as `--color-brand` (`globals.css:22`) and `--color-ring` (`:37`, every `focus-visible:ring-ring` on button/input/textarea/badge), plus `--shadow-orange` rgba(244,81,11,.28) on the primary button (`button.tsx:12`). Visible uses: brand dot in the header (`app-shell.tsx:104 bg-brand`), ghost button hover text (`button.tsx:18 hover:text-brand`). Compiled CSS emits `.bg-brand`, `.hover\:text-brand:hover`, `.shadow-orange` — so the utilities are not dead. The package explicitly allowed orange-burnt when contrast required it; white on #F4510B is 3.48:1 (reproduced by M3), so the deviation is justified.

**Q9 Shared-path discipline.** The wiring itself is sound (nothing in `App.tsx` or `i18n/**` will need touching: proven by M4 with a real on-disk feature). The problem is `web/src/lib/features.test.tsx` (frontend stream path `web/src/lib/**`): line 51-56 asserts `featureRegistry.navItems.map(to)` **toEqual** `["/catalog","/upload"]` and line 486 asserts `slot-header-right` **toBeEmptyDOMElement()** against the global registry. When WP-FRONTEND-02 adds a tasks nav item / workspace switcher, or web-projects adds a projects nav item, `pnpm --filter @transcrib/web test` goes red in a file they may not edit. Reproduced in M4: adding `features/zzreview` made test 1 fail with `expected ['/zz','/catalog','/upload'] to deeply equal ['/catalog','/upload']`. Nothing else in the diff needs editing by other streams: `protocol.toolbar` outlet belongs in `routes/protocol/**` (web-feedback's path) and `project.tabs` in `features/projects/**` (web-projects), as the PR states.

**Q10 CI.** Run 37655791557, job "Lint + Typecheck + Test" **pass** in 57 s; `gh pr checks 9` -> pass. Annotations are pre-existing `no-explicit-any` warnings in `worker/**` tests and runner deprecation notices, none from this PR's files.

## 4. Findings

**Medium — C-1 (condition), `web/src/lib/features.test.tsx:51-56` and `:482-487` — D-15 regression vector.** Scenario: any feature folder with a `navItems` entry or a `header.right` slot (first one: WP-FRONTEND-02 `features/{auth,tasks}`, web-projects `features/projects`) -> both assertions fail -> the parallel stream must edit `lib/features.test.tsx`, which is outside its allowed paths. Require: assert with `expect.arrayContaining` / `toContain` for the shell items (or build the expectation from `collectFeatures({"../features/shell/index.ts": shellModule})`), and render the "empty header.right" case with an explicit registry (`collectFeatures({...shell only})`) rather than the global `featureRegistry`. Not a regression against the base; a defect of the new test.

**Low — L-1, `web/src/styles/globals.css:73` `body { overflow-x: hidden }`.** This makes "no horizontal scroll at 390 px" true by clipping rather than by layout: any element wider than the viewport (e.g. a long unbroken `recording.filename` in `MetadataCard`, or a wide fixed-width child in a future feature) becomes unreachable instead of scrollable. The shadcn `Table` wrapper has its own `overflow-auto` so the catalog is fine. Require nothing now; suggest the orchestrator confirm with the 390 px screenshots that no content is cut, and consider `overflow-x: clip`/removal once real mobile QA runs.

**Info — I-1, `web/src/lib/features.ts:62` / `App.tsx:40`.** Duplicate route paths between a feature and the core (or two features) are silently resolved by definition order; no dev warning. Candidate for backlog: `console.warn` in `collectFeatures` on duplicate `path`.

**Info — I-2, `web/src/components/layout/app-shell.tsx:111-124`.** Header nav duplicates the catalog page's own "Upload" button (`routes/catalog/index.tsx:42-46`); cosmetic, not a regression.

**Info — I-3.** `meeting.actions` outlet in `routes/meeting/index.tsx:91-98` has no test in the PR (my M4 test covered it and it works); backlog.

## 5. Deviations (PR body)

1. Primary `#C84312` instead of `#F4510B` — **accepted**: package allowed it; contrast 3.48:1 reproduced; brand orange still used (Q8).
2. `protocol.toolbar` / `project.tabs` without outlet — **accepted**: outlets belong in paths owned by web-feedback / web-projects; slots are typed and collected (`features.ts:8-13, 64-67`).
3. `routes/upload` and `routes/protocol` untouched but inside AppShell — **accepted**: those paths belong to web-projects / web-feedback; rendering inside the layout route needs no edit.
4. `web/src/vite-env.d.ts` added — **accepted**: listed in the frontend stream's paths in `orch.yaml:126`; required for `import.meta.glob` typing; typecheck green.
5. `instructions check` synchronized=false, CLAUDE.md/AGENTS.md untouched — **accepted** per D-17; neither file is in the diff.
6. RQ-008 slow — **accepted**: 6.4 s at base SHA in the same clone, 7.8 s at head; environmental, file untouched.

Undeclared deviation: AC-3 screenshots delivered as an external claude.ai artifact instead of in the PR — **for the orchestrator**.

## 6. CI, size, tests, mutations

- CI: run 37655791557 pass (job 112911200586, 57 s); `gh pr checks 9` pass; PR mergeable.
- Size: 41 files, +601/-65; 18 are binary woff2 (265 KB); 23 source files.
- Clone at `/tmp/orch-review.DC2b6y/repo` (head `c8de8c2`): `pnpm install --frozen-lockfile` exit 0; `db:generate` exit 0; `pnpm --filter @transcrib/shared build` exit 0; `pnpm --filter @transcrib/web test` exit 1 (155/156, RQ-008 timeout at 5 s); rerun `vitest run --testTimeout=60000` 156/156 in 19.3 s; `pnpm -r typecheck` exit 0; `eslint .` in web exit 0; `vite build` succeeded (compiled CSS inspected as reported above). RQ-008 at base SHA `343f4a1`: 6.4 s (pre-existing).
- Mutations: M1 broken glob -> fail; M2 registry spread removed -> fail; M3 primary `#f4510b` -> fail (3.48); M3b `hsl(` reintroduced -> fail; M4 real on-disk feature `features/zzreview` (route, nav order 1, `meeting.actions` slot, `i18n/{ru,en}.json`, decoy `components/index.tsx`) -> my 3 throwaway tests pass, `tsc --noEmit` exit 0, and the PR's test 1 fails (basis of C-1). Clone restored to 0 changes after each step.

## 7. Cleanup

`review_clone.sh --cleanup /tmp/orch-review.DC2b6y` -> "removed /tmp/orch-review.DC2b6y", exit 0; directory no longer exists. Build output written only to my scratchpad. No files in `/home/cloudpc/projects/transcriber` or its worktrees were touched; no PR comments, approvals or merges were made.

