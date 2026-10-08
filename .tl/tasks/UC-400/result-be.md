# UC-400-BE — result (WP-BACKEND-01)

**Status:** approved (`/nacl-tl-review --be`, 2 passes + follow-ups).

## Delivered
- `api/src/features/auth/{routes,access,crypto,lockout,cli,types}.ts` — login/logout/me, sessions,
  race-free cumulative per-client lockout (A-3, A-6), root gate by route pattern (D-20
  `AUTH_REQUIRED`), membership check for every `/api/meetings/:id…` and `/api/projects/:projectId…`
  route, startup guard on parameter names, operator CLI (stdin PIN supported).
- Core: workspace list, workspace uploads (`ws/<id>/…`), `defer_start`, `speakerCount` on the job
  (A-5), `ProtocolVersion USER_EDIT` with a locked re-read, `GraphOutbox` on project-meeting delete.
- Migration `20261008120000_meeting_workspace_not_null` + `down.sql`.
- Docs: `api/README.md`, `.env.example`, `.worktreeinclude`, `.tl/deploy-plan.md` §5/§10,
  `tasks/*/api-contract.md` synced, `tasks/UC-400/api-contract.md`, S3 contract note.

## Evidence
- api 262/262 (23 files) on a database migrated from scratch, shared 121/121, worker 249/249,
  web 155/156 (`RQ-008` fails identically on `origin/main`); typecheck green; lint 0 errors.
- Mutations caught: access hook disabled (AC-1 red, fails fast instead of hanging), partial
  migration slice (guard asserts), down.sql enum / `_prisma_migrations` (WP-06 file).

## Review
| Pass | Verdict | Items |
|---|---|---|
| 1 | CHANGES_REQUESTED | B1 parallel lockout bypass; M1 `/%61pi` gate bypass; M2 reset on success; M3 empty partial-migration test; M4 weak AC-1 rest bucket; M5 stale LEGACY on concurrent saves; 9 minor; nits — all fixed |
| 2 | APPROVED | follow-ups applied: give the reservation back on infrastructure errors; over-limit attempts refused without storing a block (only the 10th actual failure blocks); `user:unblock` normalises IPv6; exact `:id` match in project routes |

Known pre-existing defect outside the package: BUG-1 (`api/src/lib/pdf.ts` SSRF) — separate package.
