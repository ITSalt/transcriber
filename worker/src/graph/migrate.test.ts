/**
 * AC-6 — graph:migrate: without MEMORY_NEO4J_URI exit 0 with a warning; on Neo4j a second
 * run applies nothing. The Neo4j part is skipped without MEMORY_NEO4J_URI.
 */
import { describe, expect, it, vi } from 'vitest'
import { readMemoryNeo4jConfig } from './config.js'
import { runGraphMigrate } from './migrate.js'

const out = () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() })

describe('graph:migrate', () => {
  it('without MEMORY_NEO4J_URI: warning, exit 0, no connection attempt', async () => {
    const o = out()
    const connect = vi.fn()
    expect(await runGraphMigrate({}, o, connect)).toBe(0)
    expect(o.warn).toHaveBeenCalledWith(expect.stringContaining('MEMORY_NEO4J_URI is not set'))
    expect(connect).not.toHaveBeenCalled()
  })

  it('a bad URI or an unreachable server: error, exit 1', async () => {
    const o = out()
    expect(await runGraphMigrate({ MEMORY_NEO4J_URI: 'http://x' }, o)).toBe(1)
    expect(o.error).toHaveBeenCalled()
  })

  it('reads MEMORY_NEO4J_* with defaults', () => {
    expect(readMemoryNeo4jConfig({ MEMORY_NEO4J_URI: ' ' })).toBeNull()
    expect(readMemoryNeo4jConfig({ MEMORY_NEO4J_URI: 'bolt://h:7687', MEMORY_NEO4J_PASSWORD: 'p' })).toEqual({
      uri: 'bolt://h:7687',
      user: 'neo4j',
      password: 'p',
      database: undefined,
    })
  })

  it.skipIf(!process.env['MEMORY_NEO4J_URI'])('twice on Neo4j: the second run reports no changes', { timeout: 60_000 }, async () => {
    const first = out()
    expect(await runGraphMigrate(process.env, first)).toBe(0)
    const second = out()
    expect(await runGraphMigrate(process.env, second)).toBe(0)
    expect(second.info).toHaveBeenCalledWith(expect.stringMatching(/up to date .* no changes/))
    expect(second.error).not.toHaveBeenCalled()
  })
})
