import { describe, expect, it } from 'vitest'
import type { MemoryTask } from '@transcrib/shared'
import { selectCandidates } from './candidates.js'

const task = (n: number, title: string): MemoryTask => ({
  id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
  code: `T-${n}`,
  title,
  description: null,
  status: 'OPEN',
  assignee: null,
  due_date: null,
  merged_into: null,
  created_in_meeting_id: null,
  pending_count: 0,
  updated_at: '2026-10-01T00:00:00.000Z',
})

describe('selectCandidates', () => {
  it('returns every open task up to the limit', () => {
    const tasks = [task(1, 'a'), task(2, 'b')]
    expect(selectCandidates(tasks, ['anything'], 200)).toEqual(tasks)
  })

  it('above the limit keeps the tasks sharing the most word stems with the meeting, ordered by code', () => {
    const tasks = Array.from({ length: 250 }, (_, i) => task(i + 1, `Рутинная задача номер ${i + 1}`))
    tasks[9] = task(10, 'Отправить договор заказчику')
    tasks[199] = task(200, 'Подписать договор поставки')
    const picked = selectCandidates(tasks, ['договор отправил вчера'], 5)
    expect(picked).toHaveLength(5)
    expect(picked.map((t) => t.code)).toContain('T-10')
    expect(picked.map((t) => t.code)).toContain('T-200')
    expect(picked.map((t) => Number(t.code.slice(2)))).toEqual([...picked.map((t) => Number(t.code.slice(2)))].sort((a, b) => a - b))
  })
})
