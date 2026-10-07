/**
 * FR-006 / UC-600, UC-605 — worker module "memory" (auto-loaded by job-processor
 * WORKER_MODULES, WP-BACKEND-06).
 *
 * register(ctx):
 *   - no MEMORY_NEO4J_URI → memory off: nothing registered, NoProjectMemoryProvider stays;
 *   - Neo4j driver (lazy — register never waits for the server), closed on shutdown;
 *   - ProjectMemoryProvider on Neo4j for the protocol prompt;
 *   - own BullMQ queue `project-memory` + worker (concurrency 1, FR-001 retries);
 *   - protocolJobCompleted → enqueue the meeting when the protocol is DONE and the meeting
 *     has a project;
 *   - GraphOutbox consumer (deletions).
 * A memory failure never changes a meeting or its protocol; it fails the memory job only.
 */
import { Queue, UnrecoverableError, Worker, type Job } from 'bullmq'
import type { PrismaClient } from '@prisma/client'
import type { Logger } from 'pino'
import {
  JOB_RETRY_OPTIONS,
  PROJECT_MEMORY_QUEUE,
  ProjectMemoryJobPayload,
  type GraphOutboxEntry,
  type ILlmCompletionProvider,
} from '@transcrib/shared'
import { deleteMeetingFromGraph, deleteProjectFromGraph, type MemoryGraph } from '@transcrib/shared/memory'
import type { WorkerModuleContext } from '../job-processor.js'
import { readMemoryNeo4jConfig } from '../graph/config.js'
import { createMemoryGraphConnection, type MemoryGraphConnection } from '../graph/driver.js'
import { KieAiLlmError } from '../llm/kieai.js'
import { readMemorySettings, type MemorySettings } from './config.js'
import { KieAiCompletionProvider } from './kieai-completion.js'
import { GraphOutboxConsumer } from './outbox.js'
import { runMemoryUpdate, type MemoryPipelineDeps } from './pipeline.js'
import { createGenerationRecorder, createMeetingLoader, createOutboxRepo, createProtocolJobLookup } from './postgres.js'
import { Neo4jProjectMemoryProvider } from './provider.js'

/** The memory job only calls LLMs and Neo4j; a lock longer than one LLM call. */
export const MEMORY_LOCK_DURATION_MS = 120_000

export interface MemoryModuleOverrides {
  env?: NodeJS.ProcessEnv
  prisma?: PrismaClient
  connect?: typeof createMemoryGraphConnection
  llm?: () => ILlmCompletionProvider
}

/** BullMQ job id: one memory update per meeting (re-sent events do not duplicate it). */
export function memoryJobId(meetingId: string): string {
  return `memory-${meetingId}`
}

export async function processMemoryJob(deps: MemoryPipelineDeps, job: Job<unknown>): Promise<void> {
  const payload = ProjectMemoryJobPayload.safeParse(job.data)
  if (!payload.success) throw new UnrecoverableError(`invalid project-memory payload: ${payload.error.message}`)
  try {
    const outcome = await runMemoryUpdate(deps, payload.data)
    deps.log.info({ jobId: job.id, meetingId: payload.data.meeting_id, ...outcome }, 'project memory updated')
  } catch (err) {
    // permanent provider errors (401, 400, …) are not worth the remaining attempts
    if (err instanceof KieAiLlmError && !err.isTransient) throw new UnrecoverableError(err.message)
    throw err
  }
}

export function applyOutboxEntry(graph: MemoryGraph) {
  return async (entry: GraphOutboxEntry): Promise<void> => {
    if (entry.op === 'DELETE_MEETING') {
      await deleteMeetingFromGraph(graph, { workspaceId: entry.payload.workspace_id, projectId: entry.payload.project_id }, entry.payload.meeting_id)
    } else {
      await deleteProjectFromGraph(graph, { workspaceId: entry.payload.workspace_id, projectId: entry.payload.project_id })
    }
  }
}

export async function register(ctx: WorkerModuleContext, overrides: MemoryModuleOverrides = {}): Promise<void> {
  const env = overrides.env ?? process.env
  const neo4jConfig = readMemoryNeo4jConfig(env)
  if (!neo4jConfig) {
    ctx.log.warn('project memory is off: MEMORY_NEO4J_URI is not set')
    return
  }
  const settings: MemorySettings = readMemorySettings(env)
  const prisma = overrides.prisma ?? (await import('../lib/prisma.js')).prisma
  const log: Logger = ctx.log

  const connection: MemoryGraphConnection = (overrides.connect ?? createMemoryGraphConnection)(neo4jConfig)
  const hooks: Array<() => Promise<void>> = []
  // shutdown: outbox → queue → driver (registered at the end, in this order)
  try {
    void connection.health().then((h) =>
      h.ok ? log.info('project memory: Neo4j reachable') : log.warn({ error: h.error }, 'project memory: Neo4j not reachable yet — jobs will retry'),
    )

    ctx.setProjectMemoryProvider(new Neo4jProjectMemoryProvider(connection.graph, log, { maxChars: settings.promptMaxChars }))

    let llm: ILlmCompletionProvider | undefined
    const deps: MemoryPipelineDeps = {
      graph: connection.graph,
      llm: overrides.llm ?? (() => (llm ??= new KieAiCompletionProvider())),
      loadMeeting: createMeetingLoader(prisma),
      recordGeneration: createGenerationRecorder(prisma),
      log,
      settings,
    }

    const queue = new Queue(PROJECT_MEMORY_QUEUE, {
      connection: ctx.connection,
      defaultJobOptions: {
        ...JOB_RETRY_OPTIONS,
        removeOnComplete: { age: 7 * 24 * 3600 },
        removeOnFail: { age: 30 * 24 * 3600 },
      },
    })
    hooks.unshift(() => queue.close())

    const worker = new Worker(PROJECT_MEMORY_QUEUE, (job) => processMemoryJob(deps, job), {
      connection: ctx.connection,
      concurrency: 1,
      lockDuration: MEMORY_LOCK_DURATION_MS,
    })
    worker.on('failed', (job, err) =>
      log.error({ jobId: job?.id, queue: PROJECT_MEMORY_QUEUE, attemptsMade: job?.attemptsMade, error_reason: err.message }, 'projectMemoryJob failed'),
    )
    ctx.addWorker(worker)

    const lookup = createProtocolJobLookup(prisma)
    ctx.events.on('protocolJobCompleted', async ({ protocolGenerationJobId }) => {
      const payload = await lookup(protocolGenerationJobId)
      if (!payload) return
      await queue.add('update', payload, { jobId: memoryJobId(payload.meeting_id) })
      log.info({ meetingId: payload.meeting_id }, 'project memory update queued')
    })

    const outbox = new GraphOutboxConsumer({
      repo: createOutboxRepo(prisma),
      apply: applyOutboxEntry(connection.graph),
      log,
      pollMs: settings.outboxPollMs,
    })
    outbox.start()
    hooks.unshift(() => outbox.stop())
  } finally {
    for (const hook of hooks) ctx.onShutdown(hook)
    ctx.onShutdown(() => connection.close())
  }
}
