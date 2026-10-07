/**
 * WP-BACKEND-06 AC-4 (worker side) — a module folder with index.ts exporting register(ctx)
 * is picked up by loadWorkerModules() without editing index.ts / job-processor.ts.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import pino from 'pino'
import {
  getProjectMemoryProvider,
  setProjectMemoryProvider,
  NoProjectMemoryProvider,
} from '@transcrib/shared'
// Fake BullMQ Worker: records `on` handlers so a 'completed' event can be fired by hand.
const fakeWorkers = vi.hoisted(() => [] as Array<{ name: string; handlers: Record<string, (...a: unknown[]) => void> }>)
vi.mock('bullmq', () => ({
  Worker: class {
    handlers: Record<string, (...a: unknown[]) => void> = {}
    constructor(public name: string) {
      fakeWorkers.push(this as unknown as (typeof fakeWorkers)[number])
    }
    on(event: string, fn: (...a: unknown[]) => void) {
      this.handlers[event] = fn
      return this
    }
    async close() {}
  },
}))

import {
  createWorkers,
  loadWorkerModules,
  shutdownTargets,
  workerEvents,
  WorkerEventBus,
  WORKER_MODULES,
} from './job-processor.js'
import { QueueName } from './queues.js'

const log = pino({ level: 'silent' })
const connection = { host: 'localhost', port: 6379 }
const dirs: string[] = []
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
  setProjectMemoryProvider(new NoProjectMemoryProvider())
})

function moduleDir(name: string, source: string, file = 'index.ts'): string {
  const base = mkdtempSync(join(tmpdir(), 'worker-modules-'))
  dirs.push(base)
  mkdirSync(join(base, name))
  writeFileSync(join(base, name, file), source)
  return base
}

describe('loadWorkerModules', () => {
  it('the default module list is the project-memory module', () => {
    expect(WORKER_MODULES).toEqual(['memory'])
  })

  it('no module folder → nothing registered (today\'s production state)', async () => {
    const base = mkdtempSync(join(tmpdir(), 'worker-modules-'))
    dirs.push(base)
    expect(await loadWorkerModules(connection, log, { baseDir: base })).toEqual({ names: [], failed: [], workers: [], shutdownHooks: [] })
  })

  it('registers a present module: workers, shutdown hooks, events, memory provider', async () => {
    const base = moduleDir('memory', `
export async function register(ctx) {
  ctx.addWorker({ close: async () => {} })
  ctx.onShutdown(async () => { globalThis.__memoryClosed = true })
  ctx.events.on('protocolJobCompleted', (e) => { globalThis.__seen = e.protocolGenerationJobId })
  ctx.setProjectMemoryProvider({ getPromptMemory: async (p, w) => 'memory of ' + p + '@' + w })
  ctx.log.info('registered')
}
`, 'index.js')
    const events = new WorkerEventBus()
    const loaded = await loadWorkerModules(connection, log, { baseDir: base, events })
    expect(loaded.names).toEqual(['memory'])
    expect(loaded.workers).toHaveLength(1)
    expect(loaded.shutdownHooks).toHaveLength(1)

    events.emit('protocolJobCompleted', { protocolGenerationJobId: 'job-1' })
    expect((globalThis as Record<string, unknown>)['__seen']).toBe('job-1')
    expect(await getProjectMemoryProvider().getPromptMemory('p', 'w')).toBe('memory of p@w')
    await loaded.shutdownHooks[0]!()
    expect((globalThis as Record<string, unknown>)['__memoryClosed']).toBe(true)
  })

  it('loads a TypeScript module source (vitest / tsx) as well', async () => {
    const base = moduleDir('memory', `
import type { WorkerModuleContext } from '${join(import.meta.dirname, 'job-processor.js').replace(/\\/g, '/')}'
export async function register(ctx: WorkerModuleContext): Promise<void> {
  ctx.onShutdown(() => undefined)
}
`)
    const loaded = await loadWorkerModules(connection, log, { baseDir: base })
    expect(loaded.names).toEqual(['memory'])
    expect(loaded.shutdownHooks).toHaveLength(1)
  })

  it('a module without register() is skipped, not fatal', async () => {
    const base = moduleDir('memory', 'export const nope = 1', 'index.js')
    const loaded = await loadWorkerModules(connection, log, { baseDir: base })
    expect(loaded).toMatchObject({ names: [], failed: ['memory'], workers: [], shutdownHooks: [] })
  })

  it('a module whose register() throws is rolled back: workers closed, listeners removed, provider restored', async () => {
    const base = moduleDir('memory', `
export async function register(ctx) {
  ctx.addWorker({ close: async () => { globalThis.__closedOnRollback = true } })
  ctx.onShutdown(() => {})
  ctx.events.on('protocolJobCompleted', () => { globalThis.__leakedListener = true })
  ctx.setProjectMemoryProvider({ getPromptMemory: async () => 'leaked' })
  throw new Error('neo4j unreachable')
}
`, 'index.js')
    const events = new WorkerEventBus()
    const loaded = await loadWorkerModules(connection, log, { baseDir: base, events })
    expect(loaded).toMatchObject({ names: [], failed: ['memory'], workers: [], shutdownHooks: [] })
    expect((globalThis as Record<string, unknown>)['__closedOnRollback']).toBe(true)
    events.emit('protocolJobCompleted', { protocolGenerationJobId: 'j' })
    expect((globalThis as Record<string, unknown>)['__leakedListener']).toBeUndefined()
    expect(await getProjectMemoryProvider().getPromptMemory('p', 'w')).toBeNull()
  })

  it('a module that fails to import is skipped', async () => {
    const base = moduleDir('memory', 'import "definitely-not-a-package-xyz"; export function register() {}', 'index.js')
    expect((await loadWorkerModules(connection, log, { baseDir: base })).failed).toEqual(['memory'])
  })
})

describe('createWorkers → workerEvents', () => {
  it("a completed protocol job emits protocolJobCompleted with its ProtocolGenerationJob id", () => {
    createWorkers(connection, log)
    const protocolWorker = fakeWorkers.find((w) => w.name === QueueName.Protocol)!
    const seen: unknown[] = []
    const listener = (e: unknown) => { seen.push(e) }
    workerEvents.on('protocolJobCompleted', listener)
    try {
      protocolWorker.handlers['completed']!({ data: { protocol_generation_job_id: 'pgj-1' } })
    } finally {
      workerEvents.off('protocolJobCompleted', listener)
    }
    expect(seen).toEqual([{ protocolGenerationJobId: 'pgj-1' }])
    // the transcription worker publishes nothing
    expect(fakeWorkers.find((w) => w.name === QueueName.Transcription)!.handlers['completed']).toBeUndefined()
  })
})

describe('shutdownTargets', () => {
  it('without hooks it is exactly the workers (today\'s shutdown path)', () => {
    const w = [{ close: vi.fn(async () => {}) }]
    expect(shutdownTargets(w, [], log)).toBe(w)
  })

  it('module hooks run only after every worker has closed; a failing hook does not stop the rest', async () => {
    const order: string[] = []
    let release!: () => void
    const slow = new Promise<void>((r) => { release = r })
    const workers = [
      { close: vi.fn(async () => { await slow; order.push('worker-a closed') }) },
      { close: vi.fn(async () => { order.push('worker-b closed') }) },
    ]
    const targets = shutdownTargets(workers, [
      () => { order.push('hook-1'); throw new Error('boom') },
      async () => { order.push('hook-2') },
    ], log)
    expect(targets).toHaveLength(3)
    const all = Promise.all(targets.map((t) => t.close()))
    await new Promise((r) => setTimeout(r, 0))
    expect(order).not.toContain('hook-1')
    release()
    await all
    expect(order.indexOf('hook-1')).toBeGreaterThan(order.indexOf('worker-a closed'))
    expect(order.slice(-2)).toEqual(['hook-1', 'hook-2'])
  })
})

describe('WorkerEventBus', () => {
  it('a throwing or rejecting listener never breaks the emitter', async () => {
    const bus = new WorkerEventBus()
    const errors: unknown[] = []
    bus.onListenerError((err) => errors.push(err))
    const ok = vi.fn()
    bus.on('protocolJobCompleted', () => { throw new Error('sync') })
    bus.on('protocolJobCompleted', async () => { throw new Error('async') })
    bus.on('protocolJobCompleted', ok)
    expect(() => bus.emit('protocolJobCompleted', { protocolGenerationJobId: 'j' })).not.toThrow()
    await new Promise((r) => setTimeout(r, 0))
    expect(ok).toHaveBeenCalledWith({ protocolGenerationJobId: 'j' })
    expect(errors.map((e) => (e as Error).message).sort()).toEqual(['async', 'sync'])
  })
})
