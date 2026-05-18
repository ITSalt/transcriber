/**
 * TECH-005 — Fastify app factory
 * Builds and returns a configured FastifyInstance without calling .listen().
 * Entry point (index.ts) is responsible for listening.
 */
import Fastify, { type FastifyInstance } from 'fastify'
import {
  serializerCompiler,
  validatorCompiler,
} from '@fastify/type-provider-zod'
import { buildLoggerOptions } from './plugins/logger.js'
import { errorHandlerPlugin } from './plugins/errors.js'
import { tusPlugin } from './plugins/tus.js'
import { healthRoutes } from './routes/health.js'
import { ssePlugin } from './plugins/sse.js'
import { meetingListRoutes } from './routes/uc-001.js'
import { uploadFinalizeRoutes } from './routes/uc-100.js'

export interface BuildAppOptions {
  logLevel?: string
  prettyLogs?: boolean
}

export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const { logLevel = 'info', prettyLogs = false } = options

  const app = Fastify({
    logger: buildLoggerOptions(logLevel, prettyLogs),
    genReqId: () => crypto.randomUUID(),
    requestIdHeader: 'x-request-id',
    requestIdLogLabel: 'reqId',
  })

  // Zod type provider — validates request bodies/params/query against Zod schemas
  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)

  // Plugins
  await app.register(errorHandlerPlugin)
  await app.register(ssePlugin)

  // Routes — register UC-100 finalize BEFORE the TUS wildcard so Fastify
  // routes take priority over app.all('/api/uploads/*') in tusPlugin.
  await app.register(healthRoutes)
  // UC-100: upload finalize (must come before tusPlugin wildcard)
  await app.register(uploadFinalizeRoutes)
  // UC-001: meeting catalog
  await app.register(meetingListRoutes)

  // TUS plugin: mounts /api/uploads and /api/uploads/* catch-all last
  await app.register(tusPlugin)

  return app
}
