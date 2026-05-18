/**
 * TECH-012 — GET /api/meetings/:id/events
 *
 * Server-Sent Events stream for meeting status updates (ADR-010).
 *
 * On connect:
 *   1. Sets SSE response headers and calls reply.hijack() so Fastify does not
 *      serialise or close the response on its own.
 *   2. Sends an immediate heartbeat ping so the client sees the stream open.
 *   3. Subscribes to the Redis channel `meeting:<id>` via pubsub.ts.
 *   4. Starts a 15-second heartbeat interval.
 *
 * On each Redis message the raw JSON is re-serialised as an SSE frame and
 * written to reply.raw.
 *
 * On client disconnect the Redis subscription and heartbeat timer are cleaned up.
 */
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { formatSseFrame } from '../sse/sse-formatter.js'
import { subscribeMeetingEvents } from '../sse/pubsub.js'
import { config } from '../config.js'

/** Heartbeat interval in milliseconds (ADR-010: 15 s). */
export const HEARTBEAT_INTERVAL_MS = 15_000

const ParamsSchema = z.object({
  id: z.string().uuid(),
})

export async function eventsRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/api/meetings/:id/events',
    {
      schema: {
        params: ParamsSchema,
      },
    },
    async (request, reply) => {
      const { id } = request.params as z.infer<typeof ParamsSchema>

      // ── Hijack the response so Fastify does not serialise or auto-close it ──
      // After hijack(), Fastify will not touch reply.raw — we own it fully.
      reply.hijack()

      const raw = reply.raw

      // ── SSE response headers ────────────────────────────────────────────────
      raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no', // disable nginx buffering
      })

      // ── Initial ping so the client sees an open stream immediately ──────────
      raw.write(formatSseFrame({ type: 'ping' }))

      // ── Redis subscription ──────────────────────────────────────────────────
      const unsubscribe = subscribeMeetingEvents(config.REDIS_URL, id, (event) => {
        if (!raw.writableEnded) {
          raw.write(formatSseFrame(event))
        }
      })

      // ── Heartbeat timer ─────────────────────────────────────────────────────
      const heartbeat = setInterval(() => {
        if (!raw.writableEnded) {
          raw.write(formatSseFrame({ type: 'ping' }))
        } else {
          clearInterval(heartbeat)
        }
      }, HEARTBEAT_INTERVAL_MS)

      // ── Cleanup on client disconnect ────────────────────────────────────────
      const cleanup = (): void => {
        clearInterval(heartbeat)
        unsubscribe()
        if (!raw.writableEnded) {
          raw.end()
        }
      }

      request.raw.on('close', cleanup)
      request.raw.on('aborted', cleanup)
      // Also clean up if the response side closes (e.g. inject() finishes)
      raw.on('close', () => {
        clearInterval(heartbeat)
        unsubscribe()
      })
    },
  )
}
