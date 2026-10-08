/**
 * FR-004 / D-38 — speaker confirmation (WP-BACKEND-07; contract: shared/src/api/speakers.ts).
 *
 *   GET /api/meetings/:id/speakers → label cards + project participants (AWAITING_SPEAKERS and later)
 *   PUT /api/meetings/:id/speakers → confirm / skip; only in AWAITING_SPEAKERS (else 409)
 *
 * `/api/meetings/:id…` is access-checked by the auth plugin (foreign = nonexistent = 404).
 */
import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from '@fastify/type-provider-zod'
import { z } from 'zod'
import { SpeakersPutRequest, SpeakersPutResponse, SpeakersResponse } from '@transcrib/shared'
import { confirmSpeakers, readSpeakers } from './service.js'

const MeetingParams = z.object({ id: z.string().uuid() })

export default async function speakersRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>()

  r.get(
    '/api/meetings/:id/speakers',
    { schema: { params: MeetingParams, response: { 200: SpeakersResponse } } },
    async (request) => readSpeakers(request.params.id, request.meetingAccess!.projectId),
  )

  r.put(
    '/api/meetings/:id/speakers',
    { schema: { params: MeetingParams, body: SpeakersPutRequest, response: { 200: SpeakersPutResponse } } },
    async (request) => confirmSpeakers(request.params.id, request.body, request.log),
  )
}
