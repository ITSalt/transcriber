/**
 * AC-4 (WP-WORKER-MEMORY-01): a memory query without workspaceId is impossible.
 * Unit level — a fake driver records whether a session was ever opened.
 */
import { describe, expect, it, vi } from 'vitest';
import type { Driver } from 'neo4j-driver';
import {
  assertMemoryScope,
  findTaskEventScope,
  listTasks,
  MemoryScopeError,
  readScoped,
  scopedParams,
  writeScoped,
  type MemoryGraph,
  type MemoryScope,
} from './index.js';

const WS = '11111111-1111-4111-8111-111111111111';
const PROJECT = '22222222-2222-4222-8222-222222222222';
const SCOPE: MemoryScope = { workspaceId: WS, projectId: PROJECT };

function fakeGraph() {
  const run = vi.fn(async () => ({ records: [] }));
  const session = vi.fn(() => ({
    executeRead: (work: (tx: unknown) => unknown) => work({ run }),
    executeWrite: (work: (tx: unknown) => unknown) => work({ run }),
    close: async () => undefined,
  }));
  const graph: MemoryGraph = { driver: { session } as unknown as Driver };
  return { graph, session, run };
}

describe('memory scope', () => {
  it('rejects a scope without workspaceId, without projectId, or with non-uuid ids', () => {
    expect(() => assertMemoryScope({ projectId: PROJECT })).toThrow(MemoryScopeError);
    expect(() => assertMemoryScope({ workspaceId: WS })).toThrow(MemoryScopeError);
    expect(() => assertMemoryScope({ workspaceId: '', projectId: PROJECT })).toThrow(MemoryScopeError);
    expect(() => assertMemoryScope({ workspaceId: 'x', projectId: PROJECT })).toThrow(MemoryScopeError);
    expect(() => assertMemoryScope(null)).toThrow(MemoryScopeError);
    expect(() => assertMemoryScope(SCOPE)).not.toThrow();
  });

  it('refuses Cypher that does not filter by both $workspaceId and $projectId', () => {
    expect(() => scopedParams(SCOPE, 'MATCH (t:Task {projectId: $projectId}) RETURN t')).toThrow(/workspaceId/);
    expect(() => scopedParams(SCOPE, 'MATCH (t:Task {workspaceId: $workspaceId}) RETURN t')).toThrow(MemoryScopeError);
  });

  it('takes workspaceId / projectId from the scope only — params cannot override them', () => {
    const cypher = 'MATCH (t:Task {workspaceId: $workspaceId, projectId: $projectId}) RETURN t';
    expect(() => scopedParams(SCOPE, cypher, { workspaceId: 'other' })).toThrow(MemoryScopeError);
    expect(scopedParams(SCOPE, cypher, { code: 'T-1' })).toEqual({ code: 'T-1', workspaceId: WS, projectId: PROJECT });
  });

  it('never opens a session for a query without workspaceId', async () => {
    const { graph, session } = fakeGraph();
    const noWs = { projectId: PROJECT } as unknown as MemoryScope;
    await expect(listTasks(graph, noWs)).rejects.toThrow(MemoryScopeError);
    await expect(readScoped(graph, noWs, async () => 1)).rejects.toThrow(MemoryScopeError);
    await expect(writeScoped(graph, noWs, async () => 1)).rejects.toThrow(MemoryScopeError);
    expect(session).not.toHaveBeenCalled();
  });

  it('a scoped transaction refuses an unscoped statement and passes the scope with a scoped one', async () => {
    const { graph, run } = fakeGraph();
    await expect(readScoped(graph, SCOPE, (tx) => tx.run('MATCH (n) RETURN n'))).rejects.toThrow(MemoryScopeError);
    expect(run).not.toHaveBeenCalled();
    await listTasks(graph, SCOPE);
    expect(run).toHaveBeenCalledTimes(1);
    expect(run.mock.calls[0]).toEqual([expect.any(String), expect.objectContaining({ workspaceId: WS, projectId: PROJECT })]);
  });

  it('event lookup by id requires the caller workspaces', async () => {
    const { graph, session } = fakeGraph();
    await expect(findTaskEventScope(graph, 'e', [])).rejects.toThrow(MemoryScopeError);
    expect(session).not.toHaveBeenCalled();
  });
});
