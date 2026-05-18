/**
 * TECH-005 — API process entry point
 * Builds the Fastify app and starts listening on the configured port.
 *
 * TECH-022 — Graceful SIGTERM / SIGINT shutdown:
 *   Sets shuttingDown flag → closes Fastify → disconnects Prisma + Redis → exit 0
 *   Hard exit(1) after 25s if shutdown stalls.
 */
import { buildApp } from './server.js'
import { config } from './config.js'

const app = await buildApp({
  logLevel: config.LOG_LEVEL,
  prettyLogs: config.NODE_ENV === 'development',
})

try {
  await app.listen({ port: config.PORT, host: config.HOST })
} catch (err) {
  app.log.error(err)
  process.exit(1)
}

// ── Graceful shutdown ─────────────────────────────────────────────────────────

async function shutdown(signal: string): Promise<void> {
  if (app.shuttingDown) return
  app.shuttingDown = true
  app.log.info({ signal }, 'shutting down')

  const timer = setTimeout(() => {
    app.log.error('graceful shutdown timeout — exiting 1')
    process.exit(1)
  }, 25_000)

  try {
    // Stop accepting new connections; lets in-flight requests finish
    await app.close()

    // Disconnect Prisma (lazy-imported to avoid loading DB on startup if unused)
    const { prisma } = await import('./db.js')
    await prisma.$disconnect()

    clearTimeout(timer)
    process.exit(0)
  } catch (err) {
    app.log.error({ err }, 'shutdown error')
    clearTimeout(timer)
    process.exit(1)
  }
}

process.on('SIGTERM', () => void shutdown('SIGTERM'))
process.on('SIGINT', () => void shutdown('SIGINT'))
