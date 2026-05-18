/**
 * TECH-022 — Liveness health endpoint
 *
 * GET /api/health
 *
 * - 200 OK  → { status: 'ok', version, ts }
 *   Returns as soon as the process has accepted the request (liveness only).
 *   Does NOT probe Postgres or Redis — deploy workflow only needs liveness.
 *
 * - 503     → { status: 'shutting_down' }
 *   Returned when the SIGTERM handler has set fastify.shuttingDown = true.
 *
 * Logged at 'debug' level to avoid flooding prod logs.
 *
 * Registered with fastify-plugin (no encapsulation) so it reads the root
 * app's `shuttingDown` decorator directly.
 */
import fp from 'fastify-plugin'
import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from '@fastify/type-provider-zod'
import { z } from 'zod'

const HealthOkSchema = z.object({
  status: z.literal('ok'),
  version: z.string(),
  ts: z.string(),
})

const HealthShuttingDownSchema = z.object({
  status: z.literal('shutting_down'),
})

async function healthPlugin(app: FastifyInstance): Promise<void> {
  app.withTypeProvider<ZodTypeProvider>().get(
    '/api/health',
    {
      logLevel: 'debug',
      schema: {
        response: {
          200: HealthOkSchema,
          503: HealthShuttingDownSchema,
        },
      },
    },
    async (_request, reply) => {
      if (app.shuttingDown) {
        reply.code(503)
        return { status: 'shutting_down' as const }
      }
      return {
        status: 'ok' as const,
        version: process.env['npm_package_version'] ?? 'unknown',
        ts: new Date().toISOString(),
      }
    },
  )
}

export const healthRoutes = fp(healthPlugin, {
  name: 'health-routes',
})
