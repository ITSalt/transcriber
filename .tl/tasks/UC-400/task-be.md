---
id: UC-400-BE
title: FR-003 backend — PIN login/logout/me, lockout, sessions, CLI, workspace isolation of every route, core hooks, NOT NULL migration
type: uc
wave: 15
priority: high
intake_id: FR-003
work_package: WP-BACKEND-01
covers: [UC-400, UC-401, UC-402, UC-403, UC-001, UC-002, UC-003, UC-004, UC-100, UC-201, UC-301, UC-302]
depends_on: ['TECH-027']
---

# UC-400-BE — Login by PIN, workspaces, isolation (WP-BACKEND-01)

> Source: Neo4j graph — FR-003, UC-400..UC-403 (ActivityStep UC-40x-ASnn), RQ-040..RQ-045,
> RQ-058 (D-20), NFR-011; program decisions D-6, D-7, D-8, D-20, A-1, A-3, A-5.

## What to do

1. `api/src/features/auth/` (auto-registered): login/logout/me; scrypt PIN hash + HMAC lookup
   (`PIN_PEPPER`); 30-day session cookie, DB keeps the token hash; per-client lockout
   (10 failures → 423, CLI-only unblock; X-Forwarded-For trusted only from 127.0.0.1, last
   entry); global failure warning; root `onRequest` (401 / legacy principal per
   `AUTH_REQUIRED`) and `preValidation` access check for `/api/meetings/:id…` and
   `/api/projects/:projectId…` (foreign = nonexistent = 404); helpers in `access.ts`; CLI.
2. Core: list by `workspace_id`; uploads into a workspace (`ws/<id>/…` keys, presign after
   the check); finalize with `workspaceId`, `deferStart` (AWAITING_START, nothing enqueued),
   `speakerCount` on the job (A-5); PUT protocol appends `ProtocolVersion USER_EDIT` (with a
   v1 / LEGACY record of the replaced text when missing); delete of a project meeting writes
   `GraphOutbox DELETE_MEETING` in the same transaction.
3. Migration `20261008120000_meeting_workspace_not_null` (+ `down.sql`): re-backfill «Роман»,
   drop the temporary default, NOT NULL; `transcription_jobs.speaker_count`; ProtocolVersion
   reconciliation (FR-005, two steps, idempotent).
4. `.worktreeinclude` (D-1); `PIN_PEPPER`, `AUTH_REQUIRED` in `.env.example`; `api/README.md`;
   `.tl/deploy-plan.md` §5 rows + §10 switch-on order.

## Acceptance (WP-BACKEND-01 §3)

- [ ] AC-1 isolation over every route Fastify registered (401 without session; B → A 404 on
      every method incl. SSE, PDF, download).
- [ ] AC-2 login: right PIN → cookie + /me; wrong → 401; 10th failure → 423 exact text, then
      even right PIN → 423 until unblock; not 6 digits → 400; PIN unique; no clear PIN in DB.
- [ ] AC-3 hooks: deferStart → AWAITING_START, no job enqueued; PUT protocol → ProtocolVersion;
      delete of a project meeting → GraphOutbox.
- [ ] AC-4 NOT NULL migration on a DB with a meeting without workspace; `user:create --name
      Роман --workspace Роман` sees all old meetings.
- [ ] AC-5 `pnpm -r typecheck`, `pnpm test` green.
