/**
 * UC-003-BE — Delete meeting: route handler
 *
 * DELETE /api/meetings/:id → MeetingDeleteResponse
 *
 * NFR-007: No authentication at MVP — endpoint is open.
 * RQ-006: Cascade-removes all derived artifacts + S3 object.
 * RQ-007: In-flight jobs are marked FAILED before deletion; in_flight_failed=true in response.
 */
import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from '@fastify/type-provider-zod'
import { z } from 'zod'
import { MeetingDeleteResponse } from '@transcrib/shared'
import { deleteMeeting } from '../services/uc-003.service.js'
import { S3StorageProvider, s3ConfigFromEnv } from '../storage/s3-adapter.js'
import { publishMeetingEvent } from '../sse/pubsub.js'
import { config } from '../config.js'

export async function meetingDeleteRoutes(app: FastifyInstance): Promise<void> {
  app.withTypeProvider<ZodTypeProvider>().delete(
    '/api/meetings/:id',
    {
      schema: {
        params: z.object({
          id: z.string().uuid(),
        }),
        response: {
          200: MeetingDeleteResponse,
        },
      },
    },
    async (request, reply) => {
      // RQ-003/NFR-007: no ownership filter at MVP
      const { id } = request.params

      // Build storage adapter from env (same pattern as UC-100)
      const s3Cfg = s3ConfigFromEnv()
      const storage = new S3StorageProvider(s3Cfg)

      const result = await deleteMeeting(id, storage)

      // Step 6: Emit SSE 'meeting.deleted' so any open clients close the detail view.
      // Best-effort — failure must not prevent a 200 response.
      publishMeetingEvent(config.REDIS_URL, { type: 'meeting.deleted', meeting_id: id }, id).catch(
        (err) => {
          app.log.warn({ err, meetingId: id }, 'Failed to publish meeting.deleted SSE event')
        },
      )

      return reply.status(200).send(result)
    },
  )
}
