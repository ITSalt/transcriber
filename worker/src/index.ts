/**
 * TECH-006 — Worker process entry point
 * Loads config, creates logger, starts BullMQ workers for all queues.
 */
import { config } from './config.js'
import { buildLogger } from './logger.js'
import { parseRedisUrl } from './queues.js'
import { createWorkers } from './job-processor.js'

const log = buildLogger(config.LOG_LEVEL, config.NODE_ENV === 'development')

log.info({ redisUrl: config.REDIS_URL, concurrency: config.JOB_CONCURRENCY }, 'Starting worker')

const connection = parseRedisUrl(config.REDIS_URL)
const workers = createWorkers(connection, log)

log.info({ workerCount: workers.length }, 'Workers started')

// Graceful shutdown
async function shutdown(signal: string): Promise<void> {
  log.info({ signal }, 'Shutdown signal received — closing workers')
  await Promise.all(workers.map((w) => w.close()))
  log.info('Workers closed — exiting')
  process.exit(0)
}

process.on('SIGTERM', () => void shutdown('SIGTERM'))
process.on('SIGINT', () => void shutdown('SIGINT'))
