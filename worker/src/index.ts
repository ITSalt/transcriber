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
import { createWorkers, loadWorkerModules, workerEvents } from './job-processor.js'
import { createShutdownHandler } from './shutdown.js'

const log = buildLogger(config.LOG_LEVEL, config.NODE_ENV === 'development')

log.info({ redisUrl: config.REDIS_URL, concurrency: config.JOB_CONCURRENCY }, 'Starting worker')

const connection = parseRedisUrl(config.REDIS_URL)
const workers = createWorkers(connection, log)

workerEvents.onListenerError((err, event) => log.error({ err, event }, 'worker event listener failed'))
const modules = await loadWorkerModules(connection, log)
const allWorkers = [...workers, ...modules.workers]

log.info({ workerCount: allWorkers.length, modules: modules.names }, 'Workers started')

// Module cleanup must run only after every worker has finished its in-flight job, and
// before shutdown.ts disconnects Prisma — so it rides along as one more closeable that
// first awaits the workers' close() (idempotent in BullMQ) and then runs the hooks.
const moduleCleanup = {
  close: async (): Promise<void> => {
    await Promise.all(allWorkers.map((w) => w.close()))
    for (const hook of modules.shutdownHooks) {
      try {
        await hook()
      } catch (err) {
        log.error({ err }, 'worker module shutdown hook failed')
      }
    }
  },
} as unknown as Worker

const shutdown = createShutdownHandler(
  modules.shutdownHooks.length > 0 ? [...allWorkers, moduleCleanup] : allWorkers,
  log,
)

process.on('SIGTERM', () => void shutdown('SIGTERM'))
process.on('SIGINT', () => void shutdown('SIGINT'))
