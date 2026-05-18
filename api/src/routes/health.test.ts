/**
 * TECH-022 — /api/health route tests
 *
 * Tests the liveness endpoint:
 *   - 200 OK with { status, version, ts } shape when server is up
 *   - 503 with { status: 'shutting_down' } when shuttingDown flag is set
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../server.js'

// Stub infrastructure so tests run without live DB/Redis
vi.mock('../db.js', () => ({
  prisma: {
    $queryRaw: vi.fn().mockResolvedValue([{ '?column?': 1 }]),
    $disconnect: vi.fn().mockResolvedValue(undefined),
  },
}))

vi.mock('ioredis', () => {
  const Redis = vi.fn().mockImplementation(() => ({
    ping: vi.fn().mockResolvedValue('PONG'),
    disconnect: vi.fn(),
  }))
  return { Redis }
})

vi.mock('../config.js', () => ({
  config: {
    PORT: 3010,
    HOST: '0.0.0.0',
    DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
    REDIS_URL: 'redis://localhost:6379',
    LOG_LEVEL: 'silent',
    NODE_ENV: 'test',
  },
}))

vi.mock('../plugins/tus.js', () => ({
  tusPlugin: async () => {
    // no-op stub
  },
}))

describe('TECH-022 — GET /api/health', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await buildApp({ logLevel: 'silent' })
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
  })

  it('returns 200 with { status: "ok", version, ts } when server is running', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/health',
    })

    expect(response.statusCode).toBe(200)
    const body = response.json<{ status: string; version: string; ts: string }>()
    expect(body.status).toBe('ok')
    expect(typeof body.version).toBe('string')
    // ts must be an ISO date string
    expect(() => new Date(body.ts)).not.toThrow()
    expect(new Date(body.ts).toISOString()).toBe(body.ts)
  })

  it('returns 503 with { status: "shutting_down" } when shuttingDown flag is true', async () => {
    // Set the flag
    ;(app as unknown as { shuttingDown: boolean }).shuttingDown = true

    try {
      const response = await app.inject({
        method: 'GET',
        url: '/api/health',
      })

      expect(response.statusCode).toBe(503)
      const body = response.json<{ status: string }>()
      expect(body.status).toBe('shutting_down')
    } finally {
      // Reset so afterAll cleanup works
      ;(app as unknown as { shuttingDown: boolean }).shuttingDown = false
    }
  })
})
