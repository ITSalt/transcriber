/**
 * UC-201-BE — View and download transcript: route handlers
 *
 * GET /api/meetings/:id/transcript        → TranscriptResponse (JSON)
 * GET /api/meetings/:id/transcript/download → plain-text attachment (RQ-020)
 *
 * NFR-007: No authentication at MVP — endpoints are open.
 * RQ-019: JSON endpoint returns full transcript with speaker labels.
 * RQ-020: Download endpoint streams full_text as text/plain attachment.
 */
import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from '@fastify/type-provider-zod'
import { z } from 'zod'
import { TranscriptResponse } from '@transcrib/shared'
import { getTranscript, getTranscriptDownload } from '../services/uc-201.service.js'

const MeetingIdParams = z.object({
  id: z.string().uuid(),
})

export async function transcriptRoutes(app: FastifyInstance): Promise<void> {
  // ── GET /api/meetings/:id/transcript/download ──────────────────────────────
  // Registered BEFORE the JSON endpoint so Fastify does not try to match
  // '/download' as a UUID segment value (both share the same :id prefix).
  // RQ-020: returns plain-text attachment with Content-Disposition header.
  app.withTypeProvider<ZodTypeProvider>().get(
    '/api/meetings/:id/transcript/download',
    {
      schema: {
        params: MeetingIdParams,
      },
    },
    async (request, reply) => {
      // RQ-003/NFR-007: no ownership filter at MVP
      const { id } = request.params
      const { content, filename } = await getTranscriptDownload(id)

      // RQ-020: Content-Disposition attachment; filename per meeting title / fallback
      return reply
        .header('Content-Type', 'text/plain; charset=utf-8')
        .header('Content-Disposition', `attachment; filename="${filename}"`)
        .status(200)
        .send(content)
    },
  )

  // ── GET /api/meetings/:id/transcript ──────────────────────────────────────
  // RQ-019: returns JSON with full_text + speaker_map for rendering.
  app.withTypeProvider<ZodTypeProvider>().get(
    '/api/meetings/:id/transcript',
    {
      schema: {
        params: MeetingIdParams,
        response: {
          200: TranscriptResponse,
        },
      },
    },
    async (request, reply) => {
      // RQ-003/NFR-007: no ownership filter at MVP
      const { id } = request.params
      const result = await getTranscript(id)
      return reply.status(200).send(result)
    },
  )
}
