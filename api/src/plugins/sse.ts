/**
 * TECH-012 — SSE plugin
 * Registers the GET /api/meetings/:id/events route via fastify-plugin so that
 * the error handler (registered at the root scope) applies to this route too.
 */
import fp from 'fastify-plugin'
import type { FastifyInstance } from 'fastify'
import { eventsRoutes } from '../routes/events.js'

async function ssePluginImpl(app: FastifyInstance): Promise<void> {
  await app.register(eventsRoutes)
}

export const ssePlugin = fp(ssePluginImpl, {
  name: 'sse',
  fastify: '5.x',
})
