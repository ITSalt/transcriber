/**
 * UC-605 / AC-5 — GraphOutbox drain. Unit level with an in-memory repo; the Neo4j round trip
 * (unavailable → waits → restored → nodes deleted) is in outbox.neo4j.test.ts.
 */
import { describe, expect, it, vi } from 'vitest'
import pino from 'pino'
import type { GraphOutboxEntry } from '@transcrib/shared'
import { GraphOutboxConsumer } from './outbox.js'
import { memoryRepo } from './test-fixtures.js'

const WS = '11111111-1111-4111-8111-111111111111'
const PROJECT = '22222222-2222-4222-8222-222222222222'
const MEETING = '33333333-3333-4333-8333-333333333333'

const log = pino({ level: 'silent' })

describe('GraphOutboxConsumer', () => {
  it('applies pending rows in order and marks them done', async () => {
    const { repo, state } = memoryRepo([
      { id: 'a', op: 'DELETE_MEETING', payload: { meeting_id: MEETING, project_id: PROJECT, workspace_id: WS } },
      { id: 'b', op: 'DELETE_PROJECT', payload: { project_id: PROJECT, workspace_id: WS } },
    ])
    const applied: GraphOutboxEntry[] = []
    const consumer = new GraphOutboxConsumer({ repo, apply: async (e) => void applied.push(e), log, pollMs: 1000 })
    expect(await consumer.tick()).toEqual({ done: 2, failed: 0, invalid: 0 })
    expect(applied.map((e) => e.op)).toEqual(['DELETE_MEETING', 'DELETE_PROJECT'])
    expect(state.every((r) => r.doneAt)).toBe(true)
  })

  it('Neo4j down: the row stays pending with attempts/last_error, later rows wait; applied once Neo4j is back', async () => {
    const { repo, state } = memoryRepo([
      { id: 'a', op: 'DELETE_MEETING', payload: { meeting_id: MEETING, project_id: PROJECT, workspace_id: WS } },
      { id: 'b', op: 'DELETE_PROJECT', payload: { project_id: PROJECT, workspace_id: WS } },
    ])
    let up = false
    const apply = vi.fn(async () => {
      if (!up) throw new Error('ServiceUnavailable: Could not perform discovery')
    })
    const consumer = new GraphOutboxConsumer({ repo, apply, log, pollMs: 1000 })
    expect(await consumer.tick()).toEqual({ done: 0, failed: 1, invalid: 0 })
    expect(await consumer.tick()).toEqual({ done: 0, failed: 1, invalid: 0 })
    expect(state[0]).toMatchObject({ attempts: 2, doneAt: null, lastError: expect.stringContaining('ServiceUnavailable') })
    expect(state[1]).toMatchObject({ attempts: 0, doneAt: null })
    up = true
    expect(await consumer.tick()).toEqual({ done: 2, failed: 0, invalid: 0 })
  })

  it('an unparsable row is marked failed and does not block the next one', async () => {
    const { repo, state } = memoryRepo([
      { id: 'bad', op: 'DELETE_EVERYTHING', payload: {} },
      { id: 'ok', op: 'DELETE_PROJECT', payload: { project_id: PROJECT, workspace_id: WS } },
    ])
    const consumer = new GraphOutboxConsumer({ repo, apply: async () => undefined, log, pollMs: 1000 })
    expect(await consumer.tick()).toEqual({ done: 1, failed: 0, invalid: 1 })
    expect(state[0]!.lastError).toMatch(/invalid outbox entry/)
  })

  it('start polls on its own and stop waits for the tick in progress', async () => {
    const { repo, state } = memoryRepo([{ id: 'a', op: 'DELETE_PROJECT', payload: { project_id: PROJECT, workspace_id: WS } }])
    const consumer = new GraphOutboxConsumer({ repo, apply: async () => undefined, log, pollMs: 10 })
    consumer.start()
    await vi.waitFor(() => expect(state[0]!.doneAt).not.toBeNull())
    await consumer.stop()
  })
})
