/**
 * FR-003 — request auth context (WP-BACKEND-01).
 *
 * Every request under /api/* gets `request.auth` from the auth plugin (routes.ts):
 *   kind 'user'   — a valid session cookie; workspaceIds = the user's memberships;
 *   kind 'legacy' — no session while AUTH_REQUIRED=false (D-20): the pre-login web,
 *                   restricted to the legacy workspace «Роман»;
 *   null          — only on public routes (health, login, logout) without a session.
 * Meeting-/project-scoped routes additionally get `request.meetingAccess` /
 * `request.projectAccess`, set by the access check that runs before the handler.
 */
import { LEGACY_WORKSPACE_ID, LEGACY_WORKSPACE_NAME } from '@transcrib/shared'

export interface AuthContext {
  kind: 'user' | 'legacy'
  /** null for the legacy principal (no users row behind it) */
  userId: string | null
  userName: string
  workspaceIds: string[]
  /** AuthSession.id of the request's session; null for legacy */
  sessionId: string | null
}

export interface MeetingAccess {
  meetingId: string
  workspaceId: string
  projectId: string | null
}

export interface ProjectAccess {
  projectId: string
  workspaceId: string
}

declare module 'fastify' {
  interface FastifyRequest {
    auth: AuthContext | null
    meetingAccess: MeetingAccess | null
    projectAccess: ProjectAccess | null
  }
}

/** D-20: stable id of the synthetic «Роман» shown by GET /api/auth/me without a session. */
export const LEGACY_USER_ID = '00000000-0000-4000-8000-000000000002'

export const LEGACY_AUTH: Readonly<AuthContext> = Object.freeze({
  kind: 'legacy',
  userId: null,
  userName: LEGACY_WORKSPACE_NAME,
  workspaceIds: [LEGACY_WORKSPACE_ID],
  sessionId: null,
})
