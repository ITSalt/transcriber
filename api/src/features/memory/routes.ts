/**
 * FR-006 — project memory registry (WP-API-MEMORY-01; contract: shared/src/api/memory.ts).
 *
 * Isolation: `/api/projects/:projectId/…` and `/api/meetings/:id/…` are checked by the auth
 * plugin before validation (foreign = nonexistent = 404) and give request.projectAccess /
 * meetingAccess — the workspaceId of every graph query comes from there, never from the
 * client. `/api/task-events/:eventId/…` is outside those prefixes: the event is looked up by
 * id AND the caller's workspaces (findTaskEventScope), foreign = nonexistent = 404.
 * Neo4j off or down → 503 MEMORY_UNAVAILABLE on these routes only.
 */
import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from '@fastify/type-provider-zod'
import { z } from 'zod'
import {
  DecisionListResponse,
  MeetingMemoryRefsResponse,
  ProjectMemoryResponse,
  ReviewDecisionResponse,
  ReviewQueueResponse,
  TaskCode,
  TaskDetailResponse,
  TaskListQuery,
  TaskListResponse,
  TaskPatchRequest,
} from '@transcrib/shared'
import {
  confirmTaskEvent,
  findTaskEventScope,
  getMeetingMemoryRefs,
  getProjectMemory,
  getReviewQueue,
  getTaskDetail,
  listDecisions,
  listTasks,
  patchTask,
  rejectTaskEvent,
  type MemoryScope,
  type TaskPatch,
} from '@transcrib/shared/memory'
import { prisma } from '../../db.js'
import { assertMeetingAccess, notFound, requireAuth } from '../auth/access.js'
import { LEGACY_USER_ID } from '../auth/types.js'
import { guarded, memoryGraphHolder } from './graph.js'

const ProjectParams = z.object({ projectId: z.string().uuid() })
const TaskParams = ProjectParams.extend({ code: TaskCode })
const EventParams = z.object({ eventId: z.string().uuid() })
const MeetingParams = z.object({ id: z.string().uuid() })

export default async function memoryRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>()
  const holder = memoryGraphHolder(app)

  const projectScope = (request: { projectAccess: { workspaceId: string; projectId: string } | null }): MemoryScope => {
    const access = request.projectAccess
    if (!access) throw notFound()
    return { workspaceId: access.workspaceId, projectId: access.projectId }
  }

  r.get(
    '/api/projects/:projectId/tasks',
    { schema: { params: ProjectParams, querystring: TaskListQuery, response: { 200: TaskListResponse } } },
    async (request) => ({
      items: await guarded(app, () => listTasks(holder.graph(), projectScope(request), request.query)),
    }),
  )

  r.get(
    '/api/projects/:projectId/tasks/:code',
    { schema: { params: TaskParams, response: { 200: TaskDetailResponse } } },
    async (request) => {
      const detail = await guarded(app, () => getTaskDetail(holder.graph(), projectScope(request), request.params.code))
      if (!detail) throw notFound()
      return detail
    },
  )

  // manual edit: one USER event per changed field; transitions checked by the worker's function
  r.patch(
    '/api/projects/:projectId/tasks/:code',
    { schema: { params: TaskParams, body: TaskPatchRequest, response: { 200: TaskDetailResponse } } },
    async (request) => {
      const scope = projectScope(request)
      const auth = requireAuth(request)
      const body = request.body
      const patch: TaskPatch = {}
      if (body.status !== undefined) patch.status = body.status
      if (body.due_date !== undefined) patch.dueDate = body.due_date
      if (body.assignee_participant_id !== undefined) {
        if (body.assignee_participant_id === null) patch.assignee = null
        else {
          // a participant of THIS project only; another project's id answers the same 404
          const participant = await prisma.projectParticipant.findFirst({
            where: { id: body.assignee_participant_id, projectId: scope.projectId },
            select: { id: true, name: true },
          })
          if (!participant) throw notFound()
          patch.assignee = { participantId: participant.id, name: participant.name }
        }
      }
      return guarded(app, () =>
        patchTask(holder.graph(), scope, request.params.code, patch, { userId: auth.userId ?? LEGACY_USER_ID }),
      )
    },
  )

  r.get(
    '/api/projects/:projectId/decisions',
    { schema: { params: ProjectParams, response: { 200: DecisionListResponse } } },
    async (request) => ({
      items: await guarded(app, () => listDecisions(holder.graph(), projectScope(request))),
    }),
  )

  r.get(
    '/api/projects/:projectId/memory',
    { schema: { params: ProjectParams, response: { 200: ProjectMemoryResponse } } },
    async (request) => guarded(app, () => getProjectMemory(holder.graph(), projectScope(request))),
  )

  r.get(
    '/api/projects/:projectId/review-queue',
    { schema: { params: ProjectParams, response: { 200: ReviewQueueResponse } } },
    async (request) => guarded(app, () => getReviewQueue(holder.graph(), projectScope(request))),
  )

  // ── review of PENDING events (D-14) ────────────────────────────────────────
  for (const [action, run] of [
    ['confirm', confirmTaskEvent],
    ['reject', rejectTaskEvent],
  ] as const) {
    r.post(
      `/api/task-events/:eventId/${action}`,
      { schema: { params: EventParams, response: { 200: ReviewDecisionResponse } } },
      async (request) => {
        const auth = requireAuth(request)
        const { eventId } = request.params
        return guarded(app, async () => {
          const graph = holder.graph()
          const scope = await findTaskEventScope(graph, eventId, auth.workspaceIds)
          if (!scope) throw notFound()
          return run(graph, scope, eventId, { userId: auth.userId ?? LEGACY_USER_ID })
        })
      },
    )
  }

  // ── links from the protocol page ───────────────────────────────────────────
  r.get(
    '/api/meetings/:id/memory-refs',
    { schema: { params: MeetingParams, response: { 200: MeetingMemoryRefsResponse } } },
    async (request) => {
      const access = request.meetingAccess ?? (await assertMeetingAccess(request, request.params.id))
      if (!access.projectId) return { project_id: null, tasks: [], decisions: [] }
      const scope: MemoryScope = { workspaceId: access.workspaceId, projectId: access.projectId }
      return guarded(app, () => getMeetingMemoryRefs(holder.graph(), scope, access.meetingId))
    },
  )
}
