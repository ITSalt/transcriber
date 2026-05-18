/**
 * UC-001-BE — View meeting catalog: route handler
 *
 * GET /api/meetings → MeetingListResponse
 *
 * NFR-007: No authentication at MVP — endpoint is open.
 * RQ-001: Sorting is delegated to the service layer.
 */
import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from '@fastify/type-provider-zod'
import { MeetingListResponse } from '@transcrib/shared'
import { listMeetings } from '../services/uc-001.service.js'

export async function meetingListRoutes(app: FastifyInstance): Promise<void> {
  app.withTypeProvider<ZodTypeProvider>().get(
    '/api/meetings',
    {
      schema: {
        response: {
          200: MeetingListResponse,
        },
      },
    },
    async (_request, reply) => {
      // RQ-001: sorted by updated_at DESC (handled in service)
      // RQ-003/NFR-007: no ownership filter at MVP
      const result = await listMeetings()
      return reply.status(200).send(result)
    },
  )
}
