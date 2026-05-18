/**
 * UC-002-BE — View meeting detail: route handler
 *
 * GET /api/meetings/:id → MeetingDetailResponse
 *
 * NFR-007: No authentication at MVP — endpoint is open.
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
      // RQ-003/NFR-007: no ownership filter at MVP
      const { id } = request.params
      const result = await getMeetingDetail(id)
      return reply.status(200).send(result)
    },
  )
}
