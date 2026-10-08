/**
 * WP-WORKER-MEMORY-01 acceptance on a real Neo4j (skipped without MEMORY_NEO4J_URI):
 *   AC-1  meeting 1 creates T-1, T-2, D-1; meeting 2 «договор отправил» → closure of T-1 is
 *         PENDING, T-1 stays open; T-2, not mentioned, gets no events.
 *   AC-2  an item whose quote is not in the transcript is dropped; a resolution with a
 *         nonexistent target_task_code is rejected.
 *   AC-3  the protocol prompt of meeting 2 gets <project_memory> with T-1, T-2 and their
 *         codes through the provider.
 * The LLM is scripted (test-fixtures.ts); Postgres is replaced by the fixture loader.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import neo4j, { type Driver } from 'neo4j-driver'
import pino from 'pino'
import {
  getProjectMemoryProvider,
  renderLlmContextSections,
  setProjectMemoryProvider,
  type LlmCompletionInput,
  type ProjectMemoryProvider,
} from '@transcrib/shared'
import {
  applyMemoryGraphMigrations,
  deleteProjectFromGraph,
  getProjectMemory,
  getReviewQueue,
  getTaskDetail,
  listDecisions,
  listTasks,
  type MemoryGraph,
} from '@transcrib/shared/memory'
import { runMemoryUpdate, type GenerationRecord, type MemoryPipelineDeps } from './pipeline.js'
import { Neo4jProjectMemoryProvider } from './provider.js'
import { IVANOV, meetingSources, scriptedLlm } from './test-fixtures.js'
import { EXTRACT_SYSTEM } from './prompts.js'

const URI = process.env['MEMORY_NEO4J_URI']
const uuid = () => crypto.randomUUID()

describe.skipIf(!URI)('project memory pipeline on Neo4j', { timeout: 60_000 }, () => {
  let driver: Driver
  let graph: MemoryGraph
  const ids = { workspaceId: uuid(), projectId: uuid(), m1: uuid(), m2: uuid(), m3: uuid() }
  const { m1, m2, m3: hygiene } = meetingSources(ids)
  const generations: GenerationRecord[] = []
  const llmCalls: LlmCompletionInput[] = []
  const log = pino({ level: 'silent' })
  let deps: MemoryPipelineDeps
  const payload = (meetingId: string) => ({ meeting_id: meetingId, project_id: ids.projectId, workspace_id: ids.workspaceId })

  beforeAll(async () => {
    driver = neo4j.driver(URI!, neo4j.auth.basic(process.env['MEMORY_NEO4J_USER'] ?? 'neo4j', process.env['MEMORY_NEO4J_PASSWORD'] ?? ''), {
      disableLosslessIntegers: true,
    })
    graph = { driver, database: process.env['MEMORY_NEO4J_DATABASE'] || undefined }
    await applyMemoryGraphMigrations(graph)
    const llm = scriptedLlm(llmCalls)
    deps = {
      graph,
      llm: () => llm,
      loadMeeting: async (id) => (id === m1.meetingId ? m1 : id === m2.meetingId ? m2 : id === hygiene.meetingId ? hygiene : null),
      recordGeneration: async (r) => {
        generations.push(r)
      },
      log,
      settings: { confidenceThreshold: 0.7, candidateLimit: 200 },
      now: () => new Date('2026-10-01T12:00:00.000Z'),
    }
  }, 60_000)

  afterAll(async () => {
    await deleteProjectFromGraph(graph, { workspaceId: ids.workspaceId, projectId: ids.projectId })
    await driver.close()
  }, 60_000)

  const scope = () => ({ workspaceId: ids.workspaceId, projectId: ids.projectId })

  it('AC-1/AC-2 meeting 1: T-1, T-2, D-1 created; the item with a fabricated quote is dropped', async () => {
    const out = await runMemoryUpdate(deps, payload(m1.meetingId))
    expect(out).toMatchObject({ status: 'APPLIED', memoryVersion: 1, createdTasks: 2, createdDecisions: 1, droppedQuotes: 1, pendingEvents: 0 })

    const tasks = await listTasks(graph, scope())
    expect(tasks.map((t) => [t.code, t.title, t.status, t.assignee?.name ?? null, t.due_date])).toEqual([
      ['T-1', 'Отправить договор заказчику', 'OPEN', IVANOV.name, '2026-10-15'],
      ['T-2', 'Подготовить смету по второму этапу', 'OPEN', null, null],
    ])
    expect(tasks.some((t) => t.title.includes('сервер'))).toBe(false)
    const t1 = (await getTaskDetail(graph, scope(), 'T-1'))!
    expect(t1.mentions).toEqual([
      expect.objectContaining({
        meeting_id: m1.meetingId,
        kind: 'CREATED',
        quote: 'Иванов отправит договор заказчику до пятнадцатого октября',
        start_ms: 3500,
        end_ms: 9100,
        speaker_label: 'Петров',
      }),
    ])
    expect(await listDecisions(graph, scope())).toMatchObject([{ code: 'D-1', text: 'Работаем по договору подряда', leads_to: ['T-1'] }])

    // every LLM step recorded as ProtocolGeneration(kind MEMORY_*); extract works on the transcript
    expect(generations.map((g) => g.kind)).toEqual(['MEMORY_EXTRACT', 'MEMORY_RESOLVE', 'MEMORY_SUMMARY'])
    expect(generations.every((g) => g.meetingId === m1.meetingId && g.promptVersion.length === 64)).toBe(true)
    const extractCall = llmCalls.find((c) => c.system === EXTRACT_SYSTEM)!
    expect(extractCall.user).toContain('[#1] [00:03] Петров: Иванов отправит договор')
    expect(extractCall.responseFormat).toBe('json')
  })

  it('AC-3 the provider gives meeting 2 a <project_memory> with T-1, T-2 and their codes', async () => {
    const provider = new Neo4jProjectMemoryProvider(graph, log, { maxChars: 20_000 })
    const previous: ProjectMemoryProvider = setProjectMemoryProvider(provider)
    try {
      // what protocol generation of meeting 2 does (WP-WORKER-01): ask the current provider
      const memory = await getProjectMemoryProvider().getPromptMemory(ids.projectId, ids.workspaceId)
      expect(memory).toContain('T-1 | Отправить договор заказчику | Иван Иванов | до 15.10 | open с встречи 1')
      expect(memory).toContain('T-2 | Подготовить смету по второму этапу | — | — | open с встречи 1')
      expect(memory).toContain('D-1 | Работаем по договору подряда (встреча 1)')
      expect(memory).toContain('Сводка проекта:\n# Сводка')
      const section = renderLlmContextSections({ project_memory: memory })
      expect(section.startsWith('<project_memory>\n')).toBe(true)
      expect(section).toContain('T-1 |')
      // a foreign workspace gets no memory
      expect(await provider.getPromptMemory(ids.projectId, uuid())).toBeNull()
    } finally {
      setProjectMemoryProvider(previous)
    }
  })

  it('AC-1/AC-2 meeting 2: «договор отправил» → PENDING closure of T-1, T-1 stays open; T-2 untouched; T-99 rejected', async () => {
    generations.length = 0
    const out = await runMemoryUpdate(deps, payload(m2.meetingId))
    expect(out).toMatchObject({ status: 'APPLIED', memoryVersion: 2, createdTasks: 0, pendingEvents: 1, rejected: 1, droppedQuotes: 0 })

    const t1 = (await getTaskDetail(graph, scope(), 'T-1'))!
    expect(t1.task.status).toBe('OPEN')
    expect(t1.task.pending_count).toBe(1)
    const closing = t1.events.filter((e) => e.meeting_id === m2.meetingId)
    expect(closing).toEqual([
      expect.objectContaining({ field: 'status', old_value: 'OPEN', new_value: 'DONE', review_state: 'PENDING', quote: 'договор отправил вчера вечером', source: 'LLM', confidence: 0.95 }),
    ])
    expect(t1.mentions.find((m) => m.meeting_id === m2.meetingId)).toMatchObject({ kind: 'STATUS_UPDATE', start_ms: 0, end_ms: 4000, speaker_label: 'Speaker 2' })

    const t2 = (await getTaskDetail(graph, scope(), 'T-2'))!
    expect(t2.events.filter((e) => e.meeting_id === m2.meetingId)).toEqual([])
    expect(t2.mentions.filter((m) => m.meeting_id === m2.meetingId)).toEqual([])

    expect((await listTasks(graph, scope())).map((t) => t.code)).toEqual(['T-1', 'T-2'])
    expect((await getReviewQueue(graph, scope())).count).toBe(1)
    const memory = await getProjectMemory(graph, scope())
    expect(memory.versions.map((v) => v.version)).toEqual([2, 1])
    expect(memory.current!.summary_md).toContain('встречи 2')
  })

  it('a re-delivered job for an applied meeting changes nothing and calls no LLM', async () => {
    const calls = llmCalls.length
    expect(await runMemoryUpdate(deps, payload(m2.meetingId))).toEqual({ status: 'ALREADY_APPLIED' })
    expect(llmCalls.length).toBe(calls)
  })

  it('a meeting deleted while the LLM steps run is not written back', async () => {
    const m3 = { ...m1, meetingId: uuid(), title: 'Планёрка 3' }
    let loads = 0
    const out = await runMemoryUpdate(
      { ...deps, loadMeeting: async () => (++loads === 1 ? m3 : null) },
      payload(m3.meetingId),
    )
    expect(out).toEqual({ status: 'SKIPPED', reason: 'meeting deleted or moved during the update' })
    expect((await getProjectMemory(graph, scope())).versions.map((v) => v.version)).toEqual([2, 1])
  })

  it('a meeting that no longer belongs to the project is skipped', async () => {
    const other = { ...payload(m1.meetingId), project_id: uuid() }
    expect(await runMemoryUpdate(deps, other)).toMatchObject({ status: 'SKIPPED' })
  })

  it('WP-WORKER-MEMORY-02 meeting 3: a re-worded decision adds a mention, not D-2; an unknown assignee → null + PENDING', async () => {
    const out = await runMemoryUpdate(deps, payload(hygiene.meetingId))
    expect(out).toMatchObject({ status: 'APPLIED', createdTasks: 1, createdDecisions: 0, pendingEvents: 1 })

    const decisions = await listDecisions(graph, scope())
    expect(decisions.map((d) => d.code)).toEqual(['D-1'])

    const t3 = (await getTaskDetail(graph, scope(), 'T-3'))!
    expect(t3.task.assignee).toBeNull()
    expect(t3.events.filter((e) => e.field === 'assignee')).toEqual([
      expect.objectContaining({ new_value: 'Сергей', review_state: 'PENDING', quote: 'исполнитель: Сергей' }),
    ])
  })
})
