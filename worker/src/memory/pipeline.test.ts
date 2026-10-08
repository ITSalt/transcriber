/**
 * Pipeline without Neo4j (fake driver): logs never carry meeting content — a dropped quote
 * is logged by segment number and a truncated hash only (REVISE 1, item 2).
 */
import { describe, expect, it } from 'vitest'
import pino from 'pino'
import type { Driver } from 'neo4j-driver'
import { contentHash, runMemoryUpdate } from './pipeline.js'
import { meetingSources, scriptedLlm } from './test-fixtures.js'

describe('memory pipeline logging', () => {
  it('a dropped item is logged without its quote or title', async () => {
    const lines: string[] = []
    const log = pino({ level: 'debug' }, { write: (line: string) => void lines.push(line) })
    // every read is empty except a task's event list (materialisation after the write)
    const run = async (cypher: string) =>
      cypher.includes('count(t) AS found')
        ? { records: [{ get: (k: string) => (k === 'found' ? 1 : k === 'events' ? [] : undefined) }] }
        : { records: [] }
    const driver = {
      session: () => ({
        executeRead: (work: (tx: unknown) => unknown) => work({ run }),
        executeWrite: (work: (tx: unknown) => unknown) => work({ run }),
        close: async () => undefined,
      }),
    } as unknown as Driver
    const ids = {
      workspaceId: '11111111-1111-4111-8111-111111111111',
      projectId: '22222222-2222-4222-8222-222222222222',
      m1: '33333333-3333-4333-8333-333333333333',
      m2: '44444444-4444-4444-8444-444444444444',
    }
    const { m1 } = meetingSources(ids)

    const out = await runMemoryUpdate(
      {
        graph: { driver },
        llm: () => scriptedLlm(),
        loadMeeting: async () => m1,
        recordGeneration: async () => undefined,
        log,
        settings: { confidenceThreshold: 0.7, candidateLimit: 200 },
      },
      { meeting_id: ids.m1, project_id: ids.projectId, workspace_id: ids.workspaceId },
    )

    expect(out).toMatchObject({ status: 'APPLIED', droppedQuotes: 1 })
    const all = lines.join('\n')
    const dropped = lines.map((l) => JSON.parse(l) as Record<string, unknown>).find((l) => String(l['msg']).includes('quote not found'))
    expect(dropped).toMatchObject({ segment: 2, quoteHash: contentHash('Сидоров обещал закупить сервер до конца недели') })
    for (const content of ['Сидоров', 'сервер', 'договор', 'смету', 'Иванов']) expect(all).not.toContain(content)
  })
})
