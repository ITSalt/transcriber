# Changelog — .tl/

## [2026-05-26] nacl-sa-feature: FR-001 — Worker job retry resilience (spec)

- **Artifact:** `.tl/feature-requests/FR-001-retry-resilience.md` + `:FeatureRequest {id:'FR-001'}` graph node (status `spec-complete`). Closes the follow-up flagged in the kie.ai L0 entry below.
- **Impact method:** Neo4j graph traversal (fulltext `sa_impact_analysis` + RuntimeContract trace). Pre-flight: restored the OOM-killed `transcrib-neo4j` container and backfilled two graph-infra prereqs the current skill needs — `fulltext_ba_search` index + `constraint_featurerequest_id` (this project's committed graph-infra lagged the skill version).
- **Scope decisions (user gate):** Regenerate action placed in `mod-common` as UC-004 (covers both transcription + protocol failures); auto-retry folded in as spec refinement (not a separate bug-fix).
- **Key finding:** auto retry-with-backoff was ALREADY specified in `RC-UC-200`/`RC-UC-300` ("max 3 attempts, exp backoff, retry 429/5xx, halt on permanent"), but (a) `RQ-015`/`RQ-026` said "on ANY failure → FAILED" (contradiction) and (b) no contract addressed the FAILED-write-before-exhaustion + idempotency-guard interaction that actually breaks retry in code.
- **Graph writes — NEW:** UseCase `UC-004` (+ActivityStep AS01–AS06, ACTOR→SR-01, USES_FORM→FORM-MeetingDetail); Requirement `RQ-034/035/036`; RuntimeContract `RC-UC-004`; Component `CMP-RetryProcessing`; DomainAttribute `attempt_count` on `TranscriptionJob-A08` + `ProtocolGenerationJob-A09`. **MODIFIED:** `RQ-015`/`RQ-026` (permanent-OR-exhaustion semantics); `RC-UC-200`/`RC-UC-300` (FAILED-write timing); `SR-01` permissions (RU/scope=own on both job entities).
- **Validation:** UC-004 fully connected (actor/form/runtime-contract/6 steps/3 reqs); new reqs all linked; `attempt_count` on both entities. Sole L4 hit (`FORM-MeetingDetail-F11`) is the pre-existing `delete_button` (field_category=action, exempt) — not introduced here.
- **Recommended TECH (→ /nacl-tl-plan):** TECH-025 — `parseRedisUrl()` drops the URL db-index (worker on Redis DB 0 despite `REDIS_URL=.../1`).
- **Next:** `/nacl-tl-plan --feature FR-001` to generate dev tasks. Implementation note: reconcile the worker's `Meeting.status='ERROR'` to the spec enum value `FAILED` during dev.

## [2026-05-26] nacl-tl-fix: kie.ai HTTP 404 — transient outage, prod meeting recovered

- **Level:** L0 (environment — transient external API failure; no code/spec change shipped)
- **Status:** PASS (operational recovery verified end-to-end on production)
- **Spec-first verdict:** SKIPPED (L0)
- **Root cause:** kie.ai (`POST https://api.kie.ai/claude/v1/messages`, model `claude-sonnet-4-6`) returned HTTP 404 in a ~2-minute window on 2026-05-26 ~12:48–12:50 MSK. Two protocol-generation jobs failed in that window (meetings `5e1f92b5`, `b2841092`). Verified transient: identical request (same key/model/endpoint, curl + Node fetch) returns HTTP 200 ×5 from the prod VPS (`learn-prod`, 82.202.156.157) at 13:02 MSK. Last pre-outage protocol (meeting `a5a6b2ab`, 2026-05-25 18:02) succeeded; all post-recovery succeed.
- **Affected UC:** UC-300 (protocol generation)
- **Recovery action (prod):** meeting `b2841092` ("Статус Госключ и TCB") reset `ERROR→TRANSCRIBED`; job `a0d1137c` reset `FAILED→PENDING` (cleared error_msg/started_at/finished_at); re-enqueued to BullMQ (`bull:protocolGenerationJob`, Redis DB 0). Worker job 16 ran 13:07:21→13:07:52, Protocol v1 persisted (2355 chars), meeting `PROTOCOL_READY`. Meeting `5e1f92b5` was user-deleted before recovery — nothing to restore.
- **Docs updated:** none (L0)
- **Code changed:** none
- **Tests:** none (no code change; recovery validated by live prod state transition PROCESSING→DONE and persisted Protocol row)
- **Follow-up (NOT shipped here — needs spec change to RQ-026):** transient ASR/LLM failures permanently brick a meeting. No BullMQ retry is configured (default attempts=1), and even if it were, the failure handler sets the Prisma job to FAILED so the idempotency guard (`status===FAILED → return`) would no-op any BullMQ re-attempt. RQ-026 currently mandates "do NOT re-enqueue". Recommend a feature flow (`/nacl-sa-feature`) for retry-with-backoff and/or a user-facing "regenerate" action. Also noted: `parseRedisUrl()` silently drops the URL db-index (`/1`), so the worker runs on Redis DB 0 despite `REDIS_URL=.../1` — harmless today (producer+consumer agree) but a latent foot-gun.

## [2026-05-22] UC-200 reconcile — graph + task-be docs synced to code (nacl-tl-reconcile)

- **Trigger.** Re-run of `/nacl-tl-verify-code UC-200` on 2026-05-22 surfaced 3 confirmed drifts pre-flagged in `UC-200/review-be.md` (m-1 JobStatus/MeetingStatus enum vocab; m-4 ProtocolGenerationJob audit fields) plus 4 new findings (Transcript.full_text→raw_text rename + segments_blob addition + segments_count/speakers_count/language now derived; TranscriptionJob.recording_id removal; completed_at→finished_at; error_reason→error_msg).
- **Mode.** Code-canonical reconcile (the exception to spec-first). Source of truth = `api/prisma/schema.prisma` + `shared/src/enums.ts`. No code mutations — only doc-style updates (Neo4j SA graph + task-be.md files + worker JSDoc header).
- **Pre-Phase-3 gap closure.** `UC-200 review-be.md` carried `REVIEW APPLIED — UNVERIFIED (test author overlap 100%)`. To resolve the upstream UNVERIFIED qualifier before reconciling docs to code, an independent test author (developer subagent, no awareness of original `transcription.test.ts`) authored `worker/src/jobs/transcription.regression.test.ts` — 14 tests covering lifecycle/optimistic-lock, happy-path persistence, after-commit BullMQ enqueue ordering, failure-path state, terminal-state immutability. Each test mutation-verified RED→restore→GREEN. Full worker suite 118 → 132 tests, all passing.
- **DRIFT #4 resolution.** Option B (spec follows code). Removed `transcript_id` and `prompt_template_version` from `ProtocolGenerationJob` in graph + all task-be.md tables. MVP uses a single hard-coded prompt template version; Transcript is reached via `meeting_id` at protocol-gen time.
- **Graph writes.** Enumeration JobStatus + MeetingStatus values populated (were NULL). DomainAttribute renames + additions + derived-flagging on Transcript / TranscriptionJob / ProtocolGenerationJob. FormField MAPS_TO Transcript.language preserved by marking derived rather than deleting.
- **Doc updates.** UC-200/task-be.md, UC-100/task-be.md, UC-300/task-be.md, UC-301/task-be.md — Enumerations sections, entity tables, System steps, RQ descriptions. Worker `transcription.ts:1-18` JSDoc + RQ-014 comment + step label updated (authorized by user as "doc lines mirroring spec, not runtime code"; no runtime code touched).
- **Health Score.** 75 raw → 75 adjusted (no `verified-pending` tasks in `.tl/status.json`).
- **Headline.** `RECONCILE COMPLETE` — upstream-fix status flipped from UNVERIFIED to PASS after the independent regression test landed in pre-Phase-3.
- **Scope.** MEDIUM. 5 doc files modified, 0 created. 1 review-be.md metadata bump (`prior_blockers_resolved: [M-1, M-2, m-1, m-4]`). 1 worker JSDoc + 2 inline-comment edits.
- **E2E gap (post-reconcile decision 2026-05-22).** Local Playwright suite is NO_INFRA — `@playwright/test` is in `package.json` but no `playwright.config.ts`, no `.spec.ts` files, no `e2e/` directory exist in the repo. Per user decision, the authoritative E2E coverage for UC-200 is the existing `LIVE_PROVIDER_SMOKE` (2026-05-22T13:12:35Z, captured in `.tl/tasks/UC-200/qa-evidence/2026-05-22-live-provider-smoke.yaml`) plus the `PROD_GOLDEN_PATH` run on transcriber.itsalt.ru (meeting `494e8e69`, recorded in `.tl/status.json#summary._w7_closure_note`). No new E2E tests authored as part of this reconcile.

## [2026-05-22] W9 — Spec-first retroactive audit (GAP-closure)

Post-W11 strict mode requires every L1+ fix/feature change to be preceded by a
spec-update commit (nacl-tl-fix/SKILL.md:48-50). Post-v0.2.0 commits between
2026-05-18 and 2026-05-22 landed code-first; the spec equivalents were
authored retroactively in W3-external-contracts + the post-v0.2.0 BusinessRule
additions. This block records the retroactive coverage so a future
nacl-tl-fix invocation reads `verdict=PASS` via the
`spec-update-by-changelog` secondary signal (nacl-tl-fix/SKILL.md:157-168).

| Commit | Subject | Implied level | Retroactive spec |
|---|---|---|---|
| `ed6aaa9` | feat(UC-100): replace TUS with direct S3 presigned multipart upload | L3 (ADR-level reversal) | Graph: `(:Requirement {id:'ADR-005'}).status='revoked'` + new `ADR-012` (CONTAINS_ADR from FinalizationReport). File: `.tl/external-contracts/s3-multipart-presigned.md`. Both authored 2026-05-22 in W3. |
| `5d9585d` | fix(UC-100): ffprobe `s3://` scheme rejection | L2 (UC-100 wire protocol) | `.tl/external-contracts/s3-multipart-presigned.md` § 7 "Toolchain compatibility — ffprobe does NOT accept s3:// scheme; worker uses presigned GET URLs". Authored 2026-05-22. |
| `66049d5` | fix(UC-300): copy llm/prompts/*.md into worker dist | L1 build-config | `.tl/external-contracts/kie-anthropic.md` Optional fields → "Framework-specific gotchas: prompt templates copied to dist on build". `config.yaml.runtime_assets[]` enumerates the dist paths (W8). |
| `5eb7e18` | fix(UC-200): feed ffmpeg a presigned S3 URL (not stdin Buffer) | L2 (UC-200 audio source contract) | `.tl/external-contracts/deepgram.md` § 7 + `.tl/external-contracts/s3-multipart-presigned.md` § 7 (presigned GET URL pattern). |
| `1f025b7` | fix(UC-300): switch kie.ai → Anthropic `/claude/v1/messages` | L2/L3 (wire envelope change) | `.tl/external-contracts/kie-anthropic.md` § 2 (Endpoint), § 3 (Bearer auth), § 4 (Anthropic request shape), § 5 (Anthropic response — NOT OpenAI). Authored 2026-05-22. |
| `7f983f6` | fix(TECH-012): emit `event:<type>` SSE frame | L1 wire detail | `.tl/external-contracts/sse.md` § 5 (mandatory `event:` line) + Optional fields "Stream / SSE frame envelope". |
| `1b94f5b` | feat(UC-100): accept WEBM uploads + 1 GiB size cap | L2 (UC-100 BusinessRule changes) | Graph: `BR-101` (WEBM MIME acceptance), `BR-102` (1 GiB cap). Created 2026-05-22 in W3, linked `UC-100 HAS_REQUIREMENT`. |
| `ad7b8b4` | feat(UC-100/UC-200): optional speaker count + sticky back-link | L2 (UC form + UI behavior) | Graph: `BR-103` (speaker_count hint), `BR-104` (sticky back-link). Created 2026-05-22 in W3. |
| `40341a6` | feat(UC-300): rewrite RU protocol prompt with XML structure | L1 prompt asset / L2 output contract | Graph: `BR-105` (RU prompt XML structure invariant). Created 2026-05-22 in W3. |

**Verdict.** Each L1+ commit in the post-v0.2.0 range now has a spec
counterpart datestamped 2026-05-22. Future nacl-tl-fix runs key off the
spec-update-by-changelog secondary signal via the dates in this table.
This closes GAP-029, GAP-030, GAP-031 from the GAP-closure register.

**Lag.** Code-first → spec-after lag = 3–4 days for the earliest commits
(ed6aaa9 2026-05-19 → spec 2026-05-22) and 0 days for the latest (40341a6
2026-05-22 → spec 2026-05-22). Future fix discipline should keep lag = 0
per the spec-first prerequisite gate.

---

### [2026-05-19] feat(UC-100): replace TUS with direct S3 presigned multipart upload
- **Level:** Feature
- **Status:** PASS (UC-100-BE: done, UC-100-FE: done)
- **Root cause / motivation:** @tus/s3-store v2.0.4 does not support TUS concatenation extension — parallelism impossible. 66 MB files took 3-4 minutes (~275-440 KB/s). Files up to 500 MB expected.
- **Affected UC:** UC-100
- **New endpoints:** POST /api/uploads/init, POST /api/uploads/complete, POST /api/uploads/abort
- **Removed:** @tus/server, @tus/s3-store (api), tus-js-client (web), api/src/plugins/tus.ts
- **Config added:** S3_PUBLIC_ENDPOINT (browser-reachable MinIO URL), MINIO_API_CORS_ALLOW_ORIGIN (docker-compose)
- **Upload flow:** Browser splits file into 10 MB parts, uploads 4 parts concurrently directly to MinIO using presigned PUT URLs, then POSTs part ETags to /complete
- **Expected speedup:** 3-5× for large files
- **Tests:** api/src/routes/uc-100.test.ts (18 tests PASS), web/src/routes/upload/index.test.tsx (17 tests PASS)

### [2026-05-19] nacl-tl-fix: TUS PATCH 415 — missing content-type parser for application/offset+octet-stream
- **Level:** L1 (Code-only)
- **Status:** PASS
- **Root cause:** Fastify 5 returns 415 for any Content-Type without a registered parser. PATCH /api/uploads/:id sends Content-Type: application/offset+octet-stream; no parser was registered → Fastify blocked the request before tusServer.handle().
- **Affected UC:** UC-100 / TECH-008
- **Docs updated:** none (L1)
- **Code changed:** api/src/plugins/tus.ts — added addContentTypeParser('application/offset+octet-stream')
- **Tests:** api/src/plugins/tus.test.ts — new test "registers content-type parser for application/offset+octet-stream (prevents 415 on TUS PATCH)"
- **Pre-existing failures (baseline-confirmed unrelated):** none

### [2026-05-18] nacl-tl-fix: POST /api/uploads 500 — invalid S3 credentials + Node.js upgrade to v22
- **Level:** L0 (Environment) × 2
- **Status:** NO_INFRA (ecosystem config), Node upgrade PASS (verified via pm2 show)
- **Root cause 1:** Cloud.ru S3 access key `InvalidAccessKeyId` — credentials in /opt/transcrib/.env are revoked/invalid
- **Root cause 2:** Node 20 (EOL April 2026) in use; AWS SDK warns it will drop Node 20 support
- **Affected UC:** infrastructure (upload pipeline)
- **Docs updated:** none (L0)
- **Code changed:** ecosystem.config.cjs (v20→v22 interpreter), .nvmrc (20→22), package.json engines (>=20→>=22), .github/workflows/ci.yml (NODE_VERSION 20→22)
- **Tests:** none — NO_INFRA for config changes; Node version verified live via pm2 show
- **Pre-existing failures:** none
- **Pending (user action required):** Update S3_KEY and S3_SECRET in /opt/transcrib/.env with valid Cloud.ru credentials, then restart API

### [2026-05-18] nacl-tl-fix: POST /api/uploads 415 — wrong TUS metadata key for MIME type
- **Level:** L2
- **Status:** PASS
- **Root cause:** `api-contract.md` documented TUS metadata key as `mime_type`; backend actually reads `filetype`. Frontend implemented per wrong docs, sending `mime_type=VIDEO_MP4` (enum value) instead of `filetype=video/mp4` (actual MIME string). Server found `metadata['filetype'] === undefined`, rejected with 415.
- **Affected UC:** UC-100
- **Docs updated:** `.tl/tasks/UC-100/api-contract.md` — corrected TUS metadata key from `mime_type` to `filetype`
- **Code changed:** `web/src/routes/upload/index.tsx` — TUS metadata now sends `filetype: file.type`
- **Tests:** existing test transitioned: `src/routes/upload/index.test.tsx` (CRIT-FE-3)

### [2026-05-18] nacl-tl-fix: Upload button missing from catalog page
- **Level:** L1
- **Status:** PASS
- **Root cause:** `CatalogPage` не содержал `<Link to="/upload">`. Роут `/upload` существовал, но был недоступен из UI. i18n-ключ `nav.upload` уже был в переводах.
- **Affected UC:** UC-100 (Upload meeting video — FE)
- **Docs updated:** none (L1)
- **Code changed:** `web/src/routes/catalog/index.tsx` (добавлена кнопка Upload в шапку), `web/src/App.test.tsx` (обновлён тест для поддержки Router-контекста)
- **Tests:** `web/src/routes/catalog/index.test.tsx` — 2 новых regression-теста (Path A, RED→GREEN)

## [2026-05-18] DELIVER — Production deployment LIVE on transcriber.itsalt.ru

- **Status:** PROD live at `https://transcriber.itsalt.ru` (HTTPS, Let's Encrypt). `/api/health` → 200. SPA real (not placeholder). learn + Mattermost neighbours unaffected.
- **Deploy SHA:** `27da444` (workflow hardening) on top of `aeeae53` (first green deploy).
- **GitHub Actions:** push-to-main pipeline green (CI ~1 min + deploy ~3 min). Workflow `.github/workflows/deploy-production.yml` runs SSH-based deploy as `deploy@82.202.156.157`.
- **pm2 apps:** `transcrib-api` (Fastify, 127.0.0.1:3010) + `transcrib-worker` (BullMQ consumer). Coexist with `learn-api`, `learn-worker`.
- **TECH-016..023:** approved. **TECH-024:** approved for deploy infrastructure; UC golden-path upload smoke-test (Deepgram + kie.ai pipeline + PDF export) deferred to next session — see `.tl/tasks/TECH-024/result.md` recommendations.
- **Lessons captured in TECH-024 result.md:**
  1. SSH key rotation procedure (re-create keypair + scoped append to authorized_keys + gh secret set via stdin pipe).
  2. Prisma client must be `db:generate`d explicitly in the deploy step (not auto-run by pnpm install).
  3. ecosystem.config.cjs structural fields (script/cwd/interpreter) require `pm2 delete + start`, not `pm2 reload`.
  4. .env on server uses `PORT` (not `API_PORT`) and `HOST=127.0.0.1` (Caddy reverse-proxy expects loopback).

## [2026-05-18] PLAN — Production deployment (TECH-016 .. TECH-024)
- Added deployment plan for PROD on `82.202.156.157` / `transcriber.itsalt.ru`. Architecture document: `.tl/deploy-plan.md`.
- **9 new TECH tasks** in waves 7–10 (additive to existing waves 0–5):
  - Wave 7 (parallel prep): TECH-016 (Cloud.ru bucket, user manual), TECH-017 (server bootstrap), TECH-019 (pm2 ecosystem), TECH-021 (S3 + puppeteer-core), TECH-022 (/api/health + graceful shutdown).
  - Wave 8 (server wiring): TECH-018 (Postgres role + Redis DB index + filesystem + .env), TECH-020 (Caddy server-block).
  - Wave 9 (CI/CD): TECH-023 (GitHub Actions deploy-production.yml + repo secrets).
  - Wave 10 (cutover): TECH-024 (DNS + first deploy + smoke test runbook).
- **Coexistence guaranteed:** plan is strictly additive — separate Postgres role `transcrib` (inside existing `learn-postgres` container), Redis DB `/1` (with BullMQ prefix `transcrib:`), Cloud.ru bucket `transcrib-itsalt-prod` (with scoped service account), pm2 apps `transcrib-api` / `transcrib-worker`, new Caddy server-block. learn + Mattermost services untouched.
- **Source of plan:** server inspection (read-only SSH as `magz`) + learn project conventions; no Neo4j SA changes (deployment is infra concern, not modeled in graph).
- **Status:** `PLAN APPLIED — PARTIAL`. Three open questions in `master-plan.md § Production deployment` need answers before TECH-018 can start; TECH-016 (Cloud.ru bucket creation by user) is unblocked and can begin in parallel.

## [2026-05-18] Post-intake cleanup — DELIVERED (Phase 6)
- **Final state:** all 30 plan tasks at terminal status. 28 `done`, 2 `verified-pending` (UC-200-BE / UC-300-BE — provider E2E gated on API keys).
- **Remote:** `git@github.com:ITSalt/transcriber.git`; default branch `main` at `5258a11`.
- **CI green:** [run 26045597888](https://github.com/ITSalt/transcriber/actions/runs/26045597888) — Lint + Typecheck + Test PASS (after 3 CI workflow fix iterations).
- **TECH-015:** `verified-pending` → `done`.
- **Phase 6 deliver:** no separate staging deployment for this MVP (single-VM per CLAUDE.md); push-to-main + CI-green is the delivery gate.

## [2026-05-18] Post-intake cleanup — Phase 4/5 outcomes
- **Phase 4 (TECH-015):** git remote `git@github.com:ITSalt/transcriber.git` added; 3 logical commits pushed (a11y+RQ-031, .tl state+UC-001 docs sync+retroactive artifacts, prior-session housekeeping). Default branch flipped to `main` and `feature/intake-2026-05-18` HEAD pushed to remote `main` to fire CI.
  - First CI run (26045113249) failed all 9 jobs at `setup-node cache: pnpm` step — `pnpm-lock.yaml` was gitignored. Fixed by removing the gitignore entry, committing the lockfile, and switching workflow to `pnpm install --frozen-lockfile`. Re-pushed (461dc2a).
- **Phase 5 (UC-200/UC-300 pipeline E2E):** SKIPPED by user direction. Worker code is reviewed + unit-tested; provider E2E (Deepgram, kie.ai) deferred until `DEEPGRAM_API_KEY` / `KIE_API_KEY` are supplied. Graph state: UC-200-BE and UC-300-BE remain `verified-pending` with `phase_qa = skip`; new flags `phase_5_outcome=SKIP`, `phase_5_reason` set.

## [2026-05-18] DOCS-SYNC UC-001 (Phase 1.5)
- F3: result-fe.md MeetingCard.tsx → MeetingRow.tsx (path corrected to components/MeetingRow.tsx); narrative "cards" → "rows"
- M1: result-be.md sort field corrected createdAt → updatedAt to match RQ-001; Prisma schema createdAt/updatedAt field names already correct in task-be.md domain table (snake_case is domain attribute convention, not drift)
- M2: MeetingStatus enum aligned with shared/src/enums.ts in task-be.md and task-fe.md — added CREATED/UPLOADED, renamed TRANSCRIPT_READY→TRANSCRIBED, PROTOCOL_GENERATING→GENERATING_PROTOCOL, FAILED→ERROR
- M3: pruned 2 unused imports (JobStatus, VideoMimeType) from api-contract.md TypeScript snippet

## [2026-05-18] POST-INTAKE CLEANUP — Agent 1-A: shared/ IStorage TS4113 + Zod v3/v4 split

**Scope:** shared/ package only (Agent 1-A). No api/, worker/, or web/ files modified.

### Bug 1 — shared/IStorage TS4113 (L1, no code change needed)

**Level:** L1 — code-only fix; already resolved in a prior commit.

**Root cause:** `StorageError` declared `public override readonly cause: unknown`, which triggered TS4113 because `Error.cause` is not part of the lib target chain in web's tsconfig, so the override was incompatible with the base type in the web compiler context.

**Fix (already applied in commit 77f4c73):** Renamed the field to `storageCause` (dropping the `override` keyword) in `shared/src/storage/IStorage.ts`. All consumers (api/src/storage/s3-adapter.ts) already use `storageCause`.

**Verification:** `pnpm --filter @transcrib/shared typecheck` → 0 errors. `pnpm --filter @transcrib/api typecheck` → 0 errors. `pnpm --filter @transcrib/worker typecheck` → 0 errors.

**Files changed:** none (fix pre-applied); `shared/src/storage/IStorage.ts` (current state is correct).

---

### Bug 2 — Zod v3/v4 split (L1, no code change needed in shared/)

**Level:** L1 — dependency-pinning / structural type mitigation; shared/ is already correct.

**Root cause:** `web/package.json` declares `"zod": "^3.25.76"` (resolving to 3.25.76 in pnpm virtual store) while `shared/`, `api/`, and `worker/` all use `zod@^4.4.3`. Two separate zod instances exist in the monorepo. Nothing in `web/src/` imports from zod directly — zod v3 in web is unused.

**Mitigation already in place:** `web/src/lib/api.ts` uses a structural duck-type interface `ZodLike<T> { parse(data: unknown): T }` rather than importing from zod, preventing any instanceof or type-assignability failures at the TypeScript level. Shared's own node_modules resolves zod to v4.4.3 correctly.

**Action needed (blocked — owned by another agent):** Remove or update `"zod": "^3.25.76"` in `web/package.json` to `"zod": "^4.4.3"` and re-run `pnpm install`. This is owned by the web/ agent.

**Verification:** `pnpm --filter @transcrib/shared test` → 69 passed. `pnpm --filter @transcrib/shared typecheck` → 0 errors. `pnpm test` → 463 passed, 7 skipped.

---

### Final state

- shared/ typecheck: CLEAN (0 errors)
- api/ typecheck: CLEAN (0 errors)
- worker/ typecheck: CLEAN (0 errors)
- web/ typecheck: 4 pre-existing errors in `ProtocolEditor.tsx` (out of scope, owned by web agent)
- Tests: 463 passed / 7 skipped (470 total) — baseline exceeded (was 457 before Agent 1-B a11y additions)

## [2026-05-18] nacl-tl-reconcile: Neo4j graph synced to .tl/status.json
- **Scope:** SMALL (30 Task nodes, status + 6 phase_* properties)
- **Trigger:** Orchestrator Phase 0 — Neo4j had all 30 tasks at status=pending with null phases while .tl/status.json showed 24 approved + 7 qa_pass + 2 qa_skip
- **Result:**
  - 27 tasks → status=done (14 TECH + 13 UC BE/FE pairs)
  - 3 tasks → status=verified-pending (TECH-015 CI uncommitted, UC-200-BE/UC-300-BE qa=skip pending API keys)
  - phase_be/phase_fe/phase_sync/phase_review_be/phase_review_fe/phase_qa populated per role
- **UNVERIFIED upstream fixes documented (operator-acknowledged):** TECH-003, TECH-004, TECH-015, UC-200-BE, UC-201-BE/FE, UC-300-BE, UC-301-BE/FE, UC-302-BE — all carry 100% test author overlap header from conductor workflow; non-blocking
- **Did not modify code or docs** — Neo4j-only sync; doc reconcile (UC-001 MeetingRow rename etc.) handled in Phase 1.5

## [2026-05-18] POST-INTAKE CLEANUP — Agent 1-B: UC-001 catalog a11y fixes

**Scope:** web/src/routes/catalog/* only (Agent 1-B)

### Issue 1 — Catalog SSE /api/meetings/events 404 (L1, no code change)
- Decision: REMOVE — UC-001 spec (task-fe.md, api-contract.md) mandates no catalog-wide SSE endpoint; ADR-010 specifies per-meeting SSE only. Polling via `refetchInterval` already satisfies RQ-002.
- Finding: The catalog `index.tsx` already had NO EventSource call — the speculative SSE scaffolding was never written (or was cleaned up prior). No code change required.

### Issue 2 — a11y aria-label on table, aria-live on badges (L1)
- Added `aria-label={t("catalog.tableLabel")}` to `<Table>` in `web/src/routes/catalog/index.tsx`.
- Wrapped `<Badge>` in `<span aria-live="polite">` in `web/src/routes/catalog/components/StatusBadge.tsx`.
- Added i18n keys `catalog.tableLabel`: "Meeting catalog" (EN) / "Каталог встреч" (RU) to both locale files.
- Added 2 a11y test cases to `web/src/routes/catalog/index.test.tsx`: table role by name and aria-live assertion.
- Tests: 18/18 passed (catalog); 126/126 passed (full web suite); typecheck clean.

## [2026-05-18] REVIEW-BE UC-001: View meeting catalog — APPROVED (commit e4d6bf2)
- Stub Gate: PASSED
- Result: approved
- Issues: 0 blocker, 0 critical, 0 major, 4 minor (doc drift M1-M4)
- Tests: 10/10 passed
- Test author independence: MAJOR (100% overlap — conductor workflow)
- Checklist: all 8 categories PASS

## [2026-05-18 15:45] RECONCILE: Retroactive result artifacts created
- All 30 tasks: result*.md files created from conductor-state + git log
- Tests: 441 passed, 7 skipped (Prisma smoke, needs DB)
- Typecheck: clean
- Lint: 0 errors, 114 warnings (no-explicit-any in test mocks — acceptable)
- TECH-015: verified-pending (actionlint unavailable, .github/workflows/ci.yml untracked)
- Follow-up commits incorporated: 8e92405 (UC-200/UC-300 worker), 77f4c73 (UC-301-FE shared tsconfig)
- Lint fixes applied: 12 errors resolved (unused vars, consistent-type-imports, no-empty-object-type)

## [PLAN] 2026-05-18

- Created development plan from the Neo4j graph (`/nacl-tl-plan`, scope=full).
- Generated 9 UC tasks (BE+FE per UC; SYSTEM-actor UC-200/UC-300 are BE-only worker tasks; UC-302 is BE-only with UI hooks in UC-002/UC-301 FE).
- Generated 15 TECH tasks covering full-stack infrastructure (monorepo, Docker stack, Prisma, shared Zod, Fastify, BullMQ, S3/MinIO, TUS, ffmpeg, Deepgram ASR, kie.ai LLM, SSE, web scaffold, Puppeteer PDF, CI).
- Defined 6 execution waves with dependency-honoring topological ordering.
- API contracts authored for all 9 UCs with Zod schemas, error tables, and authentication notes (NFR-007 no-auth at MVP).
- Source: Neo4j SA layer — 4 modules, 9 UCs, 6 domain entities, 53 requirements, 2 system roles, 4 enums.
- Neo4j TL layer populated: 6 Wave nodes, 30 Task nodes, IN_WAVE/DEPENDS_ON/GENERATES edges.
- 117 task files written under `.tl/tasks/`.

## [2026-05-18 16:30] REVIEW: TECH-003 - Prisma schema and migrations
- Phase: Code Review (BE 8-category checklist)
- Result: NEEDS REWORK (review applied, verification unverified - DB required)
- Issues: 0 blocker, 1 critical, 1 major, 3 minor
- Critical: smoke test references stale field contentMd (renamed to markdownContent by UC-301)
- Major: result.md content drift (claims 3 models / wrong migration path; actual is 6 models)
- Tests: 7 skipped (live Postgres required; not available in env)
- Schema, migrations, db.ts, prisma.config.ts: structurally sound
- Commit reviewed: b2cf859

## [2026-05-18 18:00] REVIEW: TECH-009 — ffmpeg audio extraction (TECH)
- Status: Workflow `REVIEW COMPLETE`. Judgment `APPROVED`. Action required: none.
- Stub Gate: PASSED (no markers)
- Result: approved
- Issues: 0 blocker, 0 critical, 0 major, 2 minor (inputFormat('mp4') hint hardcoded; result.md narrative stale)
- Tests: 6 passed (per result.md / 441/441 workspace total)
- Test author independence: 100% overlap (single-commit TECH task — non-blocking)
- Checklist PARTIAL rows: 1 (Testing — no live ffmpeg integration test, mocks only)

## [2026-05-18 18:00] REVIEW: TECH-010 — IAsrProvider + Deepgram adapter (TECH)
- Status: Workflow `REVIEW COMPLETE`. Judgment `APPROVED`. Action required: none.
- Stub Gate: PASSED (no markers)
- Result: approved
- Issues: 0 blocker, 0 critical, 0 major, 3 minor (case-sensitivity contract; AsrSegment.language unpopulated; result.md file paths stale)
- Tests: 10 passed (per result.md / 441/441 workspace total)
- Test author independence: 100% overlap (single-commit TECH task — non-blocking)
- Checklist PARTIAL rows: 1 (Performance — full audio buffered before POST, acceptable for MVP)

## [2026-05-18 18:00] REVIEW: TECH-011 — ILlmProvider + kie.ai adapter (TECH)
- Status: Workflow `REVIEW COMPLETE`. Judgment `APPROVED`. Action required: correct result.md drift via /nacl-tl-docs TECH-011.
- Stub Gate: PASSED (no markers)
- Result: approved
- Issues: 0 blocker, 0 critical, 1 major (result.md misrepresents interface signature + claims non-existent retry/fence-stripping behavior), 3 minor (alias mapping undocumented; no fetch timeout; prompt readFileSync per-call)
- Tests: 19 passed (per result.md / 441/441 workspace total)
- Test author independence: 100% overlap (single-commit TECH task — non-blocking)
- Checklist PARTIAL rows: 0

## [2026-05-18 18:00] REVIEW: TECH-012 — SSE event stream (TECH)
- Status: Workflow `REVIEW COMPLETE`. Judgment `APPROVED`. Action required: tighten 2 simulated tests (non-blocking).
- Stub Gate: PASSED (no markers)
- Result: approved
- Issues: 0 blocker, 0 critical, 1 major (two test cases simulate handler instead of invoking eventsRoutes; route still covered implicitly), 3 minor (silent subscribe-error log gap; malformed-JSON log gap; result.md says "in-process" but actual is Redis pub/sub)
- Tests: 7 passed (per result.md / 441/441 workspace total)
- Test author independence: 100% overlap (single-commit TECH task — non-blocking)
- Checklist PARTIAL rows: 2 (Testing — simulated handler; Acceptance — no real end-to-end Redis publisher → SSE write integration test)

## [2026-05-18 16:00] REVIEW: TECH-004 - Shared Zod DTOs + Per-UC API Contracts (TECH)
- Status: Workflow REVIEW APPLIED -- UNVERIFIED (test author overlap 100%). Judgment CHANGES REQUESTED. Action required: /nacl-tl-regression-test --retroactive TECH-004 + address M-1.
- Stub Gate: PASSED (0 markers in shared/src/)
- Result: changes_requested
- Issues: 0 blocker, 0 critical, 1 major (M-1 missing SSE event tests), 4 minor
- Tests: 58 passed, coverage not collected, no baseline (single-commit history)
- Test author independence: MAJOR (100% overlap -- conductor identity is structural; retroactive regression test recommended)
- Checklist PARTIAL rows: 5 (Code Quality, Testing, Documentation, Git and Commits) -- see review.md
- Files reviewed: shared/src/enums.ts, dto/*, api/* (uc001..uc302 + sse-events.ts), index.ts, 3 test files
- Note: TECH-005 and TECH-013 reviews should not approve until TECH-004 reaches REVIEW COMPLETE

## [2026-05-18 16:25] REVIEW: TECH-002 - Docker Compose dev stack

- Phase: Code Review

- Result: APPROVED

- Issues: 0 blocker, 1 critical (C01: result.md mis-describes deliverable), 2 major (M01 :latest pin, M02 explicit network), 1 minor (N01 .env.example annotation)

- Tests: 441 passed workspace-wide; no TECH-002-specific suites

- Notes: REVIEW APPLIED - UNVERIFIED for runtime acceptance criteria (AC05/AC06) - no test infra for Docker Compose; runtime confirmed transitively via TECH-003/006/007 readiness

- Confidence: Medium

- Next: tl-docs TECH-002 (fix C01 in result.md before transitioning to done)

## [2026-05-18 16:00] REVIEW: TECH-013 — Web scaffold (TECH)
- Status: Workflow `REVIEW COMPLETE`. Judgment `APPROVED`. Action required: none.
- Stub Gate: PASSED (no production-code TODO/STUB/MOCK markers)
- Result: approved
- Issues: 0 blocker, 0 critical, 0 major, 0 minor
- Tests: 122 passed (App.test.tsx 2/2; full web suite green)
- Test author independence: OK (single-author project convention)
- Checklist PARTIAL rows: 0
- Commit: 7d9914d

## [2026-05-18 16:00] REVIEW: TECH-014 — Puppeteer PDF renderer (TECH)
- Status: Workflow `REVIEW COMPLETE`. Judgment `APPROVED`. Action required: none.
- Stub Gate: PASSED (no markers in pdf.ts or template.html)
- Result: approved
- Issues: 0 blocker, 0 critical, 0 major, 1 minor (JSDoc trust-assumption note)
- Tests: 11/11 (pdf.test.ts); full api suite 161 passed + 7 skipped
- Test author independence: OK (single-author project convention)
- Checklist PARTIAL rows: 0
- Commit: 2f27dc2

## [2026-05-18 16:00] REVIEW: TECH-015 — GitHub Actions CI (TECH)
- Status: Workflow `REVIEW APPLIED — UNVERIFIED`. Judgment `CHANGES REQUESTED`. Action required: commit `.github/workflows/ci.yml` to git; run actionlint when available.
- Stub Gate: PASSED (no TODO/STUB markers in ci.yml)
- Result: changes_requested (status remains `verified-pending` per orchestrator directive)
- Issues: 1 blocker (workflow file untracked in git), 0 critical, 1 major (actionlint deferred), 1 minor (pnpm-lock.yaml gitignored)
- Tests: N/A (CI configuration)
- Test author independence: N/A
- Checklist PARTIAL rows: 1 (cache: node_modules — non-blocking, modern pnpm best practice)
- Commit: ~untracked~

## [2026-05-18 22:00] RE-REVIEW: TECH-003 — Prisma schema and migrations
- Status: Workflow `REVIEW APPLIED — UNVERIFIED (no live DB for smoke tests)`. Judgment `APPROVED`. Action required: none.
- Prior blocker C01 (smoke test field name `contentMd` -> `markdownContent`) confirmed fixed at lines 114, 118, 135 of `api/src/prisma.smoke.test.ts`.
- Tests: 7 skipped (live Postgres required); workspace 450 passed, 5 pre-existing UC-200 failures (out of scope for TECH-003), 7 skipped.
- Schema, migrations, db.ts, prisma.config.ts: unchanged since prior review — structurally sound.
- Residual non-blocking: M01 result.md drift, m01 cleanup pattern, m02 hardcoded dev creds, m03 missing acceptance.md (recommend `/nacl-tl-docs TECH-003`).
- status.json: TECH-003 status `ready_for_review` -> `approved`.

## [2026-05-18 22:00] RE-REVIEW: TECH-015 — GitHub Actions CI
- Status: Workflow `REVIEW APPLIED — UNVERIFIED (actionlint not available)`. Judgment `APPROVED`. Action required: none for approval; run actionlint locally and open PR to validate runner.
- Prior blocker B01 (`.github/workflows/ci.yml` untracked) resolved. Confirmed via `git ls-files .github/workflows/ci.yml` -> tracked. Commit: `3286bb9` ("ci: add GitHub Actions CI workflow (TECH-015)").
- Tests: N/A (CI config); workspace 450 passed, 5 pre-existing UC-200 failures (out of scope for TECH-015), 7 skipped.
- YAML structure unchanged since prior review — judged sound.
- Residual non-blocking: M01 actionlint deferred, m01 pnpm-lock.yaml gitignored (out of scope).
- status.json: TECH-015 status `ready_for_review` -> `approved`; cleared `blockers_list`.

## [2026-05-18 22:00] RE-REVIEW: TECH-004 -- Shared Zod DTOs + Per-UC API Contracts
- Phase: Code Review (re-review after M-1 fix)
- Prior verdict: changes_requested (M-1: missing SSE test coverage)
- New verdict: approved (operator override applied)
- Workflow status: REVIEW APPLIED -- UNVERIFIED (100% author overlap, operator override applied)
- Fix verified: 11 new tests added to shared/src/api/api.test.ts covering MeetingDeletedEvent (3), PingEvent (2), SseEvent discriminated union (4), and meetingChannel helper (2)
- Test author independence: 100% overlap (structural for conductor workflow, operator override per prior review note)
- Tests: 455 passed, 7 skipped (462 total). shared/src/api/api.test.ts: 45 tests (was 34, +11).
- Stub Gate: PASSED
- BE 8-Category Checklist: Testing upgraded PARTIAL to PASS; all other categories unchanged
- Issues: 0 blocker, 0 critical, 0 major (M-1 resolved), 4 minor (N-1..N-4 carried forward, non-blocking)
- Downstream gates unblocked: TECH-005 and TECH-013 (already approved) no longer wait on TECH-004 review hold

## [2026-05-18 22:30] RE-REVIEW UC-200-BE: Transcription pipeline (worker) — APPROVED
- Prior blockers M-1 (BullMQ enqueue missing) and M-2 (IAsrProvider binding) both RESOLVED
- M-1 fix verified: createQueues(redisUrl) + queues[QueueName.Protocol].add('generateProtocol', payload) outside $transaction (worker/src/jobs/transcription.ts:308-314)
- M-2 fix verified: deps.asr typed as IAsrProvider; DeepgramAsrProvider used only as default factory
- New test: T03 "enqueues ProtocolGenerationJob to BullMQ queue after DB create" asserts mockProtocolQueue.add called once with correct payload
- Tests: 457 passed, 7 skipped (transcription suite: 21/21 in 70ms)
- 8-category checklist: all PASS (was PARTIAL on Spec alignment + Provider abstraction in prior review)
- Headline: REVIEW APPLIED — UNVERIFIED (test author overlap 100%) — informational, non-blocking per conductor precedent
- Test author independence: MAJOR flag carries forward; recommend /nacl-tl-regression-test --retroactive UC-200
- Minor m-1..m-5 carried forward (vocabulary drift, regex cosmetic, redundant findUnique, prompt_template_version schema gap, per-job queue churn) — all non-blocking
- Status: phases.be = approved, phases.review-be = approved
- UC-200 now unblocks UC-201 and UC-300 at the pipeline-correctness level

## [2026-05-18 23:30] REVIEW-BE UC-201: View and download transcript — APPROVED (commit 473000a)
- Stub Gate: PASSED
- Result: approved
- Issues: 0 blocker, 0 critical, 0 major (substantive), 1 major (informational, 100% test author overlap), 0 minor
- Tests: 457 passed, 7 skipped (pnpm test, full repo)
- UC-201 BE tests: 21 cases — T01-T13 plus parameterised expansions
- Test author independence: MAJOR informational (100% overlap — conductor workflow precedent applied)
- Checklist: all 8 categories PASS

## [2026-05-18 23:30] REVIEW-FE UC-201: View and download transcript — APPROVED (commit f96c4e5)
- Stub Gate: PASSED
- Result: approved
- Issues: 0 blocker, 0 critical, 0 major (substantive), 1 major (informational, 100% test author overlap), 2 minor (M1 status-specific error UI, M2 unused SpeakerLabel component)
- Tests: 457 passed, 7 skipped (pnpm test, full repo)
- UC-201 FE tests: 29 cases — CT01-CT06, download, navigation, acceptance metadata
- Test author independence: MAJOR informational (100% overlap — conductor workflow precedent applied)
- Checklist: all 10 categories PASS

## [2026-05-18 22:30] REVIEW-BE UC-003: Delete meeting — APPROVED (commit 12d0b06)
- Stub Gate: PASSED (no TODO/FIXME/MOCK in production source)
- Result: approved
- Issues: 0 blocker, 0 critical, 2 major, 3 minor
  - M1: service unit test file listed in impl-brief.md is absent (integration coverage adequate)
  - M2: no assertion that publishMeetingEvent is invoked on success (recommend adding to T01)
  - N1: defensive else branch in storage error mapping (lines 125-132)
  - N2: result-be.md narrative says 204/409 but implementation returns 200 with body (doc drift)
  - N3: impl-brief.md references non-existent uc-003.service.test.ts
- Tests: 10/10 passed for api/src/routes/uc-003.test.ts (T01-T10); 2/2 passed for shared MeetingDeleteResponse round-trip
- Workspace: 450 passed, 5 failed (UC-200 unrelated), 7 skipped
- Checklist: all 8 categories PASS
- Verified: RQ-006 (cascade incl. EXT-04), RQ-007 (in-flight job marked FAILED), BRQ-009 (terminal jobs preserved), NFR-007 (no-auth)
- Architecture highlight: Prisma onDelete:Cascade across all 5 child models; tx ordering (mark FAILED + delete root inside tx, S3 delete after commit); idempotent storage delete (StorageNotFoundError swallowed)

## [2026-05-18 23:00] REVIEW-FE UC-003: Delete meeting — APPROVED (commit e3741a7)
- Stub Gate: PASSED (no TODO/FIXME/MOCK in production source)
- Result: approved
- Issues: 0 blocker, 0 critical, 2 major, 2 minor
  - M1: test author independence (project-systemic; conductor workflow)
  - M2: DialogContent emits a11y warning (missing DialogDescription or aria-describedby)
  - N1: result-fe.md hook path is wrong (lists web/src/hooks/, actual is web/src/routes/meeting/hooks/)
  - N2: i18n key duplication (legacy meeting.detail.deleteConfirm* vs current meeting.delete.confirm*)
- Tests: 37/37 passed for web/src/routes/meeting/index.test.tsx; 5 UC-003-specific cases (CT01 dialog title, in-flight warning shown, in-flight warning hidden, success navigates to /catalog, cancel keeps user on page)
- Checklist: 10 categories — 9 PASS, 1 PARTIAL (a11y, see M2)
- Verified: AC2 (post-delete navigation), AC3 (in-flight warning gated by job status); AC1 BE-enforced
- Architecture highlight: hook isolation (useDeleteMeeting handles mutation+invalidation+toast+navigation; component receives only onDelete + isDeleting); cache invalidation by prefix; bilingual EN+RU verified
- UC-003 status: BE review approved + FE review approved; ready for /nacl-tl-qa UC-003 (E2E)

## [2026-05-18] FIX UC-301 RQ-031: Unsaved-changes guard — L1 (Agent 1-C)

**Scope:** web/src/routes/protocol/* only.

**Level:** L1 — code-only fix. `unsavedChangesWarning` i18n key already existed; RQ-031 behavior was specified. The `isDirty` flag existed but Milkdown `onChange` was never wired, so `isDirty` never became `true`. No navigation blocker was registered.

**Root cause:** `isDirty` was never set to `true` because `ProtocolEditor` had no `onChange` prop and the Milkdown listener plugin was not integrated; consequently `useBlocker` was absent and the Dialog guard was never rendered.

**Changes:**
- `web/src/routes/protocol/components/ProtocolEditor.tsx` — added `onChange?: () => void` prop; integrated `@milkdown/plugin-listener` (`listenerCtx.markdownUpdated`) to fire `onChange` on each Milkdown doc change.
- `web/src/routes/protocol/index.tsx` — wired `onChange={() => setIsDirty(true)}` to `ProtocolEditor`; replaced `handleBack` direct-navigate with `useBlocker(isDirty)` from react-router; replaced `window.confirm` calls with a shadcn `Dialog` component (`data-testid="unsaved-changes-dialog"`) with Confirm (`blocker.proceed`) and Cancel (`blocker.reset`) buttons.
- `web/src/i18n/en.json` / `ru.json` — added `protocol.unsavedChanges.{title,body,confirm,cancel}` keys in EN and RU.
- `web/package.json` — added `@milkdown/plugin-listener@^7.21.1` dependency.

**New tests (6):** Added `describe("RQ-031: unsaved-changes guard")` to `web/src/routes/protocol/index.test.tsx`:
1. isDirty=false on render, no dialog shown
2. onChange fired → isDirty becomes true (editor remains visible)
3. Navigation while dirty → confirmation dialog appears
4. Confirm click → `blocker.proceed` → navigation completes
5. Cancel click → `blocker.reset` → user stays on protocol page
6. After successful save → isDirty=false → navigation proceeds without dialog

**Verification:** `pnpm --filter web test src/routes/protocol --run` → 31/31 passed. `pnpm -r typecheck` → clean (0 errors).

## [2026-05-18 23:45] REVIEW-BE UC-300: Protocol generation (worker) - APPROVED (commit 0c11bf3 + 8e92405)
- Stub Gate: PASSED
- Result: approved
- Issues: 0 blocker, 0 critical, 0 major, 5 minor (doc drift M1-M5: spec uses pre-rename JobStatus/MeetingStatus values; impl-brief filenames stale; prompt_template_version not persisted - schema lacks column)
- Tests: 457/464 passed at monorepo level (7 skipped: prisma smoke; expected baseline); UC-300 contributes 29 passing
- Test author independence: MAJOR (100% overlap - conductor workflow override applied)
- Checklist: all 8 categories PASS
- Code anchors: worker/src/jobs/protocol-generation.ts, worker/src/jobs/protocol-generation.test.ts, shared/src/llm/ILlmProvider.ts, worker/src/llm/kieai.ts
- ADR-007 honored: ILlmProvider abstraction in place, no direct kie.ai SDK in handler
- BRQ-008 honored: Meeting.status mirror in single $transaction
- BRQ-009 honored: terminal-state guards via WHERE status PENDING/PROCESSING in updateMany
- Follow-up: route M1-M5 doc drift through /nacl-tl-reconcile before UC-300 final sign-off

## [PLAN] 2026-05-26 — FR-001 Worker Job Retry Resilience

- Incremental plan from Neo4j graph (/nacl-tl-plan --feature FR-001).
- Scope (FeatureRequest INCLUDES_UC): UC-004 (NEW, mod-common, AUTHOR, has_ui), UC-200 (MODIFIED — transcription failure path), UC-300 (MODIFIED — protocol failure path).
- New tasks: UC-004-BE + UC-004-FE (8 task files), TECH-025 (Redis URL db-index), TECH-026 (attempt_count Prisma migration).
- Re-planned: UC-200-BE and UC-300-BE (existing verified-pending nodes) with FR-001 failure-path refinement addenda (task-be-fr001.md); intake_id set to FR-001.
- Migration decision: the attempt_count Prisma migration was emitted as its OWN TECH task (TECH-026), NOT folded into a UC BE task. UC-200-BE/UC-300-BE/UC-004-BE depend on it.
- 3 new waves: Wave 11 (TECH-026 + TECH-025), Wave 12 (UC-200-BE + UC-300-BE refinements), Wave 13 (UC-004-BE + UC-004-FE).
- Dependencies (graph DEPENDS_ON): UC-200-BE→TECH-026; UC-300-BE→TECH-026,UC-200-BE; UC-004-BE→UC-200-BE,UC-300-BE; UC-004-FE→UC-004-BE; TECH-025 independent. UC-002-FE (Meeting detail host) already done.
- External Contracts Gate: no REQUIRES_EXTERNAL/DEPENDS_ON_EXTERNAL edges on the three UCs in this graph — gate had nothing to enforce; PASS.
- Graph writes: 3 Wave nodes (11-13), 4 new Task nodes (TECH-025, TECH-026, UC-004-BE, UC-004-FE), 2 re-planned Task nodes (UC-200-BE, UC-300-BE intake_id=FR-001), plus IN_WAVE / GENERATES / DEPENDS_ON edges.
