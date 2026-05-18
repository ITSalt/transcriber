/**
 * TECH-005 — API process entry point
 * Builds the Fastify app and starts listening on the configured port.
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
