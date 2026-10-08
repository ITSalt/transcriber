/**
 * WP-API-MEMORY-01 AC-1 — the registry over HTTP on a real Neo4j (CI service of WP-INFRA-01,
 * or a local memory-neo4j with MEMORY_NEO4J_URI set). Skipped when MEMORY_NEO4J_URI is unset.
 * Prisma is mocked (project / meeting / participant lookups only); the graph is real and is
 * seeded through the shared write path the worker uses. Random ids per run, cleaned afterwards.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'
import neo4j, { type Driver } from 'neo4j-driver'
import { SESSION_COOKIE_NAME } from '@transcrib/shared'
import {
  applyMemoryGraphMigrations,
  deleteProjectFromGraph,
  writeMeetingUpdate,
  type MeetingUpdatePlan,
  type MemoryGraph,
} from '@transcrib/shared/memory'

vi.mock('../../plugins/sse.js', () => ({ ssePlugin: async () => {} }))
vi.mock('../../config.js', () => ({
  config: { PORT: 3000, HOST: '0.0.0.0', DATABASE_URL: 'postgresql://t:t@localhost:5432/t', REDIS_URL: 'redis://localhost:6379', LOG_LEVEL: 'silent', NODE_ENV: 'test' },
}))

const uuid = () => (globalThis as unknown as { crypto: { randomUUID(): string } }).crypto.randomUUID()
const ids = vi.hoisted(() => ({
  wsA: '', wsB: '', projectA: '', projectB: '', meeting1: '', meeting2: '', ivanov: '', petrov: '',
}))
ids.wsA = uuid(); ids.wsB = uuid(); ids.projectA = uuid(); ids.projectB = uuid()
ids.meeting1 = uuid(); ids.meeting2 = uuid(); ids.ivanov = uuid(); ids.petrov = uuid()

vi.mock('../../db.js', () => ({
  prisma: {
    authSession: {
      findUnique: async () => ({
        id: 's1', userId: '00000000-0000-4000-8000-0000000000a1', lastSeenAt: new Date(), expiresAt: new Date(Date.now() + 1e9),
        user: { name: 'Анна', memberships: [{ workspaceId: ids.wsA }] },
      }),
      updateMany: async () => ({ count: 1 }),
    },
    project: {
      findFirst: async ({ where }: any) => {
        const ws: Record<string, string> = { [ids.projectA]: ids.wsA, [ids.projectB]: ids.wsB }
        const w = ws[where.id]
        return w && where.workspaceId.in.includes(w) ? { id: where.id, workspaceId: w } : null
      },
    },
    meeting: {
      findFirst: async ({ where }: any) =>
        [ids.meeting1, ids.meeting2].includes(where.id) ? { id: where.id, workspaceId: ids.wsA, projectId: ids.projectA } : null,
    },
    projectParticipant: {
      findFirst: async ({ where }: any) =>
        where.projectId === ids.projectA && where.id === ids.petrov ? { id: where.id, name: 'Петров' } : null,
    },
  },
}))

import { buildApp } from '../../server.js'

const URI = process.env['MEMORY_NEO4J_URI']

describe.skipIf(!URI)('WP-API-MEMORY-01 on Neo4j', { timeout: 60_000 }, () => {
  let app: FastifyInstance
  let driver: Driver
  let graph: MemoryGraph
  const cookie = `${SESSION_COOKIE_NAME}=t`
  const closeEventId = uuid()
  const get = (url: string) => app.inject({ method: 'GET', url, headers: { cookie } })
  const send = (method: 'POST' | 'PATCH', url: string, payload?: object) =>
    app.inject({ method, url, headers: { cookie }, ...(payload ? { payload } : {}) })

  beforeAll(async () => {
    driver = neo4j.driver(URI!, neo4j.auth.basic(process.env['MEMORY_NEO4J_USER'] ?? 'neo4j', process.env['MEMORY_NEO4J_PASSWORD'] ?? ''))
    graph = { driver, database: process.env['MEMORY_NEO4J_DATABASE'] || undefined }
    await applyMemoryGraphMigrations(graph)

    const scope = { workspaceId: ids.wsA, projectId: ids.projectA }
    const ev = (field: 'title' | 'status' | 'assignee', newValue: string, extra = {}) => ({
      id: uuid(), field, oldValue: null, newValue, reviewState: 'AUTO' as const, confidence: 0.9, reason: 'new', quote: 'Иванов отправит договор', ...extra,
    })
    const mention = (quote: string, kind: 'CREATED' | 'STATUS_UPDATE' = 'CREATED') => ({ quote, startMs: 1000, endMs: 4000, speakerLabel: 'Speaker 1', kind })
    const plan1: MeetingUpdatePlan = {
      meeting: { id: ids.meeting1, title: 'Встреча 1', occurredAt: '2026-10-01T10:00:00.000Z' },
      participants: [{ id: ids.ivanov, name: 'Иванов' }],
      expected: { taskSeq: 0, decisionSeq: 0, meetingSeq: 0, memoryVersion: 0 },
      newTasks: [
        { id: uuid(), code: 'T-1', seq: 1, mention: mention('Иванов отправит договор'), events: [ev('title', 'Отправить договор'), ev('status', 'OPEN'), ev('assignee', 'Иванов', { newParticipantId: ids.ivanov })] },
        { id: uuid(), code: 'T-2', seq: 2, mention: mention('нужна смета'), events: [ev('title', 'Подготовить смету'), ev('status', 'OPEN')] },
      ],
      taskUpdates: [],
      newDecisions: [{ id: uuid(), code: 'D-1', seq: 1, text: 'Работаем по договору подряда', mention: { quote: 'по договору подряда', startMs: 5000, endMs: 7000, speakerLabel: null }, leadsTo: ['T-1'], supersedes: null }],
      decisionMentions: [],
      memory: { id: uuid(), summaryMd: '# Сводка\nДоговор подряда.' },
      now: '2026-10-01T12:00:00.000Z',
    }
    await writeMeetingUpdate(graph, scope, plan1)
    const plan2: MeetingUpdatePlan = {
      meeting: { id: ids.meeting2, title: 'Встреча 2', occurredAt: '2026-10-08T10:00:00.000Z' },
      participants: [{ id: ids.ivanov, name: 'Иванов' }],
      expected: { taskSeq: 2, decisionSeq: 1, meetingSeq: 1, memoryVersion: 1 },
      newTasks: [],
      taskUpdates: [{
        code: 'T-1',
        mentions: [mention('договор отправил', 'STATUS_UPDATE')],
        events: [{ id: closeEventId, field: 'status', oldValue: 'OPEN', newValue: 'DONE', reviewState: 'PENDING', confidence: 0.95, reason: 'отправил', quote: 'договор отправил' }],
      }],
      newDecisions: [],
      decisionMentions: [{ code: 'D-1', mention: { quote: 'по договору подряда', startMs: 0, endMs: 1000, speakerLabel: null } }],
      memory: { id: uuid(), summaryMd: '# Сводка v2' },
      now: '2026-10-08T12:00:00.000Z',
    }
    await writeMeetingUpdate(graph, scope, plan2)

    vi.stubEnv('MEMORY_NEO4J_URI', URI!)
    app = await buildApp({ logLevel: 'silent' })
    await app.ready()
  }, 60_000)

  afterAll(async () => {
    await app?.close()
    await deleteProjectFromGraph(graph, { workspaceId: ids.wsA, projectId: ids.projectA })
    await driver.close()
    vi.unstubAllEnvs()
  }, 60_000)

  it('lists tasks with filters', async () => {
    const all = (await get(`/api/projects/${ids.projectA}/tasks`)).json()
    expect(all.items.map((t: any) => [t.code, t.status, t.pending_count])).toEqual([['T-1', 'OPEN', 1], ['T-2', 'OPEN', 0]])
    const byName = (await get(`/api/projects/${ids.projectA}/tasks?assignee=${encodeURIComponent('иванов')}`)).json()
    expect(byName.items.map((t: any) => t.code)).toEqual(['T-1'])
    expect((await get(`/api/projects/${ids.projectA}/tasks?status=DONE`)).json().items).toEqual([])
  })

  it('task history with mentions; decisions; summary with versions; review queue', async () => {
    const detail = (await get(`/api/projects/${ids.projectA}/tasks/T-1`)).json()
    expect(detail.mentions.map((m: any) => [m.meeting_title, m.kind])).toEqual([['Встреча 1', 'CREATED'], ['Встреча 2', 'STATUS_UPDATE']])
    expect(detail.events.some((e: any) => e.id === closeEventId && e.review_state === 'PENDING')).toBe(true)
    expect((await get(`/api/projects/${ids.projectA}/tasks/T-99`)).statusCode).toBe(404)

    expect((await get(`/api/projects/${ids.projectA}/decisions`)).json().items).toMatchObject([{ code: 'D-1', leads_to: ['T-1'] }])
    const memory = (await get(`/api/projects/${ids.projectA}/memory`)).json()
    expect(memory.current).toMatchObject({ version: 2, summary_md: '# Сводка v2' })
    expect(memory.versions.map((v: any) => v.version)).toEqual([2, 1])
    const queue = (await get(`/api/projects/${ids.projectA}/review-queue`)).json()
    expect(queue.count).toBe(1)
    expect(queue.items[0]).toMatchObject({ event: { id: closeEventId }, task: { code: 'T-1' }, meeting_title: 'Встреча 2' })
  })

  it('memory-refs of a meeting', async () => {
    const refs = (await get(`/api/meetings/${ids.meeting2}/memory-refs`)).json()
    expect(refs).toMatchObject({ project_id: ids.projectA, tasks: [{ code: 'T-1' }], decisions: [{ code: 'D-1' }] })
  })

  it('another workspace: its project is a 404 and its events cannot be touched', async () => {
    expect((await get(`/api/projects/${ids.projectB}/tasks`)).statusCode).toBe(404)
    // the event exists only in workspace A's graph; a caller of workspace B would not see it —
    // here the caller is a member of A, so check the unknown-event path instead
    expect((await send('POST', `/api/task-events/${uuid()}/confirm`)).statusCode).toBe(404)
  })

  it('manual edit: an invalid transition → 400; a valid one is a USER event; foreign participant → 404', async () => {
    const edit = await send('PATCH', `/api/projects/${ids.projectA}/tasks/T-2`, { status: 'IN_PROGRESS', due_date: '2026-11-01', assignee_participant_id: ids.petrov })
    expect(edit.statusCode, edit.body).toBe(200)
    expect(edit.json().task).toMatchObject({ status: 'IN_PROGRESS', due_date: '2026-11-01', assignee: { participant_id: ids.petrov, name: 'Петров' } })
    const users = edit.json().events.filter((e: any) => e.source === 'USER')
    expect(users.map((e: any) => [e.field, e.review_state, e.author_user_id])).toEqual(
      expect.arrayContaining([['status', 'CONFIRMED', '00000000-0000-4000-8000-0000000000a1']]),
    )

    await send('PATCH', `/api/projects/${ids.projectA}/tasks/T-2`, { status: 'DONE' })
    const bad = await send('PATCH', `/api/projects/${ids.projectA}/tasks/T-2`, { status: 'POSTPONED' })
    expect(bad.statusCode).toBe(400)
    expect(bad.json().code).toBe('TASK_STATUS_TRANSITION')
    expect((await send('PATCH', `/api/projects/${ids.projectA}/tasks/T-2`, { assignee_participant_id: ids.ivanov })).statusCode).toBe(404)
  })

  it('reject keeps the task and the history; confirm applies; a repeat → 409', async () => {
    const rej = await send('POST', `/api/task-events/${closeEventId}/reject`)
    expect(rej.statusCode, rej.body).toBe(200)
    expect(rej.json()).toMatchObject({ event: { id: closeEventId, review_state: 'REJECTED' }, task: { code: 'T-1', status: 'OPEN' } })
    const again = await send('POST', `/api/task-events/${closeEventId}/confirm`)
    expect(again.statusCode).toBe(409)
    expect(again.json().code).toBe('TASK_EVENT_ALREADY_REVIEWED')
    expect((await get(`/api/projects/${ids.projectA}/review-queue`)).json().count).toBe(0)
    expect((await get(`/api/projects/${ids.projectA}/tasks/T-1`)).json().events.some((e: any) => e.id === closeEventId)).toBe(true)
  })

  it('confirm applies a PENDING change to the task', async () => {
    const scope = { workspaceId: ids.wsA, projectId: ids.projectA }
    const confirmId = uuid()
    await writeMeetingUpdate(graph, scope, {
      meeting: { id: uuid(), title: 'Встреча 3', occurredAt: '2026-10-15T10:00:00.000Z' },
      participants: [],
      expected: { taskSeq: 2, decisionSeq: 1, meetingSeq: 2, memoryVersion: 2 },
      newTasks: [], decisionMentions: [], newDecisions: [],
      taskUpdates: [{
        code: 'T-1',
        mentions: [{ quote: 'готово', startMs: 0, endMs: 1000, speakerLabel: null, kind: 'STATUS_UPDATE' }],
        events: [{ id: confirmId, field: 'status', oldValue: 'OPEN', newValue: 'DONE', reviewState: 'PENDING', confidence: 0.9, reason: 'готово', quote: 'готово' }],
      }],
      memory: { id: uuid(), summaryMd: '# Сводка v3' },
      now: '2026-10-15T12:00:00.000Z',
    })
    const ok = await send('POST', `/api/task-events/${confirmId}/confirm`)
    expect(ok.statusCode, ok.body).toBe(200)
    expect(ok.json()).toMatchObject({ event: { id: confirmId, review_state: 'CONFIRMED' }, task: { code: 'T-1', status: 'DONE' } })
  })
})
