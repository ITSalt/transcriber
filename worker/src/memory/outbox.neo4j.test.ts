/**
 * AC-5 on a real Neo4j: a meeting deleted while Neo4j is unreachable → the outbox row
 * waits (attempts, last_error) → once Neo4j is reachable the meeting's nodes are deleted.
 * "Unreachable" = the consumer's graph points at a closed port until it is switched to the
 * real server, which is what a Neo4j restart looks like to the worker.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import neo4j, { type Driver } from 'neo4j-driver'
import pino from 'pino'
import {
  applyMemoryGraphMigrations,
  deleteProjectFromGraph,
  getMeetingMemoryRefs,
  listTasks,
  type MemoryGraph,
} from '@transcrib/shared/memory'
import { applyOutboxEntry } from './index.js'
import { GraphOutboxConsumer } from './outbox.js'
import { runMemoryUpdate } from './pipeline.js'
import { meetingSources, memoryRepo, scriptedLlm } from './test-fixtures.js'

const URI = process.env['MEMORY_NEO4J_URI']
const uuid = () => crypto.randomUUID()

describe.skipIf(!URI)('graph outbox on Neo4j (AC-5)', { timeout: 60_000 }, () => {
  let driver: Driver
  let deadDriver: Driver
  let graph: MemoryGraph
  const ids = { workspaceId: uuid(), projectId: uuid(), m1: uuid(), m2: uuid() }
  const scope = { workspaceId: ids.workspaceId, projectId: ids.projectId }
  const log = pino({ level: 'silent' })

  beforeAll(async () => {
    const auth = neo4j.auth.basic(process.env['MEMORY_NEO4J_USER'] ?? 'neo4j', process.env['MEMORY_NEO4J_PASSWORD'] ?? '')
    driver = neo4j.driver(URI!, auth, { disableLosslessIntegers: true })
    deadDriver = neo4j.driver('bolt://127.0.0.1:1', auth, { connectionTimeout: 500, maxTransactionRetryTime: 500 })
    graph = { driver, database: process.env['MEMORY_NEO4J_DATABASE'] || undefined }
    await applyMemoryGraphMigrations(graph)
    const { m1 } = meetingSources(ids)
    await runMemoryUpdate(
      {
        graph,
        llm: () => scriptedLlm(),
        loadMeeting: async () => m1,
        recordGeneration: async () => undefined,
        log,
        settings: { confidenceThreshold: 0.7, candidateLimit: 200 },
      },
      { meeting_id: ids.m1, project_id: ids.projectId, workspace_id: ids.workspaceId },
    )
  }, 60_000)

  afterAll(async () => {
    await deleteProjectFromGraph(graph, scope)
    await driver.close()
    await deadDriver.close()
  }, 60_000)

  it('waits while Neo4j is unreachable, deletes the meeting nodes once it is back', async () => {
    expect((await listTasks(graph, scope)).map((t) => t.code)).toEqual(['T-1', 'T-2'])
    const { repo, state } = memoryRepo([
      { id: 'row-1', op: 'DELETE_MEETING', payload: { meeting_id: ids.m1, project_id: ids.projectId, workspace_id: ids.workspaceId } },
    ])
    let current: MemoryGraph = { driver: deadDriver, database: graph.database }
    const consumer = new GraphOutboxConsumer({ repo, apply: (e) => applyOutboxEntry(current)(e), log, pollMs: 1000 })

    expect(await consumer.tick()).toMatchObject({ done: 0, failed: 1 })
    expect(state[0]).toMatchObject({ attempts: 1, doneAt: null })
    expect(state[0]!.lastError).toBeTruthy()
    expect(await listTasks(graph, scope)).toHaveLength(2) // nothing deleted yet

    current = graph // Neo4j is back
    expect(await consumer.tick()).toMatchObject({ done: 1, failed: 0 })
    expect(state[0]!.doneAt).not.toBeNull()
    expect(await listTasks(graph, scope)).toEqual([])
    const refs = await getMeetingMemoryRefs(graph, scope, ids.m1)
    expect(refs).toMatchObject({ tasks: [], decisions: [] })
  })
})
