/**
 * UC-002-BE — View meeting detail: route handler
 *
 * GET /api/meetings/:id → MeetingDetailResponse
 *
 * FR-003 / RQ-044: workspace membership is checked by the auth plugin before validation
 * and the handler (features/auth/routes.ts); foreign or nonexistent meeting → 404 NOT_FOUND.
 * RQ-004: error_reason surfaced from latest job when status=ERROR (delegated to service).
 */
import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from '@fastify/type-provider-zod'
import { z } from 'zod'
import { MeetingDetailResponse } from '@transcrib/shared'
import { getMeetingDetail } from '../services/uc-002.service.js'

export async function meetingDetailRoutes(app: FastifyInstance): Promise<void> {
  app.withTypeProvider<ZodTypeProvider>().get(
    '/api/meetings/:id',
    {
      schema: {
        params: z.object({
          id: z.string().uuid(),
        }),
        response: {
          200: MeetingDetailResponse,
        },
      },
    },
    async (request, reply) => {
      // FR-003: access already checked by the auth plugin (request.meetingAccess)
      const { id } = request.params
      const result = await getMeetingDetail(id)
      return reply.status(200).send(result)
    },
  )
}
