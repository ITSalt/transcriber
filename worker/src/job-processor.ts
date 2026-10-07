/**
 * TECH-006 — Job processor
 *
 * Wires real pipeline handlers:
 *   - UC-200: processTranscriptionJob (worker/src/jobs/transcription.ts)
 *   - UC-300: processProtocolJob (stub, implemented in UC-300)
 *
 * Concurrency = 1 per NFR-009 (one video at a time per worker instance).
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { Worker, type Job, type ConnectionOptions } from 'bullmq'
import type { Logger } from 'pino'
import { QueueName } from './queues.js'
import type { TranscriptionJobPayload, ProtocolGenerationJobPayload, ProjectMemoryProvider } from '@transcrib/shared'
import { getProjectMemoryProvider, setProjectMemoryProvider } from '@transcrib/shared'
import { processTranscriptionJob as runTranscriptionPipeline } from './jobs/transcription.js'
import { processProtocolGenerationJob as runProtocolPipeline } from './jobs/protocol-generation.js'

export const CONCURRENCY = 1

/**
 * How long a worker holds a job's lock before BullMQ considers it stalled, in ms.
 *
 * Previously unset, i.e. BullMQ's 30 s default with a heartbeat every 15 s. Both
 * pipelines make long synchronous-looking provider calls (ffmpeg extraction into
 * a single Buffer, then a Deepgram request now budgeted at 570 s), and any stretch
 * that blocks the event loop past the renewal window makes BullMQ re-deliver the
 * job as stalled. That is not merely wasteful: a re-delivered job re-runs the
 * whole ASR/LLM call, so a false stall costs a duplicate provider charge.
 *
 * 60 s (renewed every 30 s) leaves generous headroom for a `Buffer.concat` of a
 * few hundred MB while still detecting a genuinely dead worker quickly. Recovery
 * of a real stall is safe now that both pipelines re-claim a PROCESSING row
 * (RC-UC-200 / RC-UC-300 recovery_procedure).
 */
export const LOCK_DURATION_MS = 60_000

/**
 * UC-200: Transcription pipeline handler.
 * Delegates to the real pipeline in jobs/transcription.ts.
 */
export async function processTranscriptionJob(
  job: Job<TranscriptionJobPayload>,
  log: Logger,
): Promise<void> {
  await runTranscriptionPipeline(job, log)
}

/**
 * UC-300: Protocol generation pipeline handler.
 * Delegates to the real pipeline in jobs/protocol-generation.ts.
 */
export async function processProtocolJob(
  job: Job<ProtocolGenerationJobPayload>,
  log: Logger,
): Promise<void> {
  await runProtocolPipeline(job, log)
}

/**
 * Creates BullMQ Worker instances for all queues.
 *
 * @param connection - Redis connection options
 * @param log - Pino logger
 * @returns Array of started Worker instances
 */
export function createWorkers(connection: ConnectionOptions, log: Logger): Worker[] {
  const transcriptionWorker = new Worker<TranscriptionJobPayload>(
    QueueName.Transcription,
    (job) => processTranscriptionJob(job, log),
    { connection, concurrency: CONCURRENCY, lockDuration: LOCK_DURATION_MS },
  )

  const protocolWorker = new Worker<ProtocolGenerationJobPayload>(
    QueueName.Protocol,
    (job) => processProtocolJob(job, log),
    { connection, concurrency: CONCURRENCY, lockDuration: LOCK_DURATION_MS },
  )

  transcriptionWorker.on('failed', (job, err) => {
    log.error(
      { jobId: job?.id, queue: QueueName.Transcription, error_reason: err.message },
      'transcriptionJob failed',
    )
  })

  protocolWorker.on('failed', (job, err) => {
    log.error(
      { jobId: job?.id, queue: QueueName.Protocol, error_reason: err.message },
      'protocolGenerationJob failed',
    )
  })

  protocolWorker.on('completed', (job) => {
    workerEvents.emit('protocolJobCompleted', { protocolGenerationJobId: job.data.protocol_generation_job_id })
  })

  return [transcriptionWorker, protocolWorker]
}

