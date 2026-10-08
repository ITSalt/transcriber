/**
 * FR-006 / ADR-013 — connection settings of the project-memory Neo4j (MEMORY_NEO4J_*).
 * MEMORY_NEO4J_URI unset = memory is off: the worker keeps NoProjectMemoryProvider and
 * graph:migrate exits 0 with a warning.
 */
import { z } from 'zod'

const EnvSchema = z.object({
  MEMORY_NEO4J_URI: z.string().trim().optional(),
  MEMORY_NEO4J_USER: z.string().trim().optional(),
  MEMORY_NEO4J_PASSWORD: z.string().optional(),
  MEMORY_NEO4J_DATABASE: z.string().trim().optional(),
})

export interface MemoryNeo4jConfig {
  uri: string
  user: string
  password: string
  /** undefined = the server's default database */
  database?: string
}

/** null when MEMORY_NEO4J_URI is unset or empty. */
export function readMemoryNeo4jConfig(env: NodeJS.ProcessEnv = process.env): MemoryNeo4jConfig | null {
  const parsed = EnvSchema.parse(env)
  if (!parsed.MEMORY_NEO4J_URI) return null
  if (!/^(bolt|neo4j)(\+s|\+ssc)?:\/\//.test(parsed.MEMORY_NEO4J_URI)) {
    throw new Error('MEMORY_NEO4J_URI must be a bolt:// or neo4j:// URI')
  }
  return {
    uri: parsed.MEMORY_NEO4J_URI,
    user: parsed.MEMORY_NEO4J_USER || 'neo4j',
    password: parsed.MEMORY_NEO4J_PASSWORD ?? '',
    database: parsed.MEMORY_NEO4J_DATABASE || undefined,
  }
}
