/**
 * register(ctx) of the memory module (WP-BACKEND-06 module slot). BullMQ is mocked — no
 * Redis; Postgres is a fake Prisma; Neo4j is a fake connection.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import pino from 'pino'
import type { PrismaClient } from '@prisma/client'
import type { Job } from 'bullmq'

const queues: Array<{ name: string; opts: unknown; add: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> }> = []
const workers: Array<{ name: string; processor: (job: unknown) => Promise<void>; opts: unknown; close: ReturnType<typeof vi.fn> }> = []

vi.mock('bullmq', async (importOriginal) => {
  const real = await importOriginal<Record<string, unknown>>()
  class Queue {
    add = vi.fn(async () => undefined)
    close = vi.fn(async () => undefined)
    constructor(
      public name: string,
      public opts: unknown,
    ) {
      queues.push(this)
    }
  }
  class Worker {
    close = vi.fn(async () => undefined)
    on = vi.fn()
    constructor(
      public name: string,
      public processor: (job: unknown) => Promise<void>,
      public opts: unknown,
    ) {
      workers.push(this)
    }
  }
  return { ...real, Queue, Worker }
})

const { register, processMemoryJob, memoryJobId } = await import('./index.js')
const { loadWorkerModules, WorkerEventBus } = await import('../job-processor.js')
const { getProjectMemoryProvider, setProjectMemoryProvider, NoProjectMemoryProvider, PROJECT_MEMORY_QUEUE } = await import('@transcrib/shared')
const { KieAiLlmError } = await import('../llm/kieai.js')
const { UnrecoverableError } = await import('bullmq')

const log = pino({ level: 'silent' })
const MEETING = '33333333-3333-4333-8333-333333333333'
const PROJECT = '22222222-2222-4222-8222-222222222222'
const WS = '11111111-1111-4111-8111-111111111111'

function ctx() {
  const bus = new WorkerEventBus()
  const hooks: Array<() => unknown> = []
  const added: unknown[] = []
  const setProvider = vi.fn((p) => setProjectMemoryProvider(p))
  return {
    bus,
    hooks,
    added,
    setProvider,
    value: {
      connection: {},
      log,
      events: { on: bus.on.bind(bus) },
      addWorker: (w: unknown) => void added.push(w),
      onShutdown: (h: () => unknown) => void hooks.push(h),
      setProjectMemoryProvider: setProvider,
    } as unknown as Parameters<typeof register>[0],
  }
}

function fakePrisma(job: { status: string; meeting: { id: string; projectId: string | null; workspaceId: string | null } } | null) {
  return {
    protocolGenerationJob: { findUnique: vi.fn(async () => job) },
    graphOutbox: { findMany: vi.fn(async () => []), update: vi.fn() },
  } as unknown as PrismaClient
}

const fakeConnection = () => {
  const close = vi.fn(async () => undefined)
  return {
    close,
    connect: () => ({ graph: { driver: {} as never }, health: async () => ({ ok: true as const }), close }),
  }
}

beforeEach(() => {
  queues.length = 0
  workers.length = 0
  setProjectMemoryProvider(new NoProjectMemoryProvider())
})

describe('memory module register(ctx)', () => {
  it('without MEMORY_NEO4J_URI memory is off: no provider, no queue, no worker', async () => {
    const c = ctx()
    await register(c.value, { env: {} })
    expect(c.setProvider).not.toHaveBeenCalled()
    expect(getProjectMemoryProvider()).toBeInstanceOf(NoProjectMemoryProvider)
    expect(queues).toEqual([])
    expect(workers).toEqual([])
    expect(c.hooks).toEqual([])
  })

  it('with Neo4j: Neo4j provider, own queue + worker with FR-001 retries, shutdown order outbox → queue → driver', async () => {
    const c = ctx()
    const conn = fakeConnection()
    await register(c.value, {
      env: { MEMORY_NEO4J_URI: 'bolt://localhost:7688', MEMORY_OUTBOX_POLL_MS: '60000' },
      prisma: fakePrisma(null),
      connect: conn.connect,
    })
    expect(getProjectMemoryProvider().constructor.name).toBe('Neo4jProjectMemoryProvider')
    expect(queues.map((q) => q.name)).toEqual([PROJECT_MEMORY_QUEUE])
    expect(queues[0]!.opts).toMatchObject({ defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 5000 } } })
    expect(workers.map((w) => w.name)).toEqual([PROJECT_MEMORY_QUEUE])
    expect(c.added).toEqual([workers[0]])
    expect(c.hooks).toHaveLength(3)
    for (const h of c.hooks) await h()
    expect(queues[0]!.close).toHaveBeenCalled()
    expect(conn.close).toHaveBeenCalled()
  })

  it('protocolJobCompleted: queues DONE protocols of meetings with a project, once per meeting', async () => {
    const cases = [
      { job: { status: 'DONE', meeting: { id: MEETING, projectId: PROJECT, workspaceId: WS } }, queued: true },
      { job: { status: 'DONE', meeting: { id: MEETING, projectId: null, workspaceId: WS } }, queued: false },
      { job: { status: 'FAILED', meeting: { id: MEETING, projectId: PROJECT, workspaceId: WS } }, queued: false },
      { job: null, queued: false },
    ]
    for (const { job, queued } of cases) {
      queues.length = 0
      const c = ctx()
      await register(c.value, { env: { MEMORY_NEO4J_URI: 'bolt://x:1', MEMORY_OUTBOX_POLL_MS: '60000' }, prisma: fakePrisma(job), connect: fakeConnection().connect })
      c.bus.emit('protocolJobCompleted', { protocolGenerationJobId: 'pg-1' })
      await vi.waitFor(async () => {
        await new Promise((r) => setTimeout(r, 5))
        if (queued) expect(queues[0]!.add).toHaveBeenCalled()
      })
      if (queued) {
        expect(queues[0]!.add).toHaveBeenCalledWith(
          'update',
          { meeting_id: MEETING, project_id: PROJECT, workspace_id: WS },
          { jobId: memoryJobId(MEETING) },
        )
      } else {
        expect(queues[0]!.add).not.toHaveBeenCalled()
      }
      for (const h of c.hooks) await h()
    }
  })

  it('is picked up by loadWorkerModules from worker/src/memory (auto-registration)', async () => {
    const saved = process.env['MEMORY_NEO4J_URI']
    delete process.env['MEMORY_NEO4J_URI']
    try {
      const loaded = await loadWorkerModules({}, log, { baseDir: new URL('..', import.meta.url).pathname, events: new WorkerEventBus() })
      expect(loaded.names).toEqual(['memory'])
      expect(loaded.failed).toEqual([])
    } finally {
      if (saved !== undefined) process.env['MEMORY_NEO4J_URI'] = saved
    }
  })
})

describe('processMemoryJob', () => {
  const deps = { log } as never
  const job = (data: unknown) => ({ id: 'j', data }) as Job<unknown>

  it('an invalid payload is unrecoverable', async () => {
    await expect(processMemoryJob(deps, job({ meeting_id: 'x' }))).rejects.toBeInstanceOf(UnrecoverableError)
  })

  it('a permanent LLM error is unrecoverable, a transient one is retried by BullMQ', async () => {
    const payload = { meeting_id: MEETING, project_id: PROJECT, workspace_id: WS }
    const failing = (err: Error) =>
      ({
        log,
        loadMeeting: async () => {
          throw err
        },
      }) as never
    await expect(processMemoryJob(failing(new KieAiLlmError('401', { status: 401, isTransient: false })), job(payload))).rejects.toBeInstanceOf(
      UnrecoverableError,
    )
    const transient = new KieAiLlmError('503', { status: 503, isTransient: true })
    await expect(processMemoryJob(failing(transient), job(payload))).rejects.toBe(transient)
  })
})
