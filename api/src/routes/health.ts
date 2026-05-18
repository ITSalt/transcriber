/**
 * TECH-005 — Health endpoint
 * GET /health — probes Postgres (via Prisma) and Redis, returns {status, db, redis}.
 */
import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from '@fastify/type-provider-zod'
import { z } from 'zod'

const HealthResponseSchema = z.object({
  status: z.enum(['ok', 'degraded', 'error']),
  db: z.enum(['ok', 'error']),
  redis: z.enum(['ok', 'error']),
})

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.withTypeProvider<ZodTypeProvider>().get(
    '/health',
    {
      schema: {
        response: {
          200: HealthResponseSchema,
          503: HealthResponseSchema,
        },
      },
    },
    async (_request, reply) => {
      const { prisma } = await import('../db.js')
      const { Redis } = await import('ioredis')
      const { config } = await import('../config.js')

      let dbStatus: 'ok' | 'error' = 'error'
      let redisStatus: 'ok' | 'error' = 'error'

      // Probe Postgres
      try {
        await prisma.$queryRaw`SELECT 1`
        dbStatus = 'ok'
      } catch {
        app.log.error('Health check: DB probe failed')
      }

      // Probe Redis
      let redisClient: InstanceType<typeof Redis> | null = null
      try {
        redisClient = new Redis(config.REDIS_URL, { lazyConnect: true, enableReadyCheck: false })
        await redisClient.ping()
        redisStatus = 'ok'
      } catch {
        app.log.error('Health check: Redis probe failed')
      } finally {
        if (redisClient) {
          redisClient.disconnect()
        }
      }

      const allOk = dbStatus === 'ok' && redisStatus === 'ok'
      const httpStatus = allOk ? 200 : 503

      return reply.status(httpStatus).send({
        status: allOk ? 'ok' : 'degraded',
        db: dbStatus,
        redis: redisStatus,
      })
    },
  )
}
