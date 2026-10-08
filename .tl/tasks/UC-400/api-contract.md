# API contract — UC-400..UC-403 (FR-003, WP-BACKEND-01)

Wire types: `shared/src/api/auth.ts`, `shared/src/api/workspace.ts`, `shared/src/api/errors.ts`
(contract v1, WP-BACKEND-06). Error body: `{code, message, details?}`, `message` = Russian UI text.

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/auth/login` | public | `{pin}` → 200 `MeResponse` + `Set-Cookie: transcrib_session` (HttpOnly; Secure; SameSite=Lax; Path=/; 30 days) |
| POST | `/api/auth/logout` | public | 204, session deleted, cookie cleared (idempotent) |
| GET | `/api/auth/me` | session / legacy | 200 `MeResponse {user {id,name}, workspaces [{id,name,personal}]}` (personal first) |
| GET | `/api/meetings?workspace_id=&project_id=` | session + membership | 200 `WorkspaceMeetingListResponse` |
| POST | `/api/uploads/init` · `/complete` · `/abort` | session + membership | `workspace_id`; keys `ws/<workspaceId>/…`; `complete.defer_start` |

Errors: `400 PIN_FORMAT` «PIN — это 6 цифр» · `401 INVALID_PIN` «Неверный PIN» · `401 UNAUTHENTICATED`
«Нужно войти» · `423 LOGIN_BLOCKED` «Больше нельзя, пиши Максу для разблокировки» (10th failure from a
client, also for the right PIN, until `user:unblock`) · `404 NOT_FOUND` «Не найдено» (foreign = nonexistent) ·
`400 WORKSPACE_REQUIRED` (signed-in user without `workspace_id`) · `503 AUTH_NOT_CONFIGURED` (no `PIN_PEPPER`;
api-only code).

Modes (D-20): `AUTH_REQUIRED=true` — no session → 401 on every `/api/*` route except `GET /api/health`,
`POST /api/auth/login|logout`. `false` (default) — no session → legacy principal: workspace «Роман» only;
`/me` → `{user: {id: 00000000-0000-4000-8000-000000000002, name: «Роман»}, workspaces: [«Роман»]}`.

Access gate: every route under `/api/meetings/:id…` and `/api/projects/:projectId…` checks membership
before validation and the handler (`request.meetingAccess` / `request.projectAccess`); a malformed id → 400.
A route under those prefixes with another parameter name is refused at startup.

CLI (UC-403): `user:create | user:grant | user:reset-pin | user:blocks | user:unblock` — `api/README.md`.
