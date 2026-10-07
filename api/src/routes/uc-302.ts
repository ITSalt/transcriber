/**
 * UC-302-BE — Export protocol to PDF: route handler
 *
 * GET /api/meetings/:id/protocol/pdf
 *   → streams a Puppeteer-rendered PDF buffer as application/pdf
 *
 * FR-003 / RQ-044: workspace membership is checked by the auth plugin before validation
 * and the handler (features/auth/routes.ts); foreign or nonexistent meeting → 404 NOT_FOUND.
 * RQ-032: Gate on Meeting.status in {PROTOCOL_READY, EDITED}; NEVER persists output.
 * RQ-033: On render failure → 500 PDF_RENDER_FAILED; no state change.
 */
import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from '@fastify/type-provider-zod'
import { z } from 'zod'
import { exportProtocolPdf } from '../services/uc-302.service.js'

const MeetingIdParams = z.object({
  id: z.string().uuid(),
})

export async function protocolPdfRoutes(app: FastifyInstance): Promise<void> {
  // ── GET /api/meetings/:id/protocol/pdf ────────────────────────────────────
  // RQ-032: Gate on Meeting.status in {PROTOCOL_READY, EDITED}; stream PDF buffer.
  app.withTypeProvider<ZodTypeProvider>().get(
    '/api/meetings/:id/protocol/pdf',
    {
      schema: {
        params: MeetingIdParams,
      },
    },
    async (request, reply) => {
      // FR-003: access already checked by the auth plugin (request.meetingAccess)
      const { id } = request.params
      const { buffer, filename } = await exportProtocolPdf(id)

      // RQ-032: stream the buffer — DO NOT write to disk or S3
      return reply
        .status(200)
        .header('Content-Type', 'application/pdf')
        .header('Content-Disposition', `attachment; filename="${filename}"`)
        .header('Content-Length', String(buffer.length))
        .send(buffer)
    },
  )
}