// ─── WP-BACKEND-06 (D-15): worker modules ─────────────────────────────────────
//
// A module is a folder worker/src/<name>/ with index.ts (compiled: index.js) that exports
//   export async function register(ctx: WorkerModuleContext): Promise<void>
// It declares its OWN queues and workers (new Queue/Worker with ctx.connection), hands
// every Worker to ctx.addWorker() so graceful shutdown closes it, subscribes to pipeline
// events through ctx.events, and registers cleanup (e.g. closing the Neo4j driver) with
// ctx.onShutdown() — run after every worker has closed, before Prisma disconnects.
// WORKER_MODULES lists the folders; a listed folder that does not exist is skipped, so
// worker/src/memory/ (WP-WORKER-MEMORY-01) is picked up as soon as it lands.

export const WORKER_MODULES = ['memory'] as const

/**
 * A module's import + register() must finish within this time. Modules load BEFORE the
 * core workers start, so a register() that hangs (e.g. waiting on an unreachable Neo4j)
 * must not keep transcription and protocols from running (ADR-013).
 */
export const MODULE_REGISTER_TIMEOUT_MS = 15_000

export interface ProtocolJobCompletedEvent {
  /** ProtocolGenerationJob.id — resolve meeting / project / workspace from it */
  protocolGenerationJobId: string
}

export interface WorkerEvents {
  /**
   * A protocol-generation BullMQ job finished without throwing. It ALSO fires when the
   * pipeline returned early on a job that was already DONE or FAILED, so listeners must
   * check ProtocolGenerationJob.status === 'DONE' themselves before acting.
   */
  protocolJobCompleted: ProtocolJobCompletedEvent
}

type Listener<T> = (event: T) => void | Promise<void>

/**
 * Tiny typed event bus. A failing listener never breaks the emitting pipeline: its error
 * goes to the handler set with onListenerError (index.ts logs it).
 */
export class WorkerEventBus {
  private readonly listeners = new Map<keyof WorkerEvents, Listener<never>[]>()
  private onError: (err: unknown, event: keyof WorkerEvents) => void = () => {}

  onListenerError(handler: (err: unknown, event: keyof WorkerEvents) => void): void {
    this.onError = handler
  }

  on<K extends keyof WorkerEvents>(event: K, listener: Listener<WorkerEvents[K]>): void {
    const list = this.listeners.get(event) ?? []
    list.push(listener as Listener<never>)
    this.listeners.set(event, list)
  }

  off<K extends keyof WorkerEvents>(event: K, listener: Listener<WorkerEvents[K]>): void {
    const list = this.listeners.get(event) ?? []
    this.listeners.set(event, list.filter((l) => l !== (listener as Listener<never>)))
  }

  emit<K extends keyof WorkerEvents>(event: K, payload: WorkerEvents[K]): void {
    for (const listener of this.listeners.get(event) ?? []) {
      try {
        void Promise.resolve((listener as Listener<WorkerEvents[K]>)(payload)).catch((err: unknown) =>
          this.onError(err, event),
        )
      } catch (err) {
        this.onError(err, event)
      }
    }
  }
}

/** Process-wide bus the core pipelines emit on (see createWorkers). */
export const workerEvents = new WorkerEventBus()

export interface WorkerModuleContext {
  connection: ConnectionOptions
  log: Logger
  events: Pick<WorkerEventBus, 'on'>
  /** Keep a module-owned BullMQ Worker for graceful shutdown. */
  addWorker(worker: Worker): void
  /** Cleanup run on SIGTERM/SIGINT after all workers closed. */
  onShutdown(hook: () => Promise<void> | void): void
  /** Replace the <project_memory> provider used by protocol generation. */
  setProjectMemoryProvider(provider: ProjectMemoryProvider): void
}

export interface LoadedWorkerModules {
  names: string[]
  /** modules that failed to load or register — skipped, the core pipelines run on */
  failed: string[]
  workers: Worker[]
  shutdownHooks: Array<() => Promise<void> | void>
}

/**
 * Imports and registers every present worker module. Called BEFORE createWorkers(), so a
 * module's provider is in place before the first job is taken.
 *
 * A module is optional by design (ADR-013: nothing else depends on project memory), so a
 * module whose import or register() fails or exceeds the timeout is logged and rolled
 * back — its workers closed, its listeners removed, the previous ProjectMemoryProvider
 * restored, the shutdown hooks it registered run once — and the worker process keeps
 * serving transcription and protocols.
 *
 * @param baseDir directory that holds the module folders (default: this file's directory)
 */
