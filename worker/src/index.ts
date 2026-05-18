/**
 * TECH-006 — Worker process entry point
 * Loads config, creates logger, starts BullMQ workers for all queues.
 *
 * TECH-022 — Graceful SIGTERM / SIGINT shutdown:
 *   Closes BullMQ workers, terminates in-flight ffmpeg processes,
 *   disconnects Prisma, exits 0 within 25s.
 */
import { config } from './config.js'
import { buildLogger } from './logger.js'
import { parseRedisUrl } from './queues.js'
import { createWorkers } from './job-processor.js'
import { createShutdownHandler } from './shutdown.js'

const log = buildLogger(config.LOG_LEVEL, config.NODE_ENV === 'development')

log.info({ redisUrl: config.REDIS_URL, concurrency: config.JOB_CONCURRENCY }, 'Starting worker')

const connection = parseRedisUrl(config.REDIS_URL)
const workers = createWorkers(connection, log)

log.info({ workerCount: workers.length }, 'Workers started')

const shutdown = createShutdownHandler(workers, log)

process.on('SIGTERM', () => void shutdown('SIGTERM'))
process.on('SIGINT', () => void shutdown('SIGINT'))
