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

// Extend FastifyInstance with the shuttingDown flag (TECH-022)
declare module 'fastify' {
  interface FastifyInstance {
    shuttingDown: boolean
  }
}
import { ssePlugin } from './plugins/sse.js'
import { meetingListRoutes } from './routes/uc-001.js'
import { meetingDetailRoutes } from './routes/uc-002.js'
import { meetingDeleteRoutes } from './routes/uc-003.js'
import { uploadFinalizeRoutes } from './routes/uc-100.js'
import { transcriptRoutes } from './routes/uc-201.js'
import { protocolRoutes } from './routes/uc-301.js'
import { protocolPdfRoutes } from './routes/uc-302.js'

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

  // TECH-022: shuttingDown flag — set by SIGTERM handler; health route reads it
  app.decorate('shuttingDown', false)

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
  // UC-002: meeting detail
  await app.register(meetingDetailRoutes)
  // UC-003: delete meeting
  await app.register(meetingDeleteRoutes)
  // UC-201: view and download transcript
  await app.register(transcriptRoutes)
  // UC-301: review and edit protocol
  await app.register(protocolRoutes)
  // UC-302: export protocol to PDF
  await app.register(protocolPdfRoutes)

  // TUS plugin: mounts /api/uploads and /api/uploads/* catch-all last
  await app.register(tusPlugin)

  return app
}
