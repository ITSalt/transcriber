/**
 * FR-006 / UC-600 step 5 — candidates for MEMORY_RESOLVE: every open task of the project;
 * above the limit, a lexical prefilter keeps the tasks that share the most word stems with
 * this meeting's verified items (ties: the most recently created first).
 */
import type { MemoryTask } from '@transcrib/shared'
import { normalizeText } from './transcript.js'

/** crude stem: first 5 letters of words of ≥ 3 letters — enough for RU/EN overlap */
function stems(text: string): Set<string> {
  return new Set(
    normalizeText(text)
      .split(' ')
      .filter((w) => w.length >= 3)
      .map((w) => w.slice(0, 5)),
  )
}

export function selectCandidates(openTasks: readonly MemoryTask[], itemTexts: readonly string[], limit: number): MemoryTask[] {
  if (openTasks.length <= limit) return [...openTasks]
  const meeting = stems(itemTexts.join(' '))
  const scored = openTasks.map((t) => {
    const own = stems([t.title, t.description ?? '', t.assignee?.name ?? ''].join(' '))
    let score = 0
    for (const s of own) if (meeting.has(s)) score++
    return { t, score, n: Number(t.code.slice(2)) }
  })
  scored.sort((a, b) => b.score - a.score || b.n - a.n)
  return scored
    .slice(0, limit)
    .map((x) => x.t)
    .sort((a, b) => Number(a.code.slice(2)) - Number(b.code.slice(2)))
}
