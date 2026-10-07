/**
 * FR-006 / D-14 / RQ-063 — turns MEMORY_RESOLVE decisions into a write plan.
 *
 * Validation (an invalid resolution is rejected and reported, never applied):
 *   - `item` must be one of this meeting's verified items (its quote was found);
 *   - target_task_code / duplicate_of_code must be candidates; supersedes / target decision
 *     codes must be recent decisions;
 *   - status changes must pass canTransitionTaskStatus (shared with the API).
 * Gate:
 *   AUTO    — new task (initial title/status/assignee/due), mention without change, due date,
 *             title, description, status → IN_PROGRESS / POSTPONED / OPEN, first assignee —
 *             when confidence ≥ threshold;
 *   PENDING — status → DONE / CANCELLED, merged_into, a different assignee replacing an
 *             existing one, anything below the threshold or backed by a fuzzy (partial) quote.
 * Tasks the meeting does not mention get nothing.
 */
import {
  canTransitionTaskStatus,
  TaskCode,
  type MemoryTask,
  type MemoryTaskStatus,
  type TaskMentionKind,
} from '@transcrib/shared'
import type { MeetingUpdatePlan, NewTaskEventInput, TaskMentionInput } from '@transcrib/shared/memory'
import type { DecisionResolution, ExtractedDecision, ExtractedTask, StatusSignal, TaskResolution } from './llm-output.js'
import { normalizeText, type VerifiedQuote } from './transcript.js'

export interface VerifiedTaskItem {
  /** i1, i2, … — the quote_ref of MEMORY_RESOLVE */
  id: string
  task: ExtractedTask
  quote: VerifiedQuote
}

export interface VerifiedDecisionItem {
  /** d1, d2, … */
  id: string
  decision: ExtractedDecision
  quote: VerifiedQuote
}

export interface ParticipantRef {
  id: string
  name: string
  aliases: string[]
}

export interface GateInput {
  taskItems: readonly VerifiedTaskItem[]
  decisionItems: readonly VerifiedDecisionItem[]
  candidates: readonly MemoryTask[]
  recentDecisions: ReadonlyArray<{ code: string; text: string }>
  taskResolutions: readonly TaskResolution[]
  decisionResolutions: readonly DecisionResolution[]
  participants: readonly ParticipantRef[]
  threshold: number
  counters: { taskSeq: number; decisionSeq: number }
  newId: () => string
}

export interface GateRejection {
  item: string
  reason: string
}

/** One line of the change list handed to MEMORY_SUMMARY. */
export interface ChangeNote {
  code: string
  text: string
  pending: boolean
}

export type GatePlan = Pick<MeetingUpdatePlan, 'newTasks' | 'taskUpdates' | 'newDecisions' | 'decisionMentions'> & {
  rejected: GateRejection[]
  notes: ChangeNote[]
}

const CLOSING: readonly MemoryTaskStatus[] = ['DONE', 'CANCELLED']

const SIGNAL_STATUS: Record<StatusSignal, MemoryTaskStatus | null> = {
  none: null,
  done: 'DONE',
  cancelled: 'CANCELLED',
  postponed: 'POSTPONED',
  in_progress: 'IN_PROGRESS',
  reopened: 'OPEN',
}

/** Name from the meeting → project participant (exact name/alias, else a unique token match). */
export function matchParticipant(name: string, participants: readonly ParticipantRef[]): ParticipantRef | null {
  const n = normalizeText(name)
  if (!n) return null
  const exact = participants.filter((p) => [p.name, ...p.aliases].some((x) => normalizeText(x) === n))
  if (exact.length === 1) return exact[0]!
  const words = n.split(' ')
  const partial = participants.filter((p) =>
    [p.name, ...p.aliases].some((x) => {
      const own = new Set(normalizeText(x).split(' '))
      return words.every((w) => own.has(w))
    }),
  )
  return partial.length === 1 ? partial[0]! : null
}

interface WorkingTask {
  code: string
  title: string
  description: string | null
  status: MemoryTaskStatus
  assigneeName: string | null
  assigneeParticipantId: string | null
  dueDate: string | null
}

const KIND_RANK: Record<TaskMentionKind, number> = { CREATED: 4, STATUS_UPDATE: 3, REASSIGNED: 2, DUE_CHANGED: 1, MENTIONED: 0 }

