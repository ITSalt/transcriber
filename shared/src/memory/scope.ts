/**
 * FR-006 / RQ-055 — tenant scope of every project-memory graph query.
 *
 * Every node of the memory graph carries `workspaceId` AND `projectId`; every query is
 * parameterised by both. The helpers below are the only way this layer talks to Neo4j:
 * a query cannot be sent without a valid scope, the Cypher text must reference both
 * `$workspaceId` and `$projectId`, and the caller's params can never override them.
 */
import type { Driver, ManagedTransaction, QueryResult, RecordShape } from 'neo4j-driver';

/** A Neo4j driver plus the database that holds the memory graph (MEMORY_NEO4J_DATABASE). */
export interface MemoryGraph {
  driver: Driver;
  /** undefined = the server's default database */
  database?: string;
}

export interface MemoryScope {
  workspaceId: string;
  projectId: string;
}

export class MemoryScopeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MemoryScopeError';
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Throws MemoryScopeError unless both ids are UUIDs. */
export function assertMemoryScope(scope: Partial<MemoryScope> | null | undefined): asserts scope is MemoryScope {
  if (!scope || typeof scope !== 'object') throw new MemoryScopeError('memory query without a scope');
  for (const key of ['workspaceId', 'projectId'] as const) {
    const value = scope[key];
    if (typeof value !== 'string' || !UUID.test(value)) {
      throw new MemoryScopeError(`memory query without a valid ${key}`);
    }
  }
}

/**
 * Validates scope + Cypher and returns the params to send: the caller's params with
 * `workspaceId` and `projectId` taken from the scope (never from the caller).
 */
export function scopedParams(
  scope: MemoryScope,
  cypher: string,
  params: Record<string, unknown> = {},
): Record<string, unknown> {
  assertMemoryScope(scope);
  if (!/\$workspaceId\b/.test(cypher) || !/\$projectId\b/.test(cypher)) {
    throw new MemoryScopeError('memory query must filter by $workspaceId and $projectId');
  }
  if ('workspaceId' in params || 'projectId' in params) {
    throw new MemoryScopeError('workspaceId / projectId come from the scope, not from params');
  }
  return { ...params, workspaceId: scope.workspaceId, projectId: scope.projectId };
}

/** A transaction bound to one scope: every run() is checked by scopedParams. */
export interface ScopedTx {
  readonly scope: MemoryScope;
  run<R extends RecordShape = RecordShape>(cypher: string, params?: Record<string, unknown>): Promise<QueryResult<R>>;
}

export function scopedTx(tx: ManagedTransaction, scope: MemoryScope): ScopedTx {
  assertMemoryScope(scope);
  return {
    scope,
    run: <R extends RecordShape = RecordShape>(cypher: string, params?: Record<string, unknown>) =>
      tx.run<R>(cypher, scopedParams(scope, cypher, params)),
  };
}

/** One managed read transaction in the scope. The scope is checked before a session opens. */
export async function readScoped<T>(
  graph: MemoryGraph,
  scope: MemoryScope,
  work: (tx: ScopedTx) => Promise<T>,
): Promise<T> {
  assertMemoryScope(scope);
  const session = graph.driver.session({ database: graph.database, defaultAccessMode: 'READ' });
  try {
    return await session.executeRead((tx) => work(scopedTx(tx, scope)));
  } finally {
    await session.close();
  }
}

/**
 * One managed write transaction in the scope (all-or-nothing; transient errors are retried
 * by the driver). One meeting's memory update = one call.
 */
export async function writeScoped<T>(
  graph: MemoryGraph,
  scope: MemoryScope,
  work: (tx: ScopedTx) => Promise<T>,
): Promise<T> {
  assertMemoryScope(scope);
  const session = graph.driver.session({ database: graph.database, defaultAccessMode: 'WRITE' });
  try {
    return await session.executeWrite((tx) => work(scopedTx(tx, scope)));
  } finally {
    await session.close();
  }
}
