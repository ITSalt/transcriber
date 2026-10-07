/**
 * D-14 gate and the Resolve validator (RQ-063; AC-2: a nonexistent targetTaskCode is rejected).
 */
import { describe, expect, it } from 'vitest'
import type { MemoryTask } from '@transcrib/shared'
import { applyGate, matchParticipant, type GateInput, type VerifiedTaskItem } from './gate.js'
import { TaskResolution, type ExtractedTask } from './llm-output.js'

const IVANOV = { id: 'p-ivanov', name: 'Иван Иванов', aliases: ['Ваня'] }
const PETROV = { id: 'p-petrov', name: 'Пётр Петров', aliases: [] }

const candidate = (code: string, over: Partial<MemoryTask> = {}): MemoryTask => ({
  id: `id-${code}`,
  code,
  title: `Задача ${code}`,
  description: null,
  status: 'OPEN',
  assignee: null,
  due_date: null,
  merged_into: null,
  created_in_meeting_id: null,
  pending_count: 0,
  updated_at: '2026-10-01T00:00:00.000Z',
  ...over,
})

const item = (id: string, over: Partial<ExtractedTask> = {}): VerifiedTaskItem => ({
  id,
  task: {
    title: `Пункт ${id}`,
    description: null,
    assignee: null,
    due_date: null,
    status_signal: 'none',
    related_task_code: null,
    quote: `цитата ${id}`,
    segment: 0,
    ...over,
  },
  quote: { quote: `цитата ${id}`, startMs: 1000, endMs: 2000, speakerLabel: 'Speaker 1', segmentIndex: 0, match: 'exact' },
})

const res = (r: Record<string, unknown>) => TaskResolution.parse({ confidence: 0.9, reason: 'r', ...r })

function gate(over: Partial<GateInput>) {
  let n = 0
  return applyGate({
    taskItems: [],
    decisionItems: [],
    candidates: [],
    recentDecisions: [],
    taskResolutions: [],
    decisionResolutions: [],
    participants: [IVANOV, PETROV],
    threshold: 0.7,
    counters: { taskSeq: 4, decisionSeq: 1 },
    newId: () => `id${++n}`,
    ...over,
  })
}

