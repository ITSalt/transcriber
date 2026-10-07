/**
 * FR-006 — ProjectMemoryProvider on Neo4j: the <project_memory> section of the protocol
 * prompt. Summary + open tasks with codes
 *   T-42 | Отправить договор | Иванов | до 15.10 | open с встречи 3
 * + recent decisions, within ~5 000 tokens (maxChars). No memory yet, or Neo4j down/slow →
 * null: the protocol is generated without the section (ADR-013 — memory is optional).
 */
import type { Logger } from 'pino'
import type { ProjectMemoryProvider } from '@transcrib/shared'
import { getPromptMemoryData, type MemoryGraph, type PromptMemoryData } from '@transcrib/shared/memory'

const SUMMARY_SHARE = 0.4

function dueLabel(iso: string | null): string {
  if (!iso) return '—'
  const [, m, d] = iso.split('-')
  return `до ${d}.${m}`
}

export function renderPromptMemory(data: PromptMemoryData, maxChars: number): string | null {
  if (!data.summaryMd && data.openTasks.length === 0 && data.recentDecisions.length === 0) return null
  const parts: string[] = []
  let budget = maxChars

  if (data.summaryMd) {
    let summary = data.summaryMd.trim()
    const cap = Math.floor(maxChars * SUMMARY_SHARE)
    if (summary.length > cap) summary = `${summary.slice(0, cap)}…`
    const block = `Сводка проекта:\n${summary}`
    parts.push(block)
    budget -= block.length + 2
  }

  const take = (header: string, lines: string[], more: (n: number) => string) => {
    if (lines.length === 0) return
    const kept: string[] = []
    let used = header.length + 1
    for (const line of lines) {
      if (used + line.length + 1 > budget - 40) break
      kept.push(line)
      used += line.length + 1
    }
    if (kept.length < lines.length) kept.push(more(lines.length - kept.length))
    const block = `${header}\n${kept.join('\n')}`
    parts.push(block)
    budget -= block.length + 2
  }

  take(
    'Открытые задачи (код | задача | исполнитель | срок | статус):',
    data.openTasks.map(
      (t) =>
        `${t.code} | ${t.title} | ${t.assignee?.name ?? '—'} | ${dueLabel(t.due_date)} | ${t.status.toLowerCase()}` +
        (t.status_since_meeting_seq ? ` с встречи ${t.status_since_meeting_seq}` : ''),
    ),
    (n) => `… и ещё ${n} открытых задач`,
  )
  take(
    'Последние решения:',
    data.recentDecisions.map((d) => `${d.code} | ${d.text}${d.meeting_seq ? ` (встреча ${d.meeting_seq})` : ''}`),
    (n) => `… и ещё ${n} решений`,
  )
  return parts.join('\n\n')
}

export class Neo4jProjectMemoryProvider implements ProjectMemoryProvider {
  constructor(
    private readonly graph: MemoryGraph,
    private readonly log: Logger,
    private readonly opts: { maxChars: number; timeoutMs?: number },
  ) {}

  async getPromptMemory(projectId: string, workspaceId: string): Promise<string | null> {
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      const data = await Promise.race([
        getPromptMemoryData(this.graph, { workspaceId, projectId }),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error('project memory read timed out')), this.opts.timeoutMs ?? 10_000)
        }),
      ])
      return renderPromptMemory(data, this.opts.maxChars)
    } catch (err) {
      this.log.warn({ err, projectId }, 'project memory unavailable — protocol prompt goes without <project_memory>')
      return null
    } finally {
      clearTimeout(timer)
    }
  }
}
