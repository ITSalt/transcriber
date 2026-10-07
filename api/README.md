# @transcrib/api

Fastify 5 API of Transcrib. Feature folders under `src/features/<name>/routes.ts` are
registered automatically (`src/features/index.ts`).

## Login by PIN and workspaces (FR-003, WP-BACKEND-01)

- `POST /api/auth/login {pin}` → session cookie `transcrib_session` (httpOnly, Secure,
  SameSite=Lax, 30 days); `POST /api/auth/logout`; `GET /api/auth/me` → `{user, workspaces}`.
  Contracts: `shared/src/api/auth.ts`, `shared/src/api/workspace.ts`.
- Every `/api/*` route except `GET /api/health` and `POST /api/auth/login|logout` needs a
  session **when `AUTH_REQUIRED=true`**. With the default `AUTH_REQUIRED=false` (D-20) a
  request without a session is served as before the program, restricted to the legacy
  workspace «Роман»; `GET /api/auth/me` then returns a synthetic «Роман».
- Every route under `/api/meetings/:id…` and `/api/projects/:projectId…` checks membership
  before validation and the handler: someone else's and a nonexistent id answer the same
  `404 NOT_FOUND`. Helpers for other packages: `src/features/auth/access.ts`
  (`assertMeetingAccess`, `assertProjectAccess`, `assertWorkspaceAccess`, `resolveWorkspace`);
  the check's result is on `request.meetingAccess` / `request.projectAccess`.
- Lockout: 10 failed PINs from one client IP → `423` «Больше нельзя, пиши Максу для
  разблокировки», also for the right PIN, until `user:unblock`. The client IP comes from the
  last `X-Forwarded-For` entry only when the TCP peer is the local proxy (127.0.0.1).

### Environment (`api/.env`)

| Variable | Meaning |
|---|---|
| `PIN_PEPPER` | HMAC key of the PIN lookup, ≥ 16 random chars (`openssl rand -hex 32`). Changing it invalidates every PIN. Unset: login → 503 `AUTH_NOT_CONFIGURED`, CLI refuses. |
| `AUTH_REQUIRED` | `true` / `false` (default). Anything else is a startup error. |

### Operator CLI

The PIN is never stored (only HMAC lookup + scrypt hash) and never printed. The CLI runs
from the build (`pnpm --filter @transcrib/api run build` first in a dev checkout) and needs
`DATABASE_URL` and `PIN_PEPPER`.

```bash
# user + personal workspace named after them
pnpm --filter @transcrib/api run user:create -- --name "Иван" --pin 123456
# user attached to an existing workspace (name or id) — e.g. the legacy «Роман»
pnpm --filter @transcrib/api run user:create -- --name "Роман" --pin 654321 --workspace "Роман"
pnpm --filter @transcrib/api run user:grant -- --user "Иван" --workspace "Роман"
pnpm --filter @transcrib/api run user:reset-pin -- --user "Иван" --pin 112233   # ends their sessions
pnpm --filter @transcrib/api run user:blocks                                    # failed logins / blocks
pnpm --filter @transcrib/api run user:unblock -- --client 203.0.113.7           # or --all
```

Exit codes: 0 done, 1 refused (PIN taken, not found, ambiguous name), 2 usage error.
PINs are unique: `user:create` / `user:reset-pin` refuse a PIN another user has.

### Switching login on in production (owner)

1. Set `PIN_PEPPER` in `/opt/transcrib/api/.env`.
2. `user:create -- --name "Роман" --pin … --workspace "Роман"` (sees every pre-program
   meeting) and the other users.
3. Set `AUTH_REQUIRED=true` in the same `.env`, then `pm2 restart transcrib-api`.
   Rollback: `AUTH_REQUIRED=false` + restart.
