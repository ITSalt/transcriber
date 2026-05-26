/**
 * TECH-025 — parseRedisUrl unit tests for api/src/queue.ts
 */
import { describe, it, expect, vi } from 'vitest'

// Stub config before any module-under-test import to prevent env validation
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

// Stub BullMQ Queue so it does not attempt real Redis connections
vi.mock('bullmq', () => ({
  Queue: vi.fn().mockImplementation(() => ({
    add: vi.fn(),
    close: vi.fn(),
  })),
}))

const { parseRedisUrl } = await import('./queue.js')

describe('parseRedisUrl (api)', () => {
  it('parses a standard redis URL', () => {
    const opts = parseRedisUrl('redis://localhost:6379')
    expect(opts.host).toBe('localhost')
    expect(opts.port).toBe(6379)
    expect(opts.password).toBeUndefined()
  })

  it('parses a redis URL with custom port', () => {
    const opts = parseRedisUrl('redis://redis-host:6380')
    expect(opts.host).toBe('redis-host')
    expect(opts.port).toBe(6380)
  })

  it('parses a redis URL with password', () => {
    const opts = parseRedisUrl('redis://:secret@localhost:6379')
    expect(opts.password).toBe('secret')
  })

  it('defaults to port 6379 when not specified', () => {
    const opts = parseRedisUrl('redis://localhost')
    expect(opts.port).toBe(6379)
  })

  it('parses db-index 1 from URL path /1', () => {
    const opts = parseRedisUrl('redis://localhost:6379/1')
    expect(opts.db).toBe(1)
  })

  it('parses db-index 3 from URL path /3', () => {
    const opts = parseRedisUrl('redis://localhost:6379/3')
    expect(opts.db).toBe(3)
  })

  it('leaves db unset when URL has no path segment', () => {
    const opts = parseRedisUrl('redis://localhost:6379')
    expect(opts.db).toBeUndefined()
  })

  it('leaves db unset when URL path is empty (/)', () => {
    const opts = parseRedisUrl('redis://localhost:6379/')
    expect(opts.db).toBeUndefined()
  })

  it('preserves host, port, and auth when db-index is present', () => {
    const opts = parseRedisUrl('redis://:secret@redis-host:6380/2')
    expect(opts.host).toBe('redis-host')
    expect(opts.port).toBe(6380)
    expect(opts.password).toBe('secret')
    expect(opts.db).toBe(2)
  })
})
