/**
 * FR-006 / ADR-013 — schema of the project-memory graph (constraints and indexes).
 *
 * Migrations are idempotent Cypher (`IF NOT EXISTS`); the applied version lives in the
 * single node (:SchemaVersion {id: 'project-memory'}). `graph:migrate` (worker) runs
 * applyMemoryGraphMigrations; a second run finds nothing to apply and changes nothing.
 * Append new versions — never edit an applied one.
 */
import type { MemoryGraph } from './scope.js';
import { toNum } from './values.js';

export interface MemoryGraphMigration {
  version: number;
  description: string;
  /** schema statements, each run in its own auto-commit transaction */
  statements: string[];
}

export const MEMORY_SCHEMA_VERSION_ID = 'project-memory';

export const MEMORY_GRAPH_MIGRATIONS: readonly MemoryGraphMigration[] = [
  {
    version: 1,
    description: 'ids, per-project codes, tenant indexes',
    statements: [
      'CREATE CONSTRAINT memory_schema_version_id IF NOT EXISTS FOR (n:SchemaVersion) REQUIRE n.id IS UNIQUE',
      'CREATE CONSTRAINT memory_project_id IF NOT EXISTS FOR (n:Project) REQUIRE n.id IS UNIQUE',
      'CREATE CONSTRAINT memory_meeting_id IF NOT EXISTS FOR (n:Meeting) REQUIRE n.id IS UNIQUE',
      'CREATE CONSTRAINT memory_participant_id IF NOT EXISTS FOR (n:Participant) REQUIRE n.id IS UNIQUE',
      'CREATE CONSTRAINT memory_task_id IF NOT EXISTS FOR (n:Task) REQUIRE n.id IS UNIQUE',
      'CREATE CONSTRAINT memory_task_code IF NOT EXISTS FOR (n:Task) REQUIRE (n.projectId, n.code) IS UNIQUE',
      'CREATE CONSTRAINT memory_decision_id IF NOT EXISTS FOR (n:Decision) REQUIRE n.id IS UNIQUE',
      'CREATE CONSTRAINT memory_decision_code IF NOT EXISTS FOR (n:Decision) REQUIRE (n.projectId, n.code) IS UNIQUE',
      'CREATE CONSTRAINT memory_task_event_id IF NOT EXISTS FOR (n:TaskEvent) REQUIRE n.id IS UNIQUE',
      'CREATE CONSTRAINT memory_project_memory_id IF NOT EXISTS FOR (n:ProjectMemory) REQUIRE n.id IS UNIQUE',
      'CREATE CONSTRAINT memory_project_memory_version IF NOT EXISTS FOR (n:ProjectMemory) REQUIRE (n.projectId, n.version) IS UNIQUE',
      'CREATE CONSTRAINT memory_tombstone_id IF NOT EXISTS FOR (n:Tombstone) REQUIRE n.id IS UNIQUE',
      'CREATE INDEX memory_task_scope IF NOT EXISTS FOR (n:Task) ON (n.workspaceId, n.projectId, n.status)',
      'CREATE INDEX memory_decision_scope IF NOT EXISTS FOR (n:Decision) ON (n.workspaceId, n.projectId)',
      'CREATE INDEX memory_task_event_scope IF NOT EXISTS FOR (n:TaskEvent) ON (n.workspaceId, n.projectId, n.reviewState)',
      'CREATE INDEX memory_project_memory_scope IF NOT EXISTS FOR (n:ProjectMemory) ON (n.workspaceId, n.projectId)',
      'CREATE INDEX memory_meeting_scope IF NOT EXISTS FOR (n:Meeting) ON (n.workspaceId, n.projectId)',
      'CREATE INDEX memory_participant_scope IF NOT EXISTS FOR (n:Participant) ON (n.workspaceId, n.projectId)',
    ],
  },
];

export const MEMORY_GRAPH_LATEST_VERSION = Math.max(...MEMORY_GRAPH_MIGRATIONS.map((m) => m.version));

export interface MemoryGraphMigrationResult {
  from: number;
  to: number;
  /** versions applied by this run; empty = already up to date, nothing changed */
  applied: number[];
}

/** Reads the applied schema version (0 = never migrated). */
export async function getMemoryGraphSchemaVersion(graph: MemoryGraph): Promise<number> {
  const session = graph.driver.session({ database: graph.database, defaultAccessMode: 'READ' });
  try {
    const res = await session.run('MATCH (v:SchemaVersion {id: $id}) RETURN v.version AS version', {
      id: MEMORY_SCHEMA_VERSION_ID,
    });
    const v = res.records[0]?.get('version') as unknown;
    return toNum(v) ?? 0;
  } finally {
    await session.close();
  }
}

/** Applies every migration above the stored version, in order. */
export async function applyMemoryGraphMigrations(
  graph: MemoryGraph,
  migrations: readonly MemoryGraphMigration[] = MEMORY_GRAPH_MIGRATIONS,
): Promise<MemoryGraphMigrationResult> {
  const from = await getMemoryGraphSchemaVersion(graph);
  const pending = [...migrations].filter((m) => m.version > from).sort((a, b) => a.version - b.version);
  const applied: number[] = [];
  for (const migration of pending) {
    const session = graph.driver.session({ database: graph.database, defaultAccessMode: 'WRITE' });
    try {
      for (const statement of migration.statements) await session.run(statement);
      await session.executeWrite((tx) =>
        tx.run(
          `MERGE (v:SchemaVersion {id: $id})
           SET v.version = toInteger($version), v.description = $description, v.updatedAt = $now`,
          {
            id: MEMORY_SCHEMA_VERSION_ID,
            version: migration.version,
            description: migration.description,
            now: new Date().toISOString(),
          },
        ),
      );
    } finally {
      await session.close();
    }
    applied.push(migration.version);
  }
  return { from, to: applied.length > 0 ? applied[applied.length - 1]! : from, applied };
}
