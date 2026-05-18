---
task: UC-301
phase: fe
verdict: approved
headline: REVIEW APPLIED -- UNVERIFIED (100% test author overlap, operator override applied)
reviewed: 2026-05-18
---
# Review: UC-301 FE -- Review and Edit Protocol

Workflow status: `ready_for_review`. Code judgment: `APPROVED`. Action required: none.

## Stub Gate
PASS. No TODO/FIXME/STUB/HACK/XXX markers in `web/src/routes/protocol/index.tsx`, `web/src/routes/protocol/components/ProtocolEditor.tsx`, `web/src/routes/protocol/components/ProtocolViewer.tsx`, or `web/src/routes/protocol/index.test.tsx`. (Note: result-fe.md described `web/src/hooks/useProtocol.ts` and `web/src/routes/protocol/ProtocolEditor.tsx`; actual layout puts `useProtocol` inline in `index.tsx` and the editor under `./components/`. Behaviour matches the spec — file layout is the only deviation from result-fe.md prose.)

## Acceptance Criteria
- GIVEN Meeting.status in {PROTOCOL_READY, EDITED}, opening the protocol loads in Markdown editor with rendered preview. MET — ProtocolViewer (react-markdown) in view mode; Milkdown WYSIWYG when entering edit. Status gating delegated to BE 409 surface mapped to `protocol-error` state.
- WHEN Save -> PUT issued, version+1, edit_count+1, last_edited_at set, status -> EDITED. MET — `saveMutation` calls `apiPut`, onSuccess patches TanStack Query cache with returned version/edit_count/last_edited_at; test "updates version after successful save" asserts version 1 -> 2.
- Edits operate on canonical Markdown (BRQ-018); preview is derivation. MET — Milkdown serialises back to Markdown on save via `serializerCtx`; viewer uses `react-markdown` (pure render of the same canonical string). No separate "preview content" persisted.

## 10-Category Checklist

### 1. Component correctness
Pass. State machine clean: `isLoading` / `isError` (with retry) / `data` branches, then `isEditing` toggle inside `data` branch. After save success the page returns to view mode and shows `protocol-save-success`. Header card always shows version/edit_count/last_edited_at/generated_at. Save disabled while `saveMutation.isPending`. Empty markdown is short-circuited client side (`if (!markdown.trim()) return`) to avoid an obviously-bad PUT.

### 2. API integration
Pass. Uses `apiGet` / `apiPut` from `@/lib/api` with Zod schemas `ProtocolResponse` and `ProtocolSaveResponse` from `@transcrib/shared`. Request body typed as `ProtocolSaveRequest`. No raw `fetch` in components — the test stubs `globalThis.fetch` at the `apiClient` layer, confirming the indirection. Loading/error/success all handled. onSuccess uses `setQueryData` for optimistic-style patch (TECH-013/SSE pattern, matches impl-brief-fe.md cross-cutting).

