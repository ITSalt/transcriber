/**
 * UC-004-BE — Retry failed meeting processing: route handler
 *
 * POST /api/meetings/:id/retry
 *   — Re-enqueue the most recent FAILED job for the meeting and move the
 *     meeting back to its in-progress state (TRANSCRIBING | GENERATING_PROTOCOL).
 *   — Idempotent on meetingId + stage (RQ-035).
 *   — Allowed only when Meeting.status=FAILED (RQ-036).
 *
 * Returns 200 with the updated meeting on success.
 * Returns 409 MEETING_NOT_FAILED   when Meeting.status != FAILED.
 * Returns 409 RETRY_ALREADY_IN_FLIGHT when the stage is already PENDING/PROCESSING.
 * Returns 404 MEETING_NOT_FOUND    when no such meeting exists.
 *
 * NFR-007: No authentication at MVP — endpoint is open.
 */
import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from '@fastify/type-provider-zod'
import { z } from 'zod'
import { MeetingStatus, MeetingLanguage } from '@transcrib/shared'
import { retryMeetingProcessing } from '../services/uc-004.service.js'

const MeetingIdParams = z.object({
  id: z.string().uuid(),
})

/** Response shape — updated meeting (mirrors GET /api/meetings/:id shape). */
const RetryMeetingResponse = z.object({
  id: z.string().uuid(),
  title: z.string(),
  status: MeetingStatus,
  language: MeetingLanguage,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})

export async function retryMeetingRoutes(app: FastifyInstance): Promise<void> {
  // ── POST /api/meetings/:id/retry ──────────────────────────────────────────
  // RQ-034: Re-enqueue the most recent FAILED job; transition Meeting status back.
  // RQ-035: Idempotent on meetingId + stage.
  // RQ-036: Only allowed when Meeting.status=FAILED.
  app.withTypeProvider<ZodTypeProvider>().post(
    '/api/meetings/:id/retry',
    {
      schema: {
        params: MeetingIdParams,
        response: {
          200: RetryMeetingResponse,
        },
      },
    },
    async (request, reply) => {
      // NFR-007: no ownership filter at MVP
      const { id } = request.params
      const result = await retryMeetingProcessing(id)
      return reply.status(200).send({
        id: result.id,
        title: result.title,
        status: result.status as z.infer<typeof MeetingStatus>,
        language: result.language as z.infer<typeof MeetingLanguage>,
        createdAt: result.createdAt.toISOString(),
        updatedAt: result.updatedAt.toISOString(),
      })
    },
  )
}
