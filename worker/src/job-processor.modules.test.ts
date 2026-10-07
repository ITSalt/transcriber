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
import { loadWorkerModules, WorkerEventBus, WORKER_MODULES } from './job-processor.js'

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
    expect(await loadWorkerModules(connection, log, { baseDir: base })).toEqual({ names: [], workers: [], shutdownHooks: [] })
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

  it('fails loudly when index has no register()', async () => {
    const base = moduleDir('memory', 'export const nope = 1', 'index.js')
    await expect(loadWorkerModules(connection, log, { baseDir: base })).rejects.toThrow(/memory.*register/)
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
