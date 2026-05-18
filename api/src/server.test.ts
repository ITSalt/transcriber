/**
 * TECH-005 — Server integration tests
 * Tests the Fastify scaffold using the inject() helper (no live server needed).
 *
 * Health probes (DB + Redis) are stubbed so tests pass without infrastructure.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { z } from 'zod'
import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from '@fastify/type-provider-zod'
import { buildApp } from './server.js'
import { AppError } from './plugins/errors.js'

// ─── Stub infrastructure probes ──────────────────────────────────────────────

vi.mock('./db.js', () => ({
  prisma: {
    $queryRaw: vi.fn().mockResolvedValue([{ '?column?': 1 }]),
  },
}))

vi.mock('ioredis', () => {
  const Redis = vi.fn().mockImplementation(() => ({
    ping: vi.fn().mockResolvedValue('PONG'),
    disconnect: vi.fn(),
  }))
  return { Redis }
})

vi.mock('./config.js', () => ({
  config: {
    PORT: 3000,
    HOST: '0.0.0.0',
    DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
    REDIS_URL: 'redis://localhost:6379',
    LOG_LEVEL: 'silent',
    NODE_ENV: 'test',
  },
}))

// Stub S3 env vars so the TUS plugin does not throw during bootstrap
vi.mock('./plugins/tus.js', () => ({
  tusPlugin: async () => {
    // no-op stub — TECH-005 tests do not exercise TUS routes
  },
}))

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('TECH-005 — Fastify scaffold', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await buildApp({ logLevel: 'silent' })

    // Register test-only routes BEFORE app.ready()
    // These exercise the error handler without needing separate test apps.

    // Route that throws AppError with details
    app.get('/test/app-error', async () => {
      throw new AppError('VALIDATION_FAILED', 400, 'Validation failed', {
        field: 'name',
      })
    })

    // Route that throws AppError without details
    app.get('/test/app-error-no-details', async () => {
      throw new AppError('NOT_FOUND', 404, 'Resource not found')
    })

    // Route with strict Zod body validation
    app.withTypeProvider<ZodTypeProvider>().post('/test/validated', {
      schema: {
        body: z.object({
          name: z.string().min(3),
          age: z.number().int().min(0),
        }),
      },
      handler: async (req) => {
        return { received: req.body }
      },
    })

    await app.ready()
  })

  afterAll(async () => {
    await app.close()
  })

  // ── Health endpoint ─────────────────────────────────────────────────────────

  describe('GET /health', () => {
    it('returns 200 with all probes green when DB and Redis respond', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health',
      })

      expect(response.statusCode).toBe(200)
      const body = response.json<{ status: string; db: string; redis: string }>()
      expect(body.status).toBe('ok')
      expect(body.db).toBe('ok')
      expect(body.redis).toBe('ok')
    })
  })

  // ── AppError mapping ────────────────────────────────────────────────────────

  describe('AppError handling', () => {
    it('maps AppError to JSON {code, message, details} with correct HTTP status', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/test/app-error',
      })

      expect(response.statusCode).toBe(400)
      const body = response.json<{ code: string; message: string; details: unknown }>()
      expect(body.code).toBe('VALIDATION_FAILED')
      expect(body.message).toBe('Validation failed')
      expect(body.details).toEqual({ field: 'name' })
    })

    it('maps AppError without details to JSON without details key', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/test/app-error-no-details',
      })

      expect(response.statusCode).toBe(404)
      const body = response.json<{ code: string; message: string; details?: unknown }>()
      expect(body.code).toBe('NOT_FOUND')
      expect(body.message).toBe('Resource not found')
      expect(body['details']).toBeUndefined()
    })
  })

  // ── Zod validation errors ───────────────────────────────────────────────────

  describe('Zod request validation', () => {
    it('returns 400 with field-level details when request body fails schema validation', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/test/validated',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'ab', age: -1 }),
      })

      expect(response.statusCode).toBe(400)
      const body = response.json<{ code: string; message: string; details: unknown[] }>()
      expect(body.code).toBe('VALIDATION_ERROR')
      expect(body.message).toBe('Request validation failed')
      expect(Array.isArray(body.details)).toBe(true)
      expect((body.details as unknown[]).length).toBeGreaterThan(0)
    })
  })
})
