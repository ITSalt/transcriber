/**
 * TECH-006 — Config unit tests
 */
import { describe, it, expect } from 'vitest'
import { loadConfig } from './config.js'

describe('loadConfig', () => {
  it('uses defaults when only required vars are missing and all have defaults', () => {
    // All fields have defaults — should parse with empty env
    const cfg = loadConfig({})
    expect(cfg.REDIS_URL).toBe('redis://localhost:6379')
    expect(cfg.LOG_LEVEL).toBe('info')
    expect(cfg.NODE_ENV).toBe('development')
    expect(cfg.JOB_CONCURRENCY).toBe(1)
  })

  it('parses valid env overrides', () => {
    const cfg = loadConfig({
      REDIS_URL: 'redis://redis:6380',
      LOG_LEVEL: 'debug',
      NODE_ENV: 'production',
      JOB_CONCURRENCY: '3',
    })
    expect(cfg.REDIS_URL).toBe('redis://redis:6380')
    expect(cfg.LOG_LEVEL).toBe('debug')
    expect(cfg.NODE_ENV).toBe('production')
    expect(cfg.JOB_CONCURRENCY).toBe(3)
  })

  it('throws on invalid LOG_LEVEL', () => {
    expect(() =>
      loadConfig({ LOG_LEVEL: 'verbose' }),
    ).toThrow('Invalid environment configuration')
  })

  it('throws on invalid NODE_ENV', () => {
    expect(() =>
      loadConfig({ NODE_ENV: 'staging' }),
    ).toThrow('Invalid environment configuration')
  })

  it('throws on non-integer JOB_CONCURRENCY', () => {
    expect(() =>
      loadConfig({ JOB_CONCURRENCY: 'not-a-number' }),
    ).toThrow('Invalid environment configuration')
  })
})
