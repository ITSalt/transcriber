/**
 * UC-301-BE — Review and edit protocol: route handlers
 *
 * GET  /api/meetings/:id/protocol  → ProtocolResponse (JSON)
 * PUT  /api/meetings/:id/protocol  → ProtocolSaveResponse (JSON)
 *
 * FR-003 / RQ-044: workspace membership is checked by the auth plugin before validation
 * and the handler (features/auth/routes.ts); foreign or nonexistent meeting → 404 NOT_FOUND.
 * RQ-029: GET gates on Meeting.status in {PROTOCOL_READY, EDITED}.
 * RQ-027/028/029/030: PUT atomically saves edits and transitions status.
 */
import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from '@fastify/type-provider-zod'
import { z } from 'zod'
import { ProtocolResponse, ProtocolSaveRequest, ProtocolSaveResponse } from '@transcrib/shared'
import { getProtocol, saveProtocol } from '../services/uc-301.service.js'

const MeetingIdParams = z.object({
  id: z.string().uuid(),
})

export async function protocolRoutes(app: FastifyInstance): Promise<void> {
  // ── GET /api/meetings/:id/protocol ────────────────────────────────────────
  // RQ-029: Load Protocol; gate on Meeting.status in {PROTOCOL_READY, EDITED}.
  app.withTypeProvider<ZodTypeProvider>().get(
    '/api/meetings/:id/protocol',
    {
      schema: {
        params: MeetingIdParams,
        response: {
          200: ProtocolResponse,
        },
      },
    },
    async (request, reply) => {
      // FR-003: access already checked by the auth plugin (request.meetingAccess)
      const { id } = request.params
      const result = await getProtocol(id)
      return reply.status(200).send(result)
    },
  )

  // ── PUT /api/meetings/:id/protocol ────────────────────────────────────────
  // RQ-027/028/029/030: Atomically saves edits; bumps version+1, edit_count+1, last_edited_at=now.
  // Transitions Meeting.status to EDITED (BRQ-008).
  // Returns ProtocolSaveResponse with updated metadata.
  app.withTypeProvider<ZodTypeProvider>().put(
    '/api/meetings/:id/protocol',
    {
      schema: {
        params: MeetingIdParams,
        body: ProtocolSaveRequest,
        response: {
          200: ProtocolSaveResponse,
        },
      },
    },
    async (request, reply) => {
      // FR-003: membership already checked by the auth plugin (foreign → 404)
      const { id } = request.params
      const { markdown_content } = request.body
      const result = await saveProtocol(id, markdown_content, request.auth?.userId ?? null)
      return reply.status(200).send(result)
    },
  )
}
