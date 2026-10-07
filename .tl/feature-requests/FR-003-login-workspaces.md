# Feature Request: FR-003 — Login by PIN and workspaces

## Metadata

| Field | Value |
|-------|-------|
| Created | 2026-10-07 |
| Status | spec-complete |
| Source | `/nacl-sa-feature` — program «Модернизация Transcrib до продукта», WP-BACKEND-06 (contract v1) |
| Impact method | Neo4j graph traversal (sa_impact_analysis) + program decisions |
| Decision | `DEC-006` (program: D-3, D-6, D-7, D-8, A-1, A-3, D-15) |
| Implemented by | WP-BACKEND-06 (schema, contracts) → WP-BACKEND-01 (auth logic, CLI, isolation), WP-FRONTEND-02 (login, workspace switcher) |

## Feature Description

PIN-only login with server sessions; workspaces become the isolation unit (personal +
shared via membership); every pre-program meeting moves to the personal workspace
«Роман»; an operator manages users and lockouts through an API CLI.

## Impact Summary

| Area | Change | Details |
|------|--------|---------|
| Architecture | NEW MODULE | `mod-access` (UC 400–499) |
| Domain | +5 entities, ~1 modified | User, Workspace, Membership, AuthSession, LoginBlock; Meeting +workspace_id |
| Use Cases | +4 NEW | UC-400, UC-401, UC-402, UC-403 |
| Use Cases | ~8 MODIFIED | UC-001, UC-002, UC-003, UC-004, UC-100, UC-201, UC-301, UC-302 (identical 404 isolation; UC-001 list by workspace; UC-100 workspace_id) |
| Roles | +1 role, +4 permissions; AUTHOR redefined as workspace member | SR-03 OPERATOR |
| Requirements | RQ-040..RQ-045, NFR-011 (supersedes NFR-007), RQ-003 revised | |
| UI | forms pending detail | login form, user menu, workspace switcher (WP-FRONTEND-02 via `/nacl-sa-ui`) |

## Contract v1 (code)

- Prisma: `User`, `Workspace`, `Membership`, `AuthSession`, `LoginBlock`; `Meeting.workspaceId`
  nullable with DB default `00000000-0000-4000-8000-000000000001` (workspace «Роман»).
- `shared/src/api/auth.ts` (`LoginRequest`, `MeResponse`, `SESSION_COOKIE_NAME`, limits),
  `shared/src/api/workspace.ts` (`LEGACY_WORKSPACE_ID`, `WorkspaceMeetingListQuery/Response`),
  `shared/src/api/errors.ts` (codes + Russian texts incl. LOGIN_BLOCKED),
  `shared/src/api/uc100.ts` (`workspace_id` on init/complete/abort).
- Dependency: `@fastify/cookie` (api).

## New UCs to Plan

- UC-400: Войти по PIN — `POST /api/auth/login`, lockout after 10 failures (423).
- UC-401: Выйти — `POST /api/auth/logout`.
- UC-402: Работать в выбранном пространстве — `GET /api/auth/me`, `GET /api/meetings?workspace_id=`.
- UC-403: Администрировать пользователей и блокировки (CLI) — `user:create|grant|reset-pin|unblock|blocks`.

## Modified UCs to Re-plan

- UC-001..UC-004, UC-201, UC-301, UC-302: membership check, identical 404 (`program_delta` on the node).
- UC-100: `workspace_id`, presign after access check, `ws/<workspaceId>/…` keys.

## Dependencies

- WP-BACKEND-01 depends on this contract; it drops the `workspace_id` default and sets NOT
  NULL in its own migration (re-running the idempotent backfill first).

## Decisions

- DEC-006: workspace isolation, PIN login with per-client lockout, fixed-id legacy workspace.

## Stale (to re-plan)

- 17 Tasks of the modified UCs (all four FRs together) stamped `review_status='stale'`
  (`stale_origin='FR-003..FR-006'`) → `/nacl-tl-plan --feature FR-003` when the consumer
  package plans.

## Skills Invoked

- `nacl-sa-feature` (domain, roles, UC registry and requirements written directly per its
  manual fallbacks).
