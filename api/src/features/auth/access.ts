/**
 * FR-003 / RQ-044 — workspace isolation helpers for every package (api-projects,
 * api-feedback, api-memory use them too).
 *
 * Rule: someone else's resource and a nonexistent one answer the SAME 404 NOT_FOUND, so a
 * response never reveals that an id exists.
 *
 * The auth plugin already checks every route whose URL pattern starts with
 * `/api/meetings/:id` or `/api/projects/:projectId` before validation and the handler
 * (request.meetingAccess / request.projectAccess). Call these helpers for ids that arrive in
 * a body or query, or outside those URL shapes.
 */
import type { FastifyRequest } from 'fastify'
import { LEGACY_WORKSPACE_ID, PROGRAM_ERRORS, PROGRAM_ERROR_MESSAGES } from '@transcrib/shared'
import { prisma } from '../../db.js'
import { AppError } from '../../plugins/errors.js'
import type { AuthContext, MeetingAccess, ProjectAccess } from './types.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function notFound(): AppError {
  return new AppError('NOT_FOUND', PROGRAM_ERRORS.NOT_FOUND, PROGRAM_ERROR_MESSAGES.NOT_FOUND)
}

export function requireAuth(request: FastifyRequest): AuthContext {
  if (!request.auth) {
    throw new AppError('UNAUTHENTICATED', PROGRAM_ERRORS.UNAUTHENTICATED, PROGRAM_ERROR_MESSAGES.UNAUTHENTICATED)
  }
  return request.auth
}

export async function assertMeetingAccess(request: FastifyRequest, meetingId: string): Promise<MeetingAccess> {
  const auth = requireAuth(request)
  if (!UUID.test(meetingId)) throw notFound()
  const meeting = await prisma.meeting.findFirst({
    where: { id: meetingId, workspaceId: { in: auth.workspaceIds } },
    select: { id: true, workspaceId: true, projectId: true },
  })
  if (!meeting) throw notFound()
  return { meetingId: meeting.id, workspaceId: meeting.workspaceId, projectId: meeting.projectId }
}

export async function assertProjectAccess(request: FastifyRequest, projectId: string): Promise<ProjectAccess> {
  const auth = requireAuth(request)
  if (!UUID.test(projectId)) throw notFound()
  const project = await prisma.project.findFirst({
    where: { id: projectId, workspaceId: { in: auth.workspaceIds } },
    select: { id: true, workspaceId: true },
  })
  if (!project) throw notFound()
  return { projectId: project.id, workspaceId: project.workspaceId }
}

/** Membership is in the request's auth context — no DB round-trip. */
export function assertWorkspaceAccess(request: FastifyRequest, workspaceId: string): string {
  const auth = requireAuth(request)
  if (!auth.workspaceIds.includes(workspaceId)) throw notFound()
  return workspaceId
}

/**
 * The workspace a list/upload request targets: the explicit `workspace_id` (membership
 * checked), else — for the legacy principal only — «Роман»; a signed-in user must name it
 * (400 WORKSPACE_REQUIRED).
 */
export function resolveWorkspace(request: FastifyRequest, workspaceId: string | undefined | null): string {
  const auth = requireAuth(request)
  if (workspaceId) return assertWorkspaceAccess(request, workspaceId)
  if (auth.kind === 'legacy') return LEGACY_WORKSPACE_ID
  throw new AppError('WORKSPACE_REQUIRED', PROGRAM_ERRORS.WORKSPACE_REQUIRED, PROGRAM_ERROR_MESSAGES.WORKSPACE_REQUIRED)
}
