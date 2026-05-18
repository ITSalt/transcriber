/**
 * TECH-022 — Worker graceful shutdown
 *
 * Creates a shutdown handler that:
 *   1. Closes all BullMQ workers (lets in-flight jobs finish up to closeTimeout).
 *   2. Sends SIGTERM to any in-flight ffmpeg child processes via ffmpegRegistry.
 *   3. Disconnects Prisma.
 *   4. Exits 0 within 25s; exits 1 on timeout or error.
 */
import type { Worker } from 'bullmq'
import type { Logger } from 'pino'
import { ffmpegRegistry } from './lib/ffmpeg-registry.js'
import { prisma } from './lib/prisma.js'

const SHUTDOWN_TIMEOUT_MS = 25_000

/**
 * Returns an async shutdown function bound to the provided workers and logger.
 * Designed to be called from SIGTERM / SIGINT handlers.
 */
export function createShutdownHandler(
  workers: Worker[],
  log: Logger,
): (signal: string) => Promise<void> {
  return async function shutdown(signal: string): Promise<void> {
    log.info({ signal }, 'worker shutdown signal received')

    const timer = setTimeout(() => {
      log.error('worker graceful shutdown timeout — exiting 1')
      process.exit(1)
    }, SHUTDOWN_TIMEOUT_MS)

    try {
      // 1. Close BullMQ workers (lets current jobs finish or abort)
      await Promise.all(workers.map((w) => w.close()))
      log.info('BullMQ workers closed')

      // 2. Terminate any in-flight ffmpeg child processes
      await ffmpegRegistry.terminateAll()
      log.info('ffmpeg processes terminated')

      // 3. Disconnect Prisma
      await prisma.$disconnect()
      log.info('Prisma disconnected')

      clearTimeout(timer)
      process.exit(0)
    } catch (err) {
      log.error({ err }, 'worker shutdown error')
      clearTimeout(timer)
      process.exit(1)
    }
  }
}
