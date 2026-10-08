/**
 * FR-006 / ADR-013 — the worker's Neo4j driver for project memory.
 *
 * The driver connects lazily (creating it never blocks register(ctx)); sessions are opened
 * per transaction by @transcrib/shared/memory. close() is registered as a worker shutdown
 * hook, so it runs after every in-flight job has finished.
 */
import neo4j, { type Driver } from 'neo4j-driver'
import type { MemoryGraph } from '@transcrib/shared/memory'
import type { MemoryNeo4jConfig } from './config.js'

export interface MemoryGraphConnection {
  graph: MemoryGraph
  /** true when the server answers within the timeout */
  health(timeoutMs?: number): Promise<{ ok: true } | { ok: false; error: string }>
  close(): Promise<void>
}

/** Connection timeouts keep a dead Neo4j from stalling jobs: fail fast, BullMQ retries. */
const DRIVER_CONFIG = {
  connectionTimeout: 10_000,
  connectionAcquisitionTimeout: 15_000,
  maxTransactionRetryTime: 15_000,
  maxConnectionPoolSize: 10,
  disableLosslessIntegers: true,
} as const

export function createMemoryGraphConnection(
  config: MemoryNeo4jConfig,
  factory: (uri: string, auth: ReturnType<typeof neo4j.auth.basic>, cfg: typeof DRIVER_CONFIG) => Driver = (u, a, c) =>
    neo4j.driver(u, a, c),
): MemoryGraphConnection {
  const driver = factory(config.uri, neo4j.auth.basic(config.user, config.password), DRIVER_CONFIG)
  const graph: MemoryGraph = { driver, database: config.database }
  let closed = false
  return {
    graph,
    async health(timeoutMs = 5_000) {
      let timer: ReturnType<typeof setTimeout> | undefined
      try {
        await Promise.race([
          driver.getServerInfo({ database: config.database }),
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new Error(`Neo4j did not answer within ${timeoutMs} ms`)), timeoutMs)
          }),
        ])
        return { ok: true }
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) }
      } finally {
        clearTimeout(timer)
      }
    },
    async close() {
      if (closed) return
      closed = true
      await driver.close()
    },
  }
}
