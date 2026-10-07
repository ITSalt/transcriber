/**
 * Test fixture (WP-WORKER-MEMORY-01 AC-1..AC-3): two meetings of one project and a scripted
 * LLM that answers the three memory steps the way a real model would for them.
 * Imported by *.test.ts only (it is compiled into dist like any src file, but nothing imports it there).
 */
import type { ILlmCompletionProvider, LlmCompletionInput, LlmResult } from '@transcrib/shared'
import { EXTRACT_SYSTEM, RESOLVE_SYSTEM, SUMMARY_SYSTEM } from './prompts.js'
import type { MeetingSource } from './pipeline.js'
import type { OutboxRepo, OutboxRow } from './outbox.js'
import { toMemorySegments } from './transcript.js'

/** ProjectParticipant rows are per project, so every fixture project gets its own participant id. */
export const IVANOV = { name: 'Иван Иванов', aliases: ['Иванов', 'Ваня'] }

export function meetingSources(ids: { workspaceId: string; projectId: string; m1: string; m2: string }) {
  const ivanov = { id: crypto.randomUUID(), ...IVANOV }
  const m1: MeetingSource = {
    meetingId: ids.m1,
    workspaceId: ids.workspaceId,
    projectId: ids.projectId,
    title: 'Планёрка 1',
    occurredAt: '2026-10-01T10:00:00.000Z',
    segments: toMemorySegments(
      [
        { speaker: 'SPEAKER_0', start: 0, end: 3.2, text: 'Добрый день, начинаем.' },
        { speaker: 'SPEAKER_0', start: 3.5, end: 9.1, text: 'Иванов отправит договор заказчику до пятнадцатого октября.' },
        { speaker: 'SPEAKER_1', start: 9.4, end: 11.0, text: 'Хорошо, я займусь договором.' },
        { speaker: 'SPEAKER_0', start: 11.5, end: 15.8, text: 'Ещё нужно подготовить смету по второму этапу.' },
        { speaker: 'SPEAKER_1', start: 16.0, end: 21.3, text: 'Решили работать по договору подряда, а не по агентскому.' },
      ],
      { SPEAKER_0: 'Петров', SPEAKER_1: null },
    ),
    protocolMarkdown: '## Решения\n- Договор подряда\n## Задачи\n- Иванов: договор до 15.10\n- Смета по второму этапу',
    participants: [ivanov],
  }
  const m2: MeetingSource = {
    ...m1,
    meetingId: ids.m2,
    title: 'Планёрка 2',
    occurredAt: '2026-10-08T10:00:00.000Z',
    segments: toMemorySegments(
      [
        { speaker: 'SPEAKER_1', start: 0, end: 4.0, text: 'По первому пункту: договор отправил вчера вечером.' },
        { speaker: 'SPEAKER_0', start: 4.2, end: 6.0, text: 'Отлично, тогда ждём подписи.' },
        { speaker: 'SPEAKER_0', start: 6.5, end: 9.0, text: 'Обсудили сроки по следующей поставке.' },
      ],
      { SPEAKER_0: 'Петров', SPEAKER_1: null },
    ),
    protocolMarkdown: '## Обсуждение\n- Договор отправлен',
  }
  return { m1, m2, ivanov }
}

const REPLIES = {
  m1: {
    extract: {
      tasks: [
        {
          title: 'Отправить договор заказчику',
          description: null,
          assignee: 'Иванов',
          due_date: '2026-10-15',
          status_signal: 'none',
          related_task_code: null,
          quote: 'Иванов отправит договор заказчику до пятнадцатого октября',
          segment: 1,
        },
        {
          title: 'Подготовить смету по второму этапу',
          assignee: null,
          due_date: null,
          status_signal: 'none',
          quote: 'нужно подготовить смету по второму этапу',
          segment: 3,
        },
        // fabricated: this quote is not in the transcript → must be dropped (AC-2)
        {
          title: 'Закупить сервер',
          assignee: 'Сидоров',
          due_date: null,
          status_signal: 'none',
          quote: 'Сидоров обещал закупить сервер до конца недели',
          segment: 2,
        },
      ],
      decisions: [{ text: 'Работаем по договору подряда', quote: 'Решили работать по договору подряда', segment: 4 }],
    },
    resolve: {
      tasks: [
        { item: 'i1', action: 'NEW', target_task_code: null, changes: {}, confidence: 0.92, reason: 'новая задача' },
        { item: 'i2', action: 'NEW', target_task_code: null, changes: {}, confidence: 0.88, reason: 'новая задача' },
      ],
      decisions: [{ item: 'd1', action: 'NEW', supersedes_code: null, leads_to: ['i1'], confidence: 0.9, reason: 'решение' }],
    },
  },
  m2: {
    extract: {
      tasks: [
        {
          title: 'Отправить договор заказчику',
          assignee: null,
          due_date: null,
          status_signal: 'done',
          related_task_code: 'T-1',
          quote: 'договор отправил вчера вечером',
          segment: 0,
        },
        {
          title: 'Согласовать сроки поставки',
          assignee: null,
          due_date: null,
          status_signal: 'none',
          related_task_code: null,
          quote: 'Обсудили сроки по следующей поставке',
          segment: 2,
        },
      ],
      decisions: [],
    },
    resolve: {
      tasks: [
        {
          item: 'i1',
          action: 'CLOSE',
          target_task_code: 'T-1',
          changes: { status: 'DONE' },
          confidence: 0.95,
          reason: 'Сказано «договор отправил»',
        },
        // a target that does not exist in the registry → rejected by the validator (AC-2)
        { item: 'i2', action: 'UPDATE', target_task_code: 'T-99', changes: { status: 'IN_PROGRESS' }, confidence: 0.9, reason: '?' },
      ],
      decisions: [],
    },
  },
} as const

/** Scripted ILlmCompletionProvider: picks the meeting by its transcript, the step by the system prompt. */
export function scriptedLlm(calls: LlmCompletionInput[] = []): ILlmCompletionProvider {
  return {
    async complete(input: LlmCompletionInput): Promise<LlmResult> {
      calls.push(input)
      const isM2 = input.user.includes('договор отправил') || input.user.includes('Договор отправлен')
      const meeting = isM2 ? REPLIES.m2 : REPLIES.m1
      let text: string
      if (input.system === EXTRACT_SYSTEM) text = '```json\n' + JSON.stringify(meeting.extract) + '\n```'
      else if (input.system === RESOLVE_SYSTEM) text = JSON.stringify(meeting.resolve)
      else if (input.system === SUMMARY_SYSTEM) text = `# Сводка\nВерсия после: ${meeting === REPLIES.m2 ? 'встречи 2' : 'встречи 1'}`
      else throw new Error('unexpected system prompt')
      return { text, model: 'claude-sonnet-4-6', tokensIn: 100, tokensOut: 50 }
    },
  }
}

/** In-memory GraphOutbox repo (mirrors the Prisma one in postgres.ts). */
export function memoryRepo(rows: Array<Omit<OutboxRow, 'attempts'>>) {
  const state = rows.map((r) => ({ ...r, attempts: 0, lastError: null as string | null, doneAt: null as Date | null }))
  const repo: OutboxRepo = {
    pending: async (limit) => state.filter((r) => !r.doneAt).slice(0, limit).map(({ id, op, payload, attempts }) => ({ id, op, payload, attempts })),
    markDone: async (id, at) => {
      state.find((r) => r.id === id)!.doneAt = at
    },
    markFailed: async (id, error) => {
      const r = state.find((x) => x.id === id)!
      r.attempts++
      r.lastError = error
    },
  }
  return { repo, state }
}
