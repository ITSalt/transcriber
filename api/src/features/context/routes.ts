/**
 * FR-004 — meeting context and deferred start (WP-API-PROJECTS-01; contract: shared/src/api/context.ts).
 *
 *   GET  /api/meetings/:id/context  → draft before start, frozen snapshot after (404 if none)
 *   PUT  /api/meetings/:id/context  → saves the draft; 409 CONTEXT_FROZEN unless AWAITING_START
 *   POST /api/meetings/:id/start    → freezes the snapshot, enqueues transcription; 409 on repeat
 *
 * `/api/meetings/:id…` is access-checked by the auth plugin (foreign = nonexistent = 404).
 * «Добавить в проект» from the context is POST /api/projects/:projectId/participants|glossary.
 */
import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from '@fastify/type-provider-zod'
import { z } from 'zod'
import { MeetingContextPutRequest, MeetingContextResponse, StartMeetingResponse } from '@transcrib/shared'
import { assertProjectAccess, notFound } from '../auth/access.js'
import { enqueueTranscription, freezeAndStart, readContext, saveDraft } from './service.js'

const MeetingParams = z.object({ id: z.string().uuid() })

export default async function contextRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>()

  r.get('/api/meetings/:id/context', { schema: { params: MeetingParams, response: { 200: MeetingContextResponse } } }, async (request) =>
    readContext(request.params.id),
  )

  r.put(
    '/api/meetings/:id/context',
    { schema: { params: MeetingParams, body: MeetingContextPutRequest, response: { 200: MeetingContextResponse } } },
    async (request) => {
      const meeting = request.meetingAccess!
      let projectId: string | null = null
      if (request.body.project_id) {
        const project = await assertProjectAccess(request, request.body.project_id)
        // a project of another workspace is not offered to this meeting
        if (project.workspaceId !== meeting.workspaceId) throw notFound()
        projectId = project.projectId
      }
      return saveDraft(meeting.meetingId, projectId, request.body)
    },
  )

  r.post(
    '/api/meetings/:id/start',
    { schema: { params: MeetingParams, response: { 200: StartMeetingResponse } } },
    async (request) => {
      const result = await freezeAndStart(request.params.id)
      await enqueueTranscription(result, request.log)
      return { meeting_id: request.params.id, status: 'TRANSCRIBING' as const, snapshot_hash: result.snapshotHash }
    },
  )
}
