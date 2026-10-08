/**
 * FR-006 / ADR-013 — the API's access to the project-memory Neo4j.
 *
 * MEMORY_NEO4J_URI unset, or the server unreachable → 503 MEMORY_UNAVAILABLE for memory
 * routes only; the rest of the app keeps working. The driver connects lazily and is closed
 * with the app. Domain errors of the shared layer map 1:1 onto program error codes.
 */
import neo4j, { type Driver } from 'neo4j-driver'
import type { FastifyInstance } from 'fastify'
import { PROGRAM_ERRORS, PROGRAM_ERROR_MESSAGES } from '@transcrib/shared'
import { MemoryError, MemoryScopeError, type MemoryGraph } from '@transcrib/shared/memory'
import { AppError } from '../../plugins/errors.js'
import { notFound } from '../auth/access.js'

const DRIVER_CONFIG = {
  connectionTimeout: 5_000,
  connectionAcquisitionTimeout: 8_000,
  maxTransactionRetryTime: 8_000,
  maxConnectionPoolSize: 10,
  disableLosslessIntegers: true,
} as const

export function unavailable(): AppError {
  return new AppError('MEMORY_UNAVAILABLE', PROGRAM_ERRORS.MEMORY_UNAVAILABLE, PROGRAM_ERROR_MESSAGES.MEMORY_UNAVAILABLE)
}

/** Lazy per-app holder; `graph()` throws 503 when memory is off. */
export interface MemoryGraphHolder {
  graph(): MemoryGraph
}

export function memoryGraphHolder(app: FastifyInstance, env: NodeJS.ProcessEnv = process.env): MemoryGraphHolder {
  let driver: Driver | undefined
  let graph: MemoryGraph | undefined
  app.addHook('onClose', async () => {
    await driver?.close()
  })
  return {
    graph() {
      const uri = env['MEMORY_NEO4J_URI']?.trim()
      if (!uri || !/^(bolt|neo4j)(\+s|\+ssc)?:\/\//.test(uri)) throw unavailable()
      if (!graph) {
        driver = neo4j.driver(
          uri,
          neo4j.auth.basic(env['MEMORY_NEO4J_USER']?.trim() || 'neo4j', env['MEMORY_NEO4J_PASSWORD'] ?? ''),
          DRIVER_CONFIG,
        )
        graph = { driver, database: env['MEMORY_NEO4J_DATABASE']?.trim() || undefined }
      }
      return graph
    },
  }
}

/**
 * Runs a graph call and translates its failures: domain errors → their program code,
 * everything else (connection, auth, timeouts, transient) → 503. AppErrors pass through.
 */
export async function guarded<T>(app: FastifyInstance, work: () => Promise<T>): Promise<T> {
  try {
    return await work()
  } catch (err) {
    if (err instanceof AppError) throw err
    if (err instanceof MemoryError) {
      if (err.code === 'NOT_FOUND') throw notFound()
      if (err.code === 'MEMORY_CONCURRENT_UPDATE') throw unavailable()
      if (err.code === 'MEMORY_INVALID_EVENT') throw new AppError(err.code, 409, err.message)
      throw new AppError(err.code, PROGRAM_ERRORS[err.code], PROGRAM_ERROR_MESSAGES[err.code])
    }
    if (err instanceof MemoryScopeError) throw err
    app.log.error({ err }, 'project memory graph unavailable')
    throw unavailable()
  }
}
