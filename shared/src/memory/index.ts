/**
 * @transcrib/shared/memory — FR-006 project-memory graph access layer (Neo4j, ADR-013).
 *
 * Separate entry point: never re-exported from shared/src/index.ts, so the web bundle does
 * not pull neo4j-driver. Used by worker/src/{graph,memory} (WP-WORKER-MEMORY-01) and
 * api/src/features/memory (WP-API-MEMORY-01).
 *
 * Every query is bound to a MemoryScope {workspaceId, projectId} (scope.ts): a query
 * without both, or whose Cypher does not filter by both, is refused before a session opens.
 * The model is described in .tl/external-contracts/neo4j.md.
 */
export * from './scope.js';
export * from './errors.js';
export * from './fold.js';
export * from './migrations.js';
export * from './tasks.js';
export * from './reads.js';
export * from './meeting-update.js';
export * from './reviews.js';
export * from './deletions.js';
export { toNum, toStr, toStoredTaskEvent } from './values.js';
