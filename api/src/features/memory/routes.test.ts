/**
 * WP-API-MEMORY-01 — registry routes (FR-006). Fastify inject(); Prisma mocked in memory and
 * the Neo4j layer of @transcrib/shared/memory replaced by spies (the real queries are covered
 * on Neo4j by memory.neo4j.test.ts). Checks: scope comes from the access check (never from
 * the client), foreign = nonexistent = 404, error mapping (404/409/400/503), actor of manual
 * edits, memory off → 503 while the rest of the app answers.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { SESSION_COOKIE_NAME } from '@transcrib/shared'
import { buildApp } from '../../server.js'

vi.mock('../../plugins/sse.js', () => ({ ssePlugin: async () => {} }))
vi.mock('../../config.js', () => ({
  config: { PORT: 3000, HOST: '0.0.0.0', DATABASE_URL: 'postgresql://t:t@localhost:5432/t', REDIS_URL: 'redis://localhost:6379', LOG_LEVEL: 'silent', NODE_ENV: 'test' },
}))

const WS_A = '00000000-0000-4000-8000-00000000aaaa'
const WS_B = '00000000-0000-4000-8000-00000000bbbb'
const USER_ID = '00000000-0000-4000-8000-0000000000a1'
const PROJECT_A = '123e4567-e89b-42d3-a456-426614174101'
const PROJECT_B = '123e4567-e89b-42d3-a456-426614174102' // another workspace
const MEETING_A = '123e4567-e89b-42d3-a456-426614174201'
const MEETING_NO_PROJECT = '123e4567-e89b-42d3-a456-426614174202'
const PARTICIPANT_A = '123e4567-e89b-42d3-a456-426614174301'
const PARTICIPANT_B = '123e4567-e89b-42d3-a456-426614174302' // of project B
const EVENT = '123e4567-e89b-42d3-a456-426614174401'
const FOREIGN_EVENT = '123e4567-e89b-42d3-a456-426614174402'

vi.mock('../../db.js', () => ({
  prisma: {
    authSession: {
      findUnique: async () => ({
        id: 's1', userId: '00000000-0000-4000-8000-0000000000a1', lastSeenAt: new Date(), expiresAt: new Date(Date.now() + 1e9),
        user: { name: 'Анна', memberships: [{ workspaceId: '00000000-0000-4000-8000-00000000aaaa' }] },
      }),
      updateMany: async () => ({ count: 1 }),
    },
    project: {
      findFirst: async ({ where }: any) => {
        const ws: Record<string, string> = {
          '123e4567-e89b-42d3-a456-426614174101': '00000000-0000-4000-8000-00000000aaaa',
          '123e4567-e89b-42d3-a456-426614174102': '00000000-0000-4000-8000-00000000bbbb',
        }
        const w = ws[where.id]
        return w && where.workspaceId.in.includes(w) ? { id: where.id, workspaceId: w } : null
      },
    },
    meeting: {
      findFirst: async ({ where }: any) => {
        if (where.id === '123e4567-e89b-42d3-a456-426614174201')
          return { id: where.id, workspaceId: '00000000-0000-4000-8000-00000000aaaa', projectId: '123e4567-e89b-42d3-a456-426614174101' }
        if (where.id === '123e4567-e89b-42d3-a456-426614174202')
          return { id: where.id, workspaceId: '00000000-0000-4000-8000-00000000aaaa', projectId: null }
        return null
      },
    },
    projectParticipant: {
      findFirst: async ({ where }: any) =>
        where.id === '123e4567-e89b-42d3-a456-426614174301' && where.projectId === '123e4567-e89b-42d3-a456-426614174101'
          ? { id: where.id, name: 'Иванов' }
          : null,
    },
  },
}))

const mem = vi.hoisted(() => ({
  listTasks: vi.fn(),
  getTaskDetail: vi.fn(),
  patchTask: vi.fn(),
  listDecisions: vi.fn(),
  getProjectMemory: vi.fn(),
  getReviewQueue: vi.fn(),
  getMeetingMemoryRefs: vi.fn(),
  findTaskEventScope: vi.fn(),
  confirmTaskEvent: vi.fn(),
  rejectTaskEvent: vi.fn(),
}))
vi.mock('@transcrib/shared/memory', async (importOriginal) => ({ ...(await importOriginal<object>()), ...mem }))

const COOKIE = `${SESSION_COOKIE_NAME}=test-token`
const TASK = {
  id: '123e4567-e89b-42d3-a456-426614174501', code: 'T-1', title: 'Отправить КП', description: null, status: 'OPEN',
  assignee: null, due_date: null, merged_into: null, created_in_meeting_id: null, pending_count: 0, updated_at: '2026-05-01T10:00:00.000Z',
}
const EVENT_DTO = {
  id: EVENT, task_code: 'T-1', field: 'status', old_value: 'OPEN', new_value: 'DONE', valid_at: '2026-05-01T10:00:00.000Z',
  recorded_at: '2026-05-01T10:00:00.000Z', superseded_at: null, source: 'LLM', confidence: 0.8, reason: null,
  review_state: 'CONFIRMED', meeting_id: null, quote: null, author_user_id: null,
}
const DETAIL = { task: TASK, mentions: [], events: [] }

describe('WP-API-MEMORY-01 — project memory routes', () => {
  let app: FastifyInstance
  const call = (method: 'GET' | 'POST' | 'PATCH', url: string, payload?: unknown, cookie: string | null = COOKIE) =>
    app.inject({ method, url, ...(payload !== undefined ? { payload: payload as object } : {}), headers: cookie ? { cookie } : {} })

  beforeEach(async () => {
    vi.stubEnv('MEMORY_NEO4J_URI', 'bolt://127.0.0.1:1')
    for (const fn of Object.values(mem)) fn.mockReset()
    mem.listTasks.mockResolvedValue([TASK])
    mem.getTaskDetail.mockResolvedValue(DETAIL)
    mem.patchTask.mockResolvedValue(DETAIL)
    mem.listDecisions.mockResolvedValue([])
    mem.getProjectMemory.mockResolvedValue({ current: null, versions: [] })
    mem.getReviewQueue.mockResolvedValue({ items: [], count: 0 })
    mem.getMeetingMemoryRefs.mockResolvedValue({ project_id: PROJECT_A, tasks: [], decisions: [] })
    mem.findTaskEventScope.mockImplementation(async (_g: unknown, id: string, workspaceIds: string[]) =>
      id === EVENT && workspaceIds.includes(WS_A) ? { workspaceId: WS_A, projectId: PROJECT_A } : null)
    mem.confirmTaskEvent.mockResolvedValue({ event: EVENT_DTO, task: TASK })
    mem.rejectTaskEvent.mockResolvedValue({ event: { ...EVENT_DTO, review_state: 'REJECTED' }, task: TASK })
    app = await buildApp({ logLevel: 'silent' })
    await app.ready()
  })
  afterEach(async () => {
    await app.close()
    vi.unstubAllEnvs()
  })

  describe('reads', () => {
    it('lists tasks with the scope of the checked project and the filters of the query', async () => {
      const res = await call('GET', `/api/projects/${PROJECT_A}/tasks?status=OPEN&assignee=Иванов`)
      expect(res.statusCode).toBe(200)
      expect(res.json()).toEqual({ items: [TASK] })
      expect(mem.listTasks).toHaveBeenCalledWith(expect.anything(), { workspaceId: WS_A, projectId: PROJECT_A }, { status: 'OPEN', assignee: 'Иванов' })
    })

    it('a workspace_id in the query cannot move the scope', async () => {
      await call('GET', `/api/projects/${PROJECT_A}/tasks?workspace_id=${WS_B}`)
      expect(mem.listTasks.mock.calls[0]![1]).toEqual({ workspaceId: WS_A, projectId: PROJECT_A })
    })

    it('task detail, 404 for an unknown code, 400 for a malformed one', async () => {
      expect((await call('GET', `/api/projects/${PROJECT_A}/tasks/T-1`)).json()).toEqual(DETAIL)
      mem.getTaskDetail.mockResolvedValueOnce(null)
      const missing = await call('GET', `/api/projects/${PROJECT_A}/tasks/T-99`)
      expect(missing.statusCode).toBe(404)
      expect(missing.json()).toEqual({ code: 'NOT_FOUND', message: 'Не найдено' })
      expect((await call('GET', `/api/projects/${PROJECT_A}/tasks/X-1`)).statusCode).toBe(400)
    })

    it('decisions, memory summary and review queue', async () => {
      expect((await call('GET', `/api/projects/${PROJECT_A}/decisions`)).json()).toEqual({ items: [] })
      expect((await call('GET', `/api/projects/${PROJECT_A}/memory`)).json()).toEqual({ current: null, versions: [] })
      expect((await call('GET', `/api/projects/${PROJECT_A}/review-queue`)).json()).toEqual({ items: [], count: 0 })
    })

    it('memory-refs of a meeting; a meeting without a project answers empty without touching the graph', async () => {
      expect((await call('GET', `/api/meetings/${MEETING_A}/memory-refs`)).json()).toEqual({ project_id: PROJECT_A, tasks: [], decisions: [] })
      expect(mem.getMeetingMemoryRefs.mock.calls[0]![1]).toEqual({ workspaceId: WS_A, projectId: PROJECT_A })
      mem.getMeetingMemoryRefs.mockClear()
      expect((await call('GET', `/api/meetings/${MEETING_NO_PROJECT}/memory-refs`)).json()).toEqual({ project_id: null, tasks: [], decisions: [] })
      expect(mem.getMeetingMemoryRefs).not.toHaveBeenCalled()
    })
  })

  describe('isolation', () => {
    it("a foreign project answers the same 404 as a nonexistent one, on every route; the graph is never queried", async () => {
      const nonexistent = '123e4567-e89b-42d3-a456-4266141749ff'
      const routes: Array<['GET' | 'PATCH', string, unknown?]> = [
        ['GET', 'tasks'], ['GET', 'tasks/T-1'], ['PATCH', 'tasks/T-1', { status: 'DONE' }],
        ['GET', 'decisions'], ['GET', 'memory'], ['GET', 'review-queue'],
      ]
      for (const [method, path, body] of routes) {
        const foreign = await call(method, `/api/projects/${PROJECT_B}/${path}`, body)
        const missing = await call(method, `/api/projects/${nonexistent}/${path}`, body)
        expect(foreign.statusCode, path).toBe(404)
        expect(foreign.json(), path).toEqual(missing.json())
      }
      expect((await call('GET', '/api/meetings/123e4567-e89b-42d3-a456-4266141749ff/memory-refs')).statusCode).toBe(404)
      for (const fn of Object.values(mem)) expect(fn).not.toHaveBeenCalled()
    })

    it('an event of another workspace is a 404 and is neither confirmed nor rejected', async () => {
      for (const action of ['confirm', 'reject']) {
        const res = await call('POST', `/api/task-events/${FOREIGN_EVENT}/${action}`)
        expect(res.statusCode).toBe(404)
        expect(res.json()).toEqual({ code: 'NOT_FOUND', message: 'Не найдено' })
      }
      expect(mem.findTaskEventScope.mock.calls[0]![2]).toEqual([WS_A])
      expect(mem.confirmTaskEvent).not.toHaveBeenCalled()
      expect(mem.rejectTaskEvent).not.toHaveBeenCalled()
    })

    it('without a session the routes answer 401 (AUTH_REQUIRED) or the legacy workspace only', async () => {
      const res = await call('POST', `/api/task-events/${EVENT}/confirm`, undefined, null)
      // no cookie → legacy principal (workspace «Роман»), which owns no event of WS_A
      expect(res.statusCode).toBe(404)
      expect(mem.findTaskEventScope.mock.calls[0]![2]).toEqual(['00000000-0000-4000-8000-000000000001'])
    })
  })

  describe('review of PENDING events', () => {
    it('confirm and reject run in the event\'s own scope, as the signed-in user', async () => {
      const ok = await call('POST', `/api/task-events/${EVENT}/confirm`)
      expect(ok.statusCode).toBe(200)
      expect(mem.confirmTaskEvent).toHaveBeenCalledWith(expect.anything(), { workspaceId: WS_A, projectId: PROJECT_A }, EVENT, { userId: USER_ID })
      const rej = await call('POST', `/api/task-events/${EVENT}/reject`)
      expect(rej.json().event.review_state).toBe('REJECTED')
      expect(mem.rejectTaskEvent).toHaveBeenCalledWith(expect.anything(), { workspaceId: WS_A, projectId: PROJECT_A }, EVENT, { userId: USER_ID })
    })

    it('a repeat answers 409 TASK_EVENT_ALREADY_REVIEWED', async () => {
      const { TaskEventAlreadyReviewedError } = await import('@transcrib/shared/memory')
      mem.confirmTaskEvent.mockRejectedValueOnce(new TaskEventAlreadyReviewedError(EVENT, 'CONFIRMED'))
      const res = await call('POST', `/api/task-events/${EVENT}/confirm`)
      expect(res.statusCode).toBe(409)
      expect(res.json().code).toBe('TASK_EVENT_ALREADY_REVIEWED')
    })

    it('a confirmed status change the task no longer allows answers 400 TASK_STATUS_TRANSITION', async () => {
      const { TaskStatusTransitionError } = await import('@transcrib/shared/memory')
      mem.confirmTaskEvent.mockRejectedValueOnce(new TaskStatusTransitionError('DONE', 'IN_PROGRESS'))
      const res = await call('POST', `/api/task-events/${EVENT}/confirm`)
      expect(res.statusCode).toBe(400)
      expect(res.json().code).toBe('TASK_STATUS_TRANSITION')
    })

    it('a malformed event id is a 400', async () => {
      expect((await call('POST', '/api/task-events/not-a-uuid/confirm')).statusCode).toBe(400)
    })
  })

  describe('manual edit', () => {
    it('maps the body to a patch and records the signed-in user', async () => {
      const res = await call('PATCH', `/api/projects/${PROJECT_A}/tasks/T-1`, {
        status: 'DONE', due_date: '2026-06-01', assignee_participant_id: PARTICIPANT_A,
      })
      expect(res.statusCode).toBe(200)
      expect(mem.patchTask).toHaveBeenCalledWith(
        expect.anything(), { workspaceId: WS_A, projectId: PROJECT_A }, 'T-1',
        { status: 'DONE', dueDate: '2026-06-01', assignee: { participantId: PARTICIPANT_A, name: 'Иванов' } },
        { userId: USER_ID },
      )
    })

    it('null unassigns; only the fields sent are passed', async () => {
      await call('PATCH', `/api/projects/${PROJECT_A}/tasks/T-1`, { assignee_participant_id: null })
      expect(mem.patchTask.mock.calls[0]![3]).toEqual({ assignee: null })
    })

    it("a participant of another project is a 404 and nothing is written", async () => {
      const res = await call('PATCH', `/api/projects/${PROJECT_A}/tasks/T-1`, { assignee_participant_id: PARTICIPANT_B })
      expect(res.statusCode).toBe(404)
      expect(mem.patchTask).not.toHaveBeenCalled()
    })

    it('an invalid transition is a 400; an empty or malformed body is a 400', async () => {
      const { TaskStatusTransitionError } = await import('@transcrib/shared/memory')
      mem.patchTask.mockRejectedValueOnce(new TaskStatusTransitionError('DONE', 'IN_PROGRESS'))
      const bad = await call('PATCH', `/api/projects/${PROJECT_A}/tasks/T-1`, { status: 'IN_PROGRESS' })
      expect(bad.statusCode).toBe(400)
      expect(bad.json().code).toBe('TASK_STATUS_TRANSITION')
      expect((await call('PATCH', `/api/projects/${PROJECT_A}/tasks/T-1`, {})).statusCode).toBe(400)
      expect((await call('PATCH', `/api/projects/${PROJECT_A}/tasks/T-1`, { status: 'NOPE' })).statusCode).toBe(400)
    })

    it('an unknown task is a 404', async () => {
      const { MemoryNotFoundError } = await import('@transcrib/shared/memory')
      mem.patchTask.mockRejectedValueOnce(new MemoryNotFoundError('task T-9'))
      expect((await call('PATCH', `/api/projects/${PROJECT_A}/tasks/T-9`, { status: 'DONE' })).statusCode).toBe(404)
    })
  })

  describe('Neo4j unavailable', () => {
    it('a graph failure answers 503 MEMORY_UNAVAILABLE', async () => {
      mem.listTasks.mockRejectedValueOnce(new Error('connect ECONNREFUSED'))
      const res = await call('GET', `/api/projects/${PROJECT_A}/tasks`)
      expect(res.statusCode).toBe(503)
      expect(res.json()).toEqual({ code: 'MEMORY_UNAVAILABLE', message: 'Память проекта временно недоступна' })
      mem.findTaskEventScope.mockRejectedValueOnce(new Error('timeout'))
      expect((await call('POST', `/api/task-events/${EVENT}/confirm`)).statusCode).toBe(503)
    })

    it('MEMORY_NEO4J_URI unset: 503 on memory routes, the rest of the app works', async () => {
      vi.stubEnv('MEMORY_NEO4J_URI', '')
      const res = await call('GET', `/api/projects/${PROJECT_A}/decisions`)
      expect(res.statusCode).toBe(503)
      expect(res.json().code).toBe('MEMORY_UNAVAILABLE')
      expect(mem.listDecisions).not.toHaveBeenCalled()
      expect((await call('GET', '/api/health')).statusCode).toBe(200)
    })
  })
})
