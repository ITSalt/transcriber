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
  await app.register(tusPlugin)

  // Routes
  await app.register(healthRoutes)

  return app
}
