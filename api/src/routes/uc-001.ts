/**
 * UC-001-BE — View meeting catalog: route handler
 *
 * GET /api/meetings?workspace_id=<uuid>[&project_id=<uuid>] → WorkspaceMeetingListResponse
 *
 * FR-003 / RQ-044: only meetings of the requested workspace, membership required (foreign
 * workspace → 404 NOT_FOUND). workspace_id may be omitted only by the legacy principal
 * (AUTH_REQUIRED=false, D-20) — it then means «Роман»; a signed-in user gets
 * 400 WORKSPACE_REQUIRED.
 * RQ-001: Sorting is delegated to the service layer.
 */
import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from '@fastify/type-provider-zod'
import { WorkspaceMeetingListQuery, WorkspaceMeetingListResponse } from '@transcrib/shared'
import { listMeetings } from '../services/uc-001.service.js'
import { resolveWorkspace } from '../features/auth/access.js'

export async function meetingListRoutes(app: FastifyInstance): Promise<void> {
  app.withTypeProvider<ZodTypeProvider>().get(
    '/api/meetings',
    {
      schema: {
        querystring: WorkspaceMeetingListQuery.partial(),
        response: {
          200: WorkspaceMeetingListResponse,
        },
      },
    },
    async (request, reply) => {
      const workspaceId = resolveWorkspace(request, request.query.workspace_id)
      // RQ-001: sorted by updated_at DESC (handled in service)
      const result = await listMeetings(workspaceId, request.query.project_id)
      return reply.status(200).send(result)
    },
  )
}