export function applyGate(input: GateInput): GatePlan {
  const plan: GatePlan = { newTasks: [], taskUpdates: [], newDecisions: [], decisionMentions: [], rejected: [], notes: [] }
  const items = new Map(input.taskItems.map((i) => [i.id, i]))
  const decisionItems = new Map(input.decisionItems.map((d) => [d.id, d]))
  const working = new Map<string, WorkingTask>(
    input.candidates.map((t) => [
      t.code,
      {
        code: t.code,
        title: t.title,
        description: t.description,
        status: t.status,
        assigneeName: t.assignee?.name ?? null,
        assigneeParticipantId: t.assignee?.participant_id ?? null,
        dueDate: t.due_date,
      },
    ]),
  )
  const updates = new Map<string, { code: string; mentions: TaskMentionInput[]; events: NewTaskEventInput[] }>()
  const itemCode = new Map<string, string>()
  const newCodes = new Set<string>()
  const resolved = new Set<string>()
  let taskSeq = input.counters.taskSeq
  let decisionSeq = input.counters.decisionSeq

  const reject = (item: string, reason: string) => plan.rejected.push({ item, reason })
  const confident = (c: number) => c >= input.threshold
  const mentionOf = (q: VerifiedQuote, kind: TaskMentionKind): TaskMentionInput => ({
    quote: q.quote,
    startMs: q.startMs,
    endMs: q.endMs,
    speakerLabel: q.speakerLabel,
    kind,
  })
  const updateOf = (code: string) => {
    let u = updates.get(code)
    if (!u) {
      u = { code, mentions: [], events: [] }
      updates.set(code, u)
    }
    return u
  }
  const person = (name: string) => {
    const p = matchParticipant(name, input.participants)
    return p ? { name: p.name, id: p.id } : { name, id: null }
  }
  const sameAssignee = (t: WorkingTask, next: { name: string; id: string | null }) =>
    t.assigneeParticipantId && next.id ? t.assigneeParticipantId === next.id : normalizeText(t.assigneeName ?? '') === normalizeText(next.name)

  for (const r of input.taskResolutions) {
    const item = items.get(r.item)
    if (!item) {
      reject(r.item, `unknown quote_ref ${r.item} (not a verified item of this meeting)`)
      continue
    }
    if (resolved.has(r.item)) {
      reject(r.item, 'item resolved twice — first resolution kept')
      continue
    }
    resolved.add(r.item)
    const quote = item.quote
    // a change backed by a quote that only partly matches the transcript is never automatic
    const sure = confident(r.confidence) && quote.score >= 1
    const ev = (
      field: NewTaskEventInput['field'],
      oldValue: string | null,
      newValue: string | null,
      reviewState: 'AUTO' | 'PENDING',
      extra: Partial<NewTaskEventInput> = {},
    ): NewTaskEventInput => ({
      id: input.newId(),
      field,
      oldValue,
      newValue,
      reviewState,
      confidence: r.confidence,
      reason: r.reason,
      quote: quote.quote,
      ...extra,
    })

    if (r.action === 'NEW') {
      taskSeq += 1
      const code = `T-${taskSeq}`
      const title = r.changes.title ?? item.task.title
      const statusWish = r.changes.status ?? SIGNAL_STATUS[item.task.status_signal]
      const initial: MemoryTaskStatus = statusWish === 'IN_PROGRESS' || statusWish === 'POSTPONED' ? statusWish : 'OPEN'
      const events: NewTaskEventInput[] = [ev('title', null, title, 'AUTO'), ev('status', null, initial, 'AUTO')]
      const description = r.changes.description ?? item.task.description
      if (description) events.push(ev('description', null, description, 'AUTO'))
      const assigneeName = r.changes.assignee ?? item.task.assignee
      if (assigneeName) {
        const a = person(assigneeName)
        events.push(ev('assignee', null, a.name, 'AUTO', { newParticipantId: a.id }))
      }
      const due = r.changes.due_date ?? item.task.due_date
      if (due) events.push(ev('due_date', null, due, 'AUTO'))
      if (statusWish && CLOSING.includes(statusWish)) {
        events.push(ev('status', initial, statusWish, 'PENDING'))
        plan.notes.push({ code, text: `${code} статус ${initial} → ${statusWish}`, pending: true })
      }
      plan.newTasks.push({ id: input.newId(), code, seq: taskSeq, mention: mentionOf(quote, 'CREATED'), events })
      plan.notes.push({ code, text: `${code} новая задача: «${title}»${assigneeName ? `, исполнитель ${assigneeName}` : ''}${due ? `, срок ${due}` : ''}`, pending: false })
      itemCode.set(r.item, code)
      newCodes.add(code)
      continue
    }

    if (r.action === 'NO_CHANGE' && !r.target_task_code) continue
    const target = r.target_task_code ? working.get(r.target_task_code) : undefined
    if (!target) {
      reject(r.item, `target_task_code ${r.target_task_code ?? '(none)'} is not a candidate task`)
      continue
    }
    itemCode.set(r.item, target.code)
    const u = updateOf(target.code)
    let kind: TaskMentionKind = 'MENTIONED'
    const bump = (k: TaskMentionKind) => {
      if (KIND_RANK[k] > KIND_RANK[kind]) kind = k
    }
    const statusChange = (to: MemoryTaskStatus, forcePending: boolean) => {
      if (to === target.status) return
      if (!canTransitionTaskStatus(target.status, to)) {
        reject(r.item, `status ${target.status} → ${to} is not allowed for ${target.code}`)
        return
      }
      const auto = !forcePending && !CLOSING.includes(to) && sure
      u.events.push(ev('status', target.status, to, auto ? 'AUTO' : 'PENDING'))
      plan.notes.push({ code: target.code, text: `${target.code} статус ${target.status} → ${to}`, pending: !auto })
      bump('STATUS_UPDATE')
      if (auto) target.status = to
    }

    if (r.action === 'CLOSE') {
      const to = r.changes.status ?? 'DONE'
      if (!CLOSING.includes(to)) {
        reject(r.item, `CLOSE with status ${to} (must be DONE or CANCELLED)`)
        continue
      }
      statusChange(to, true)
    } else if (r.action === 'DUPLICATE') {
      const other = r.duplicate_of_code
      if (!other || other === target.code || !working.has(other)) {
        reject(r.item, `duplicate_of_code ${other ?? '(none)'} is not another candidate task`)
        continue
      }
      u.events.push(ev('merged_into', null, other, 'PENDING'))
      plan.notes.push({ code: target.code, text: `${target.code} дубль ${other} (слияние)`, pending: true })
    } else if (r.action === 'UPDATE') {
      const c = r.changes
      if (c.status) statusChange(c.status, false)
      if (c.assignee) {
        const next = person(c.assignee)
        if (!sameAssignee(target, next)) {
          const auto = target.assigneeName === null && sure
          u.events.push(
            ev('assignee', target.assigneeName, next.name, auto ? 'AUTO' : 'PENDING', {
              oldParticipantId: target.assigneeParticipantId,
              newParticipantId: next.id,
            }),
          )
          plan.notes.push({ code: target.code, text: `${target.code} исполнитель ${target.assigneeName ?? '—'} → ${next.name}`, pending: !auto })
          bump('REASSIGNED')
          if (auto) {
            target.assigneeName = next.name
            target.assigneeParticipantId = next.id
          }
        }
      }
      const simple: Array<['due_date' | 'title' | 'description', string | null | undefined, keyof WorkingTask]> = [
        ['due_date', c.due_date, 'dueDate'],
        ['title', c.title, 'title'],
        ['description', c.description, 'description'],
      ]
      for (const [field, value, key] of simple) {
        if (!value || value === target[key]) continue
        const auto = sure
        u.events.push(ev(field, (target[key] as string | null) ?? null, value, auto ? 'AUTO' : 'PENDING'))
        plan.notes.push({ code: target.code, text: `${target.code} ${field} → ${value}`, pending: !auto })
        if (field === 'due_date') bump('DUE_CHANGED')
        if (auto) (target[key] as string | null) = value
      }
    }
    u.mentions.push(mentionOf(quote, kind))
  }

  for (const i of input.taskItems) if (!resolved.has(i.id)) reject(i.id, 'no resolution returned — ignored')

  // decisions
  const recent = new Set(input.recentDecisions.map((d) => d.code))
  const seenDecisionItems = new Set<string>()
  for (const r of input.decisionResolutions) {
    const item = decisionItems.get(r.item)
    if (!item) {
      reject(r.item, `unknown quote_ref ${r.item} (not a verified decision of this meeting)`)
      continue
    }
    if (seenDecisionItems.has(r.item)) {
      reject(r.item, 'decision resolved twice — first resolution kept')
      continue
    }
    seenDecisionItems.add(r.item)
    const mention = { quote: item.quote.quote, startMs: item.quote.startMs, endMs: item.quote.endMs, speakerLabel: item.quote.speakerLabel }
    if (r.action === 'NO_CHANGE') {
      if (r.target_decision_code && recent.has(r.target_decision_code)) {
        plan.decisionMentions.push({ code: r.target_decision_code, mention })
      } else if (r.target_decision_code) {
        reject(r.item, `target_decision_code ${r.target_decision_code} is not a recent decision`)
      }
      continue
    }
    decisionSeq += 1
    const code = `D-${decisionSeq}`
    let supersedes: string | null = null
    if (r.supersedes_code) {
      if (recent.has(r.supersedes_code)) supersedes = r.supersedes_code
      else reject(r.item, `supersedes_code ${r.supersedes_code} is not a recent decision — ignored`)
    }
    const leadsTo = [
      ...new Set(
        r.leads_to
          .map((ref) => (/^i\d+$/.test(ref) ? itemCode.get(ref) : ref))
          .filter((c): c is string => !!c && TaskCode.safeParse(c).success && (working.has(c) || newCodes.has(c))),
      ),
    ]
    plan.newDecisions.push({ id: input.newId(), code, seq: decisionSeq, text: item.decision.text, mention, leadsTo, supersedes })
    plan.notes.push({ code, text: `${code} решение: ${item.decision.text}${supersedes ? ` (заменяет ${supersedes})` : ''}`, pending: false })
  }
  for (const d of input.decisionItems) if (!seenDecisionItems.has(d.id)) reject(d.id, 'no resolution returned — ignored')

  plan.taskUpdates = [...updates.values()]
  return plan
}
