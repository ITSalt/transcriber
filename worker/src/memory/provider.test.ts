import { describe, expect, it } from 'vitest'
import pino from 'pino'
import type { Driver } from 'neo4j-driver'
import type { PromptMemoryData } from '@transcrib/shared/memory'
import { Neo4jProjectMemoryProvider, renderPromptMemory } from './provider.js'

const task = (n: number, over: Partial<PromptMemoryData['openTasks'][number]> = {}): PromptMemoryData['openTasks'][number] => ({
  id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
  code: `T-${n}`,
  title: `Задача ${n}`,
  description: null,
  status: 'OPEN',
  assignee: null,
  due_date: null,
  merged_into: null,
  created_in_meeting_id: null,
  pending_count: 0,
  updated_at: '2026-10-01T00:00:00.000Z',
  status_since_meeting_seq: 3,
  ...over,
})

describe('renderPromptMemory', () => {
  it('no summary, tasks or decisions → null (section omitted)', () => {
    expect(renderPromptMemory({ summaryMd: null, openTasks: [], recentDecisions: [] }, 20_000)).toBeNull()
  })

  it('renders the contract line format', () => {
    const text = renderPromptMemory(
      {
        summaryMd: 'Проект: поставка.',
        openTasks: [
          task(42, { title: 'Отправить договор', assignee: { participant_id: null, name: 'Иванов' }, due_date: '2026-10-15' }),
          task(43, { status: 'IN_PROGRESS', status_since_meeting_seq: 5 }),
        ],
        recentDecisions: [
          {
            id: 'x',
            code: 'D-7',
            text: 'Работаем по подряду',
            superseded_by: null,
            meeting_id: null,
            quote: null,
            leads_to: [],
            created_at: '2026-10-01T00:00:00.000Z',
            meeting_seq: 3,
          },
        ],
      },
      20_000,
    )!
    expect(text).toContain('T-42 | Отправить договор | Иванов | до 15.10 | open с встречи 3')
    expect(text).toContain('T-43 | Задача 43 | — | — | in_progress с встречи 5')
    expect(text).toContain('D-7 | Работаем по подряду (встреча 3)')
    expect(text.startsWith('Сводка проекта:\nПроект: поставка.')).toBe(true)
  })

  it('stays within the budget (~5 000 tokens) and says how many tasks were cut', () => {
    const text = renderPromptMemory(
      { summaryMd: 'с'.repeat(50_000), openTasks: Array.from({ length: 2000 }, (_, i) => task(i + 1)), recentDecisions: [] },
      20_000,
    )!
    expect(text.length).toBeLessThanOrEqual(20_000)
    expect(text).toMatch(/… и ещё \d+ открытых задач/)
    expect(text).toContain('T-1 |')
  })
})

describe('Neo4jProjectMemoryProvider', () => {
  it('Neo4j down → null, never throws (protocol generation goes on)', async () => {
    const driver = {
      session: () => ({
        executeRead: async () => {
          throw new Error('ServiceUnavailable: connection refused')
        },
        close: async () => undefined,
      }),
    } as unknown as Driver
    const provider = new Neo4jProjectMemoryProvider({ driver }, pino({ level: 'silent' }), { maxChars: 20_000 })
    await expect(
      provider.getPromptMemory('22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111'),
    ).resolves.toBeNull()
  })

  it('a hanging read times out to null', async () => {
    const driver = {
      session: () => ({ executeRead: () => new Promise(() => undefined), close: async () => undefined }),
    } as unknown as Driver
    const provider = new Neo4jProjectMemoryProvider({ driver }, pino({ level: 'silent' }), { maxChars: 20_000, timeoutMs: 50 })
    await expect(
      provider.getPromptMemory('22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111'),
    ).resolves.toBeNull()
  })
})
