---
task: TECH-015
type: tech
review_mode: tech
reviewed: 2026-05-18
review_updated: 2026-05-18
reviewer: nacl-tl-review (strategist)
commit: 3286bb9
result: approved
re_review: true
---

# Review: TECH-015 — GitHub Actions CI

# REVIEW APPLIED -- UNVERIFIED (actionlint not available in this environment)

## Verdict

APPROVED. The single Blocker from the prior review (B01 -- `.github/workflows/ci.yml` untracked in git) has been resolved. The file is now tracked under commit `3286bb9` ("ci: add GitHub Actions CI workflow (TECH-015)"). YAML structure was judged sound by the prior review and has not been altered. End-to-end CI runner validation remains UNVERIFIED in this environment (actionlint absent; no GitHub runner access from local dev) -- recoverable on the next PR push.

## Re-review Scope

This re-review covers ONLY the previously flagged Blocker. Workflow content (job structure, matrix, service containers, pinning, healthchecks) was judged PASS in the prior review and has not been re-litigated.

## Fix Confirmation -- Issue B01 (Blocker)

- File: `C:\projects\transcrib\.github\workflows\ci.yml`
- Prior defect: file existed on disk but was untracked in git; `git ls-files .github/workflows/ci.yml` returned empty.
- Re-review evidence:
  - Command: `git ls-files .github/workflows/ci.yml`
  - Output: `.github/workflows/ci.yml` (tracked)
  - Commit: `3286bb9` -- "ci: add GitHub Actions CI workflow (TECH-015)"
- Workflow is now visible to GitHub Actions; PR-trigger acceptance is now reachable.

## Test Verification

- `pnpm test` from `C:\projects\transcrib` executed.
- Workspace result: 450 passed, 5 failed, 7 skipped (462 total).
- Note: the prior review's projection of "455 passed, 7 skipped" did not account for 5 pre-existing UC-200 failures in `worker/src/jobs/transcription.test.ts` (TranscriptionJob -> ProtocolGenerationJob auto-create logic). These failures are already tracked in `status.json` (`UC-200.review-be = changes_requested`) and are OUT OF SCOPE for TECH-015.
- No TECH-015-owned test exists (CI workflow is config; not a test target).

## Acceptance Criteria -- Final Status

| Criterion (task.md) | Status | Evidence |
|---|---|---|
| `.github/workflows/ci.yml` with matrix per package | PASS | typecheck/test jobs matrix [shared, api, worker, web] |
| Cache pnpm store + node_modules | PARTIAL | pnpm store cached via setup-node; node_modules not separately cached (modern best practice with pnpm CAS) |
| Postgres + Redis service containers | PASS | `postgres:16-alpine`, `redis:7-alpine` with healthchecks |
| Job names mapped to required checks | PASS | Explicit display names: Lint, Typecheck — package, Test — package |
| PR opened triggers ci.yml | REACHABLE | File now tracked (commit 3286bb9). Will trigger on next PR push. |
| All jobs complete green on initial commit | UNVERIFIED | No GitHub runner in this environment. Will be validated on first PR. |

## Residual Items (non-blocking)

- M01 (Major, prior) -- actionlint not run (not available in this environment). Recommend running it locally or as a CI step in a follow-up. Manual inspection caught no obvious issues.
- m01 (Minor, prior) -- `pnpm-lock.yaml` gitignored; `--frozen-lockfile` cannot be used. Project-wide concern, out of TECH-015 scope.

## Decision

APPROVED. Blocker resolved -- workflow file is tracked in git under commit `3286bb9`. YAML structure was judged sound by the prior review. End-to-end runner validation is naturally deferred to the next PR push; this is the standard CI bootstrap pattern and does not block approval.

## Next Steps

1. Open a PR (any branch) to exercise the workflow end-to-end on a real GitHub runner.
2. Run `actionlint` once available (locally or as a CI step) and address any findings.
3. Track residual lockfile policy decision (m01) as a separate hygiene task.