describe('memory gate (D-14)', () => {
  it('NEW → next code, AUTO creation events, assignee resolved to the participant', () => {
    const plan = gate({
      taskItems: [item('i1', { title: 'Отправить договор', assignee: 'Иванов', due_date: '2026-10-15' })],
      taskResolutions: [res({ item: 'i1', action: 'NEW' })],
    })
    expect(plan.newTasks).toHaveLength(1)
    const t = plan.newTasks[0]!
    expect(t).toMatchObject({ code: 'T-5', seq: 5, mention: { kind: 'CREATED', startMs: 1000, speakerLabel: 'Speaker 1' } })
    expect(t.events.map((e) => [e.field, e.newValue, e.reviewState])).toEqual([
      ['title', 'Отправить договор', 'AUTO'],
      ['status', 'OPEN', 'AUTO'],
      ['assignee', 'Иван Иванов', 'AUTO'],
      ['due_date', '2026-10-15', 'AUTO'],
    ])
    expect(t.events[2]!.newParticipantId).toBe('p-ivanov')
  })

  it('CLOSE and status → DONE / CANCELLED are always PENDING, even when confident; the task stays as is', () => {
    const plan = gate({
      candidates: [candidate('T-1'), candidate('T-2')],
      taskItems: [item('i1'), item('i2')],
      taskResolutions: [
        res({ item: 'i1', action: 'CLOSE', target_task_code: 'T-1', changes: { status: 'DONE' }, confidence: 0.99 }),
        res({ item: 'i2', action: 'UPDATE', target_task_code: 'T-2', changes: { status: 'cancelled' }, confidence: 0.99 }),
      ],
    })
    const events = plan.taskUpdates.flatMap((u) => u.events.map((e) => [u.code, e.field, e.oldValue, e.newValue, e.reviewState]))
    expect(events).toEqual([
      ['T-1', 'status', 'OPEN', 'DONE', 'PENDING'],
      ['T-2', 'status', 'OPEN', 'CANCELLED', 'PENDING'],
    ])
    expect(plan.taskUpdates.map((u) => u.mentions[0]!.kind)).toEqual(['STATUS_UPDATE', 'STATUS_UPDATE'])
    expect(plan.notes.every((n) => n.pending)).toBe(true)
  })

  it('confident in-progress / due date / first assignee are AUTO; a different assignee and low confidence are PENDING', () => {
    const plan = gate({
      candidates: [candidate('T-1'), candidate('T-2', { assignee: { participant_id: 'p-petrov', name: 'Пётр Петров' } }), candidate('T-3')],
      taskItems: [item('i1'), item('i2'), item('i3')],
      taskResolutions: [
        res({ item: 'i1', action: 'UPDATE', target_task_code: 'T-1', changes: { status: 'IN_PROGRESS', due_date: '2026-11-01', assignee: 'Ваня' } }),
        res({ item: 'i2', action: 'UPDATE', target_task_code: 'T-2', changes: { assignee: 'Иванов' } }),
        res({ item: 'i3', action: 'UPDATE', target_task_code: 'T-3', changes: { status: 'IN_PROGRESS' }, confidence: 0.5 }),
      ],
    })
    const byCode = Object.fromEntries(plan.taskUpdates.map((u) => [u.code, u]))
    expect(byCode['T-1']!.events.map((e) => [e.field, e.newValue, e.reviewState])).toEqual([
      ['status', 'IN_PROGRESS', 'AUTO'],
      ['assignee', 'Иван Иванов', 'AUTO'],
      ['due_date', '2026-11-01', 'AUTO'],
    ])
    expect(byCode['T-1']!.mentions[0]!.kind).toBe('STATUS_UPDATE')
    expect(byCode['T-2']!.events.map((e) => [e.field, e.oldValue, e.newValue, e.reviewState, e.oldParticipantId, e.newParticipantId])).toEqual([
      ['assignee', 'Пётр Петров', 'Иван Иванов', 'PENDING', 'p-petrov', 'p-ivanov'],
    ])
    expect(byCode['T-2']!.mentions[0]!.kind).toBe('REASSIGNED')
    expect(byCode['T-3']!.events.map((e) => e.reviewState)).toEqual(['PENDING'])
  })

  it('DUPLICATE → PENDING merged_into; NO_CHANGE with a target → mention only', () => {
    const plan = gate({
      candidates: [candidate('T-1'), candidate('T-2')],
      taskItems: [item('i1'), item('i2')],
      taskResolutions: [
        res({ item: 'i1', action: 'DUPLICATE', target_task_code: 'T-2', duplicate_of_code: 'T-1' }),
        res({ item: 'i2', action: 'NO_CHANGE', target_task_code: 'T-1' }),
      ],
    })
    const byCode = Object.fromEntries(plan.taskUpdates.map((u) => [u.code, u]))
    expect(byCode['T-2']!.events.map((e) => [e.field, e.newValue, e.reviewState])).toEqual([['merged_into', 'T-1', 'PENDING']])
    expect(byCode['T-1']!.events).toEqual([])
    expect(byCode['T-1']!.mentions.map((m) => m.kind)).toEqual(['MENTIONED'])
  })

  it('AC-2: rejects a target that is not a candidate, an unknown quote_ref, a forbidden transition', () => {
    const plan = gate({
      candidates: [candidate('T-1', { status: 'DONE' })],
      taskItems: [item('i1'), item('i2'), item('i3')],
      taskResolutions: [
        res({ item: 'i1', action: 'CLOSE', target_task_code: 'T-99' }),
        res({ item: 'i9', action: 'NEW' }),
        res({ item: 'i2', action: 'UPDATE', target_task_code: 'T-1', changes: { status: 'IN_PROGRESS' } }),
        res({ item: 'i3', action: 'DUPLICATE', target_task_code: 'T-1', duplicate_of_code: 'T-1' }),
      ],
    })
    expect(plan.newTasks).toEqual([])
    expect(plan.taskUpdates.flatMap((u) => u.events)).toEqual([])
    expect(plan.rejected.map((r) => r.item)).toEqual(['i1', 'i9', 'i2', 'i3'])
    expect(plan.rejected[0]!.reason).toMatch(/T-99/)
  })

  it('a task the meeting does not mention gets nothing', () => {
    const plan = gate({ candidates: [candidate('T-1'), candidate('T-2')], taskItems: [item('i1')], taskResolutions: [res({ item: 'i1', action: 'CLOSE', target_task_code: 'T-1' })] })
    expect(plan.taskUpdates.map((u) => u.code)).toEqual(['T-1'])
  })

  it('decisions: NEW gets the next D-code, leads_to item refs map to task codes, supersedes only a recent decision', () => {
    const plan = gate({
      candidates: [candidate('T-1')],
      taskItems: [item('i1')],
      taskResolutions: [res({ item: 'i1', action: 'NEW' })],
      decisionItems: [
        { id: 'd1', decision: { text: 'Договор подряда', quote: 'q', segment: 0 }, quote: { quote: 'q1', startMs: 0, endMs: 1, speakerLabel: 'S', segmentIndex: 0, match: 'exact' } },
        { id: 'd2', decision: { text: 'Повтор', quote: 'q', segment: 0 }, quote: { quote: 'q2', startMs: 0, endMs: 1, speakerLabel: 'S', segmentIndex: 0, match: 'exact' } },
      ],
      recentDecisions: [{ code: 'D-1', text: 'Агентский договор' }],
      decisionResolutions: [
        { item: 'd1', action: 'NEW', target_decision_code: null, supersedes_code: 'D-1', leads_to: ['i1', 'T-1', 'T-77'], confidence: 1, reason: null },
        { item: 'd2', action: 'NO_CHANGE', target_decision_code: 'D-1', supersedes_code: null, leads_to: [], confidence: 1, reason: null },
      ],
    })
    expect(plan.newDecisions).toMatchObject([{ code: 'D-2', supersedes: 'D-1', leadsTo: ['T-5', 'T-1'] }])
    expect(plan.decisionMentions).toMatchObject([{ code: 'D-1' }])
  })

  it('matchParticipant: exact name or alias, else a unique word match', () => {
    expect(matchParticipant('иванов', [IVANOV, PETROV])?.id).toBe('p-ivanov')
    expect(matchParticipant('Ваня', [IVANOV, PETROV])?.id).toBe('p-ivanov')
    expect(matchParticipant('Сидоров', [IVANOV, PETROV])).toBeNull()
  })
})
