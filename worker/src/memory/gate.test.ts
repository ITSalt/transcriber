/**
 * D-14 gate and the Resolve validator (RQ-063; AC-2: a nonexistent targetTaskCode is rejected).
 */
import { describe, expect, it } from 'vitest'
import type { MemoryTask } from '@transcrib/shared'
import { applyGate, findSimilarDecision, matchParticipant, wordJaccard, type GateInput, type VerifiedTaskItem } from './gate.js'
import { DecisionResolution, TaskResolution, type ExtractedTask } from './llm-output.js'

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
  quote: { quote: `цитата ${id}`, startMs: 1000, endMs: 2000, speakerLabel: 'Спикер 1', segmentIndex: 0, match: 'exact', score: 1 },
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
    expect(t).toMatchObject({ code: 'T-5', seq: 5, mention: { kind: 'CREATED', startMs: 1000, speakerLabel: 'Спикер 1' } })
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

  it('a change backed by a partly matching (fuzzy) quote, or without a confidence, is PENDING', () => {
    const fuzzy = item('i1')
    fuzzy.quote = { ...fuzzy.quote, match: 'fuzzy', score: 0.86 }
    const plan = gate({
      candidates: [candidate('T-1'), candidate('T-2')],
      taskItems: [fuzzy, item('i2')],
      taskResolutions: [
        res({ item: 'i1', action: 'UPDATE', target_task_code: 'T-1', changes: { status: 'IN_PROGRESS' }, confidence: 0.99 }),
        TaskResolution.parse({ item: 'i2', action: 'UPDATE', target_task_code: 'T-2', changes: { due_date: '2026-12-01' } }),
      ],
    })
    expect(plan.taskUpdates.flatMap((u) => u.events.map((e) => [u.code, e.reviewState, e.confidence]))).toEqual([
      ['T-1', 'PENDING', 0.99],
      ['T-2', 'PENDING', 0],
    ])
  })

  it('a fuzzy quote never makes a change automatic, even with every word found (score 1)', () => {
    // transcript: «…договор заказчику отправил Козлов, не Иванов»; LLM: «Иванов отправил договор заказчику»
    const fuzzy = item('i1')
    fuzzy.quote = { ...fuzzy.quote, quote: 'договор заказчику отправил Козлов, не Иванов', match: 'fuzzy', score: 1 }
    const plan = gate({
      candidates: [candidate('T-1')],
      taskItems: [fuzzy],
      taskResolutions: [
        res({
          item: 'i1',
          action: 'UPDATE',
          target_task_code: 'T-1',
          changes: { status: 'IN_PROGRESS', assignee: 'Иванов', due_date: '2026-11-01' },
          confidence: 0.95,
        }),
      ],
    })
    expect(plan.taskUpdates[0]!.events.map((e) => [e.field, e.reviewState])).toEqual([
      ['status', 'PENDING'],
      ['assignee', 'PENDING'],
      ['due_date', 'PENDING'],
    ])
    expect(plan.notes.every((n) => n.pending)).toBe(true)
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
        { id: 'd1', decision: { text: 'Договор подряда', quote: 'q', segment: 0 }, quote: { quote: 'q1', startMs: 0, endMs: 1, speakerLabel: 'S', segmentIndex: 0, match: 'exact', score: 1 } },
        { id: 'd2', decision: { text: 'Повтор', quote: 'q', segment: 0 }, quote: { quote: 'q2', startMs: 0, endMs: 1, speakerLabel: 'S', segmentIndex: 0, match: 'exact', score: 1 } },
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

  describe('WP-WORKER-MEMORY-02 hygiene', () => {
    const dItem = (id: string, text: string) => ({
      id,
      decision: { text, quote: 'q', segment: 0 },
      quote: { quote: `q-${id}`, startMs: 0, endMs: 1, speakerLabel: 'S', segmentIndex: 0, match: 'exact' as const, score: 1 },
    })
    const dRes = (r: Record<string, unknown>) => DecisionResolution.parse({ confidence: 1, ...r })
    const known = [{ code: 'D-1', text: 'Подать на сертификацию в текущем виде' }]

    it('wordJaccard: normalised word sets; threshold 0.6 separates a restatement from a different agreement', () => {
      expect(wordJaccard('Подать на сертификацию в текущем виде!', 'подать на сертификацию в текущем виде')).toBe(1)
      expect(wordJaccard('', 'x')).toBe(0)
      expect(findSimilarDecision('Подаём на сертификацию в текущем виде', known)?.code).toBe('D-1') // 5/7
      expect(findSimilarDecision('Отложить сертификацию до осени', known)).toBeNull() // 1/9
      expect(findSimilarDecision('Подать на сертификацию в текущем виде сейчас', known)?.code).toBe('D-1') // 6/7
      expect(findSimilarDecision('Срок до 19 мая', known)).toBeNull()
    })

    it('a re-worded decision marked NEW by the LLM creates no D-n, only a mention of the existing one', () => {
      const plan = gate({
        recentDecisions: known,
        decisionItems: [dItem('d1', 'Подать на сертификацию в текущем виде сейчас')],
        decisionResolutions: [dRes({ item: 'd1', action: 'NEW' })],
      })
      expect(plan.newDecisions).toEqual([])
      expect(plan.decisionMentions).toMatchObject([{ code: 'D-1' }])
    })

    it('LLM duplicate_of wins even when the wording differs; an unknown code is ignored', () => {
      const plan = gate({
        recentDecisions: known,
        decisionItems: [dItem('d1', 'Идём на сертификацию как есть'), dItem('d2', 'Другое соглашение')],
        decisionResolutions: [dRes({ item: 'd1', action: 'NEW', duplicate_of: 'D-1' }), dRes({ item: 'd2', action: 'NEW', duplicate_of: 'D-77' })],
      })
      expect(plan.decisionMentions).toMatchObject([{ code: 'D-1' }])
      expect(plan.newDecisions).toMatchObject([{ code: 'D-2', text: 'Другое соглашение' }])
    })

    it('a different number/date or a negation is never a duplicate → a new decision', () => {
      const dated = [{ code: 'D-6', text: 'Срок сборки по таблице до 19 мая' }]
      expect(wordJaccard('Срок сборки по таблице до 19 мая', 'Срок сборки по таблице до 26 мая')).toBeGreaterThan(0.6)
      expect(findSimilarDecision('Срок сборки по таблице до 26 мая', dated)).toBeNull()
      expect(findSimilarDecision('Не подаём на сертификацию в текущем виде', known)).toBeNull()
      const plan = gate({
        recentDecisions: [...dated, ...known],
        decisionItems: [dItem('d1', 'Срок сборки по таблице до 26 мая'), dItem('d2', 'Не подаём на сертификацию в текущем виде')],
        decisionResolutions: [dRes({ item: 'd1', action: 'NEW' }), dRes({ item: 'd2', action: 'NEW' })],
      })
      expect(plan.newDecisions.map((d) => d.text)).toEqual(['Срок сборки по таблице до 26 мая', 'Не подаём на сертификацию в текущем виде'])
      expect(plan.decisionMentions).toEqual([])
    })

    it('supersedes_code from the LLM wins over the similarity guard', () => {
      const plan = gate({
        recentDecisions: [{ code: 'D-5', text: 'Старое соглашение о сроках' }, ...known],
        decisionItems: [dItem('d1', 'Подать на сертификацию в текущем виде сейчас')],
        decisionResolutions: [dRes({ item: 'd1', action: 'NEW', supersedes_code: 'D-5' })],
      })
      expect(plan.newDecisions).toMatchObject([{ supersedes: 'D-5' }])
      expect(plan.decisionMentions).toEqual([])
    })

    it('a guard hit without duplicate_of leaves a pending note; a hit by the LLM does not', () => {
      const byGuard = gate({
        recentDecisions: known,
        decisionItems: [dItem('d1', 'Подать на сертификацию в текущем виде сейчас')],
        decisionResolutions: [dRes({ item: 'd1', action: 'NEW' })],
      })
      expect(byGuard.notes).toMatchObject([{ code: 'D-1', pending: true }])
      const byLlm = gate({
        recentDecisions: known,
        decisionItems: [dItem('d1', 'Подать на сертификацию в текущем виде сейчас')],
        decisionResolutions: [dRes({ item: 'd1', action: 'NEW', duplicate_of: 'D-1' })],
      })
      expect(byLlm.notes).toEqual([])
    })

    it('two near-identical decisions in one meeting give one D-n and the second quote is kept as a mention', () => {
      const plan = gate({
        decisionItems: [dItem('d1', 'Срок сдачи до 19 мая'), dItem('d2', 'Срок сдачи до 19 мая включительно')],
        decisionResolutions: [dRes({ item: 'd1', action: 'NEW' }), dRes({ item: 'd2', action: 'NEW' })],
      })
      expect(plan.newDecisions).toHaveLength(1)
      expect(plan.decisionMentions).toMatchObject([{ code: 'D-2' }])
    })

    it('a new task for an assignee outside the participants → no assignee, PENDING «исполнитель: …»', () => {
      const plan = gate({
        taskItems: [item('i1', { title: 'Оценки', assignee: 'Сергей' })],
        taskResolutions: [res({ item: 'i1', action: 'NEW' })],
      })
      const events = plan.newTasks[0]!.events.filter((e) => e.field === 'assignee')
      expect(events).toMatchObject([{ oldValue: null, newValue: 'Сергей', reviewState: 'PENDING', quote: 'исполнитель: Сергей' }])
    })

    it('participant by alias → assigned; a named speaker of the meeting → assigned by name', () => {
      const plan = gate({
        speakerNames: ['Петрова Анна'],
        taskItems: [item('i1', { assignee: 'Ваня' }), item('i2', { assignee: 'Анна' })],
        taskResolutions: [res({ item: 'i1', action: 'NEW' }), res({ item: 'i2', action: 'NEW' })],
      })
      const byTask = plan.newTasks.map((t) => t.events.find((e) => e.field === 'assignee'))
      expect(byTask).toMatchObject([
        { newValue: 'Иван Иванов', reviewState: 'AUTO', newParticipantId: 'p-ivanov' },
        { newValue: 'Петрова Анна', reviewState: 'AUTO' },
      ])
    })

    it('UPDATE with an unknown assignee is PENDING even when the task had none', () => {
      const plan = gate({
        candidates: [candidate('T-1')],
        taskItems: [item('i1')],
        taskResolutions: [res({ item: 'i1', action: 'UPDATE', target_task_code: 'T-1', changes: { assignee: 'Хаджи' } })],
      })
      expect(plan.taskUpdates[0]!.events).toMatchObject([{ field: 'assignee', reviewState: 'PENDING', quote: 'исполнитель: Хаджи' }])
    })
  })
})
