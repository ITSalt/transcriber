/**
 * FR-006 (contract v1) — project memory as seen by protocol generation.
 *
 * The protocol pipeline (WP-WORKER-01) asks the CURRENT provider for the text of the
 * <project_memory> section: project summary + open tasks, one per line
 * (`T-42 | Отправить договор | Иванов | до 15.10 | open с встречи 3`) + recent decisions,
 * ≲ 5 000 tokens. null = no memory → the section is omitted.
 *
 * Default is NoProjectMemoryProvider (real behaviour "memory not built yet", not a stub).
 * worker/src/memory/index.ts (WP-WORKER-MEMORY-01) replaces it from register(ctx) via
 * ctx.setProjectMemoryProvider(); every read must filter by BOTH workspaceId and projectId.
 */
export interface ProjectMemoryProvider {
  getPromptMemory(projectId: string, workspaceId: string): Promise<string | null>;
}

export class NoProjectMemoryProvider implements ProjectMemoryProvider {
  async getPromptMemory(_projectId: string, _workspaceId: string): Promise<string | null> {
    return null;
  }
}

let current: ProjectMemoryProvider = new NoProjectMemoryProvider();

/** Process-wide provider used by the protocol pipeline. */
export function getProjectMemoryProvider(): ProjectMemoryProvider {
  return current;
}

/** Replace the provider (worker module registration). Returns the previous one. */
export function setProjectMemoryProvider(provider: ProjectMemoryProvider): ProjectMemoryProvider {
  const previous = current;
  current = provider;
  return previous;
}
