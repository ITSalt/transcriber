/**
 * TECH-006 — Worker process entry point
 * Loads config, creates logger, starts BullMQ workers for all queues.
 *
 * TECH-022 — Graceful SIGTERM / SIGINT shutdown:
 *   Closes BullMQ workers, terminates in-flight ffmpeg processes,
 *   disconnects Prisma, exits 0 within 25s.
 *
 * WP-BACKEND-06 (D-15) — worker modules (worker/src/<name>/index.ts, see
 * job-processor.ts WORKER_MODULES) are registered here without editing this file.
 */
import type { Worker } from 'bullmq'
import { config } from './config.js'
import { buildLogger } from './logger.js'
import { parseRedisUrl } from './queues.js'
import { createWorkers, loadWorkerModules, shutdownTargets, workerEvents } from './job-processor.js'
import { createShutdownHandler } from './shutdown.js'

const log = buildLogger(config.LOG_LEVEL, config.NODE_ENV === 'development')

log.info({ redisUrl: config.REDIS_URL, concurrency: config.JOB_CONCURRENCY }, 'Starting worker')

const connection = parseRedisUrl(config.REDIS_URL)

// Modules first: a module's ProjectMemoryProvider must be in place before the core workers
// take their first job. A failing module is skipped inside loadWorkerModules (never throws).
workerEvents.onListenerError((err, event) => log.error({ err, event }, 'worker event listener failed'))
const modules = await loadWorkerModules(connection, log)

const workers = [...createWorkers(connection, log), ...modules.workers]

log.info({ workerCount: workers.length, modules: modules.names, failedModules: modules.failed }, 'Workers started')

// shutdown.ts takes Worker[]; the module-cleanup step only needs close()
const shutdown = createShutdownHandler(
  shutdownTargets(workers, modules.shutdownHooks, log) as Worker[],
  log,
)

process.on('SIGTERM', () => void shutdown('SIGTERM'))
process.on('SIGINT', () => void shutdown('SIGINT'))