export async function loadWorkerModules(
  connection: ConnectionOptions,
  log: Logger,
  options: {
    baseDir?: string
    modules?: readonly string[]
    events?: WorkerEventBus
    /** max time for one module's import + register(); default MODULE_REGISTER_TIMEOUT_MS */
    timeoutMs?: number
  } = {},
): Promise<LoadedWorkerModules> {
  const baseDir = options.baseDir ?? fileURLToPath(new URL('.', import.meta.url))
  const bus = options.events ?? workerEvents
  const timeoutMs = options.timeoutMs ?? MODULE_REGISTER_TIMEOUT_MS
  const loaded: LoadedWorkerModules = { names: [], failed: [], workers: [], shutdownHooks: [] }

  for (const name of options.modules ?? WORKER_MODULES) {
    const file = ['index.js', 'index.ts'].map((f) => join(baseDir, name, f)).find((p) => existsSync(p))
    if (!file) continue

    const workers: Worker[] = []
    const hooks: Array<() => Promise<void> | void> = []
    const unsubscribe: Array<() => void> = []
    const providerBefore = getProjectMemoryProvider()
    // After a rollback the module may still be running (a register() that timed out):
    // from then on its ctx calls are refused, and late workers are closed at once.
    let rolledBack = false

    const register = async (): Promise<void> => {
      const mod = (await import(pathToFileURL(file).href)) as {
        register?: (ctx: WorkerModuleContext) => Promise<void> | void
      }
      if (typeof mod.register !== 'function') {
        throw new Error(`worker module "${name}": ${file} must export register(ctx)`)
      }
      await mod.register({
        connection,
        log: log.child({ module: name }),
        events: {
          on: (event, listener) => {
            if (rolledBack) return
            unsubscribe.push(() => bus.off(event, listener))
            bus.on(event, listener)
          },
        },
        addWorker: (w) => {
          if (rolledBack) {
            void w.close().catch(() => undefined)
            return
          }
          workers.push(w)
        },
        onShutdown: (hook) => {
          if (!rolledBack) {
            hooks.push(hook)
            return
          }
          // registered after a timeout rollback: release it now, like a late worker
          void Promise.resolve()
            .then(hook)
            .catch((err: unknown) => log.error({ err, module: name }, 'late worker module cleanup failed'))
        },
        setProjectMemoryProvider: (p) => {
          if (!rolledBack) setProjectMemoryProvider(p)
        },
      })
    }

    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      await Promise.race([
        register(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error(`worker module "${name}": register() did not finish within ${timeoutMs} ms`)),
            timeoutMs,
          )
        }),
      ])
      loaded.names.push(name)
      loaded.workers.push(...workers)
      loaded.shutdownHooks.push(...hooks)
    } catch (err) {
      rolledBack = true
      log.error({ err, module: name }, 'worker module failed to load — rolled back and skipped, core pipelines continue')
      for (const off of unsubscribe) off()
      setProjectMemoryProvider(providerBefore)
      await Promise.allSettled(workers.map((w) => w.close()))
      // release what the module already opened (e.g. a Neo4j driver), best effort
      for (const hook of hooks) {
        try {
          await hook()
        } catch (hookErr) {
          log.error({ err: hookErr, module: name }, 'worker module cleanup after a failed load failed')
        }
      }
      loaded.failed.push(name)
    } finally {
      clearTimeout(timer)
    }
  }
  return loaded
}

/** Anything graceful shutdown can close (a BullMQ Worker or the module-cleanup step). */
export interface Closeable {
  close(): Promise<void>
}

/**
 * What shutdown.ts must close, in a safe order: every worker (core + modules) first, then
 * the module hooks (e.g. closing the Neo4j driver) — only after all in-flight jobs have
 * finished, and before shutdown.ts disconnects Prisma. Worker.close() is idempotent, so
 * the cleanup step may await the same workers shutdown.ts is closing.
 */
export function shutdownTargets(
  workers: Closeable[],
  hooks: Array<() => Promise<void> | void>,
  log: Logger,
): Closeable[] {
  if (hooks.length === 0) return workers
  const moduleCleanup: Closeable = {
    close: async () => {
      await Promise.all(workers.map((w) => w.close()))
      for (const hook of hooks) {
        try {
          await hook()
        } catch (err) {
          log.error({ err }, 'worker module shutdown hook failed')
        }
      }
    },
  }
  return [...workers, moduleCleanup]
}