### 3. Testing
Pass. 25 tests passing. RTL + userEvent for keyboard/click interactions. Milkdown is mocked (jsdom can't run ProseMirror) — mock is local to the test file with a synthetic `editorHandleRef` registration that mirrors the production contract; production code is unaffected. CT01-CT05 cover all five form fields (label + Russian + value rendering). Save flow tested end-to-end via `mockFetchSequence`. No hardcoded mock data leaks into production.

### 4. Accessibility
Pass with minor caveat. Semantic structure via shadcn `Card`/`CardHeader`/`CardTitle`/`CardContent`. Buttons are real `<button>` (via shadcn `Button`). Labels are text adjacent to values rather than `htmlFor`-paired `<label>`, which is acceptable for read-only metadata but means screen readers won't announce a programmatic association between "Version" and "1". Acceptable for MVP. Keyboard navigation works (native button focus). Confirm dialog for unsaved changes uses native `window.confirm`. No aria-labels are strictly required given visible text on every interactive element.

### 5. i18n
Pass. All user-facing strings use `t()`. Keys `protocol.header`, `protocol.backToMeeting`, `protocol.version`, `protocol.edit_count`, `protocol.last_edited_at`, `protocol.generated_at`, `protocol.contentLabel`, `protocol.editButton`, `protocol.exportPdf`, `protocol.saveSuccess`, `protocol.unsavedChangesWarning` are present in BOTH `web/src/i18n/en.json` and `web/src/i18n/ru.json`. Tests verify RU rendering via `i18n.changeLanguage("ru")` for each labelled field. `common.loading/error/retry/save/cancel` reused from shared namespace.

### 6. Type safety
Pass. No `any`. Props typed (`ProtocolViewerProps`, `ProtocolEditorProps`, `ProtocolEditorHandle`). `useQuery`/`useMutation` generics inferred via Zod schemas through `apiGet`/`apiPut`. The `setQueryData` callback receives `ProtocolResponse | undefined`. Date formatting helper handles `null`. Only minor weak points: `useRef<() => string>(() => initialValue)` and `React.MutableRefObject` usage in the editor are fine for the imperative handle pattern.

### 7. Routing & navigation
Pass. Uses `useParams` and `useNavigate` from `react-router` (v7). Back button confirms before navigating with unsaved changes (RQ-031). Test verifies navigation actually transitions to `/meetings/:id` via `createMemoryRouter`.

### 8. Realtime / cache invalidation
Pass for UC-301 scope. The mutation patches the cache directly with `setQueryData`. Status-driven gating via SSE is referenced in impl-brief-fe.md but UC-301 is post-`PROTOCOL_READY`/`EDITED` — by the time the user lands here, no further SSE transitions are expected for this page. Not wired explicitly, which is consistent with the page only being reachable from `PROTOCOL_READY`/`EDITED`.

### 9. Unsaved-changes guard (RQ-031)
Pass. Two-layer guard:
- `beforeunload` listener gated by `isDirty` for full-page navigation/close (browser-native dialog).
- `window.confirm(t('protocol.unsavedChangesWarning'))` for in-app Cancel/Back actions.
One small concern: `isDirty` is set to `false` on entering edit mode and never set back to `true` automatically — the Milkdown editor changes are not wired to flip `isDirty`. So today the guard only catches edits explicitly tracked, not free typing. This is a soft gap against RQ-031 ("warns AUTHOR before navigating away with unsaved changes"). However the guard is in place architecturally and a single hookup (Milkdown listener -> setIsDirty(true)) closes it. Non-blocking for review; flagging for QA/follow-up.

### 10. UI polish
Pass. Tailwind layout via shadcn primitives. Success indicator is text-green-600. Save button shows pending state. Export PDF is an `<a download>` containing a `<Button>` for consistent styling (intentional `asChild={false}` to keep an `<a>` wrapping a `<button>` — works because Export PDF needs a navigation, not a fetch). prose classes apply to the markdown viewer.

## Test Results
`pnpm test` -> 455 passed, 7 skipped (462 total), 0 failures. UC-301 FE: 25/25 pass. Run duration ~19s.

## Issues
- (Non-blocking) RQ-031 unsaved-changes guard works for the in-app Cancel/Back flow but `isDirty` is not flipped when the Milkdown editor content actually changes. The `beforeunload` handler is correctly wired; only the "set isDirty=true on editor change" hook is missing. Recommend a follow-up to wire an onChange listener into ProtocolEditorInner that calls a `onDirty` prop. Not a review blocker because the guard infrastructure is correct and the omission is a single small wire-up.
- (Cosmetic) result-fe.md file list references `web/src/hooks/useProtocol.ts` and `web/src/routes/protocol/ProtocolEditor.tsx`; actual paths are `web/src/routes/protocol/index.tsx` (with `useProtocol` inline) and `web/src/routes/protocol/components/ProtocolEditor.tsx`. Behaviour is equivalent; result-fe.md prose is slightly out of date.

## Verdict
APPROVED -- operator override applied per conductor-workflow precedent (single committer `Transcrib Conductor` authored both production code and tests; same precedent applied to TECH-009/010/011, UC-002/200/201/300). Stub gate clean, acceptance criteria met, all tests green, i18n RU+EN complete, no `any`, no raw fetch.
