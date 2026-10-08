/**
 * FR-006 / ADR-013 — `pnpm --filter @transcrib/worker run graph:migrate`.
 *
 * Applies the project-memory graph schema (@transcrib/shared/memory MEMORY_GRAPH_MIGRATIONS)
 * to MEMORY_NEO4J_URI. Idempotent: a second run reports "up to date" and changes nothing.
 * Without MEMORY_NEO4J_URI it prints a warning and exits 0 (memory off). Any other failure
 * exits 1; the prod deploy treats that as non-fatal (D-19).
 */
import { applyMemoryGraphMigrations, MEMORY_GRAPH_LATEST_VERSION } from '@transcrib/shared/memory'
import { readMemoryNeo4jConfig } from './config.js'
import { createMemoryGraphConnection, type MemoryGraphConnection } from './driver.js'

export interface MigrateOutput {
  info(msg: string): void
  warn(msg: string): void
  error(msg: string): void
}

export async function runGraphMigrate(
  env: NodeJS.ProcessEnv,
  out: MigrateOutput,
  connect: typeof createMemoryGraphConnection = createMemoryGraphConnection,
): Promise<number> {
  let connection: MemoryGraphConnection | undefined
  try {
    const config = readMemoryNeo4jConfig(env)
    if (!config) {
      out.warn('graph:migrate: MEMORY_NEO4J_URI is not set — project memory is off, nothing to migrate')
      return 0
    }
    connection = connect(config)
    const result = await applyMemoryGraphMigrations(connection.graph)
    if (result.applied.length === 0) {
      out.info(`graph:migrate: up to date (schema version ${result.to}, latest ${MEMORY_GRAPH_LATEST_VERSION}) — no changes`)
    } else {
      out.info(`graph:migrate: applied ${result.applied.join(', ')} (schema version ${result.from} → ${result.to})`)
    }
    return 0
  } catch (err) {
    out.error(`graph:migrate failed: ${err instanceof Error ? err.message : String(err)}`)
    return 1
  } finally {
    await connection?.close().catch(() => undefined)
  }
}
