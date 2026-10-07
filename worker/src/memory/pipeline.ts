/**
 * FR-006 / UC-600 — one project meeting → one memory update.
 *
 *   load (Postgres) → MEMORY_EXTRACT → verify quotes → candidates → MEMORY_RESOLVE → gate
 *   (D-14) → MEMORY_SUMMARY → one Neo4j write transaction.
 *
 * Every LLM call goes through ILlmCompletionProvider and is recorded as a
 * ProtocolGeneration(kind MEMORY_*) row right after it returns (tokens are spent even if
 * a later step fails). Nothing here touches Meeting / Protocol status: a failure only fails
 * the project-memory job, which BullMQ retries (FR-001).
 */
import { randomUUID } from 'node:crypto'
import type { Logger } from 'pino'
import type { ILlmCompletionProvider, LlmModel, MemoryTask, ProjectMemoryJobPayload } from '@transcrib/shared'
import {
  getProjectMemoryState,
  listOpenTasks,
  listRecentDecisions,
  writeMeetingUpdate,
  type MemoryGraph,
  type MemoryScope,
} from '@transcrib/shared/memory'
import { selectCandidates } from './candidates.js'
import { applyGate, type ChangeNote, type ParticipantRef, type VerifiedDecisionItem, type VerifiedTaskItem } from './gate.js'
import {
  DecisionResolution,
  ExtractedDecision,
  ExtractedTask,
  parseJsonObject,
  parseList,
  TaskResolution,
} from './llm-output.js'
import { EXTRACT_SYSTEM, PROMPT_VERSIONS, RESOLVE_SYSTEM, SUMMARY_SYSTEM } from './prompts.js'
import { createQuoteVerifier, renderNumberedTranscript, type MemorySegment } from './transcript.js'

export type MemoryStepKind = 'MEMORY_EXTRACT' | 'MEMORY_RESOLVE' | 'MEMORY_SUMMARY'

/** What the pipeline needs from Postgres about one meeting. */
export interface MeetingSource {
  meetingId: string
  workspaceId: string | null
  projectId: string | null
  title: string
  occurredAt: string
  segments: MemorySegment[]
  protocolMarkdown: string | null
  participants: ParticipantRef[]
}

export interface GenerationRecord {
  meetingId: string
  kind: MemoryStepKind
  model: LlmModel
  promptVersion: string
  inputTokens: number
  outputTokens: number
}

export interface MemoryPipelineDeps {
  graph: MemoryGraph
  llm: () => ILlmCompletionProvider
  loadMeeting(meetingId: string): Promise<MeetingSource | null>
  recordGeneration(record: GenerationRecord): Promise<void>
  log: Logger
  settings: { confidenceThreshold: number; candidateLimit: number }
  model?: LlmModel
  now?: () => Date
  newId?: () => string
}

export type MemoryUpdateOutcome =
  | { status: 'SKIPPED'; reason: string }
  | { status: 'ALREADY_APPLIED' }
  | {
      status: 'APPLIED'
      memoryVersion: number
      createdTasks: number
      events: number
      pendingEvents: number
      createdDecisions: number
      droppedQuotes: number
      rejected: number
    }

const fmtTask = (t: MemoryTask) =>
  `${t.code} | ${t.title} | ${t.assignee?.name ?? '—'} | ${t.due_date ?? '—'} | ${t.status}`

export async function runMemoryUpdate(deps: MemoryPipelineDeps, payload: ProjectMemoryJobPayload): Promise<MemoryUpdateOutcome> {
  const log = deps.log.child({ meetingId: payload.meeting_id, projectId: payload.project_id })
  const newId = deps.newId ?? randomUUID
  const scope: MemoryScope = { workspaceId: payload.workspace_id, projectId: payload.project_id }

  const src = await deps.loadMeeting(payload.meeting_id)
  if (!src) return { status: 'SKIPPED', reason: 'meeting not found' }
  if (src.projectId !== payload.project_id || src.workspaceId !== payload.workspace_id) {
    return { status: 'SKIPPED', reason: 'meeting no longer belongs to this project' }
  }
  if (src.segments.length === 0) return { status: 'SKIPPED', reason: 'no transcript segments' }

  const state = await getProjectMemoryState(deps.graph, scope, src.meetingId)
  if (state.meetingAlreadyApplied) return { status: 'ALREADY_APPLIED' }
  const openTasks = await listOpenTasks(deps.graph, scope)
  const recentDecisions = await listRecentDecisions(deps.graph, scope, 50)

  const call = async (kind: MemoryStepKind, system: string, user: string, json: boolean, maxTokens: number) => {
    const res = await deps.llm().complete({ system, user, model: deps.model, responseFormat: json ? 'json' : 'text', maxTokens })
    await deps.recordGeneration({
      meetingId: src.meetingId,
      kind,
      model: res.model,
      promptVersion: PROMPT_VERSIONS[kind],
      inputTokens: res.tokensIn,
      outputTokens: res.tokensOut,
    })
    return res.text
  }

  // 1. extract from the transcript (not from the protocol); open tasks only as recognition hints
  //    (the newest candidateLimit of them — the full set is matched later by the prefilter)
  const extractReply = parseJsonObject(
    'MEMORY_EXTRACT',
    await call(
      'MEMORY_EXTRACT',
      EXTRACT_SYSTEM,
      `<open_tasks>\n${openTasks.slice(-deps.settings.candidateLimit).map(fmtTask).join('\n') || '(none)'}\n</open_tasks>\n\n<transcript>\n${renderNumberedTranscript(src.segments)}\n</transcript>`,
      true,
      8192,
    ),
  )
  const tasks = parseList(ExtractedTask, extractReply['tasks'])
  const decisions = parseList(ExtractedDecision, extractReply['decisions'])
  if (tasks.invalid.length || decisions.invalid.length) {
    log.warn({ tasks: tasks.invalid, decisions: decisions.invalid }, 'memory: malformed extracted items dropped')
  }

  // 2. every item must be backed by a verbatim quote from the segments
  const verify = createQuoteVerifier(src.segments)
  let droppedQuotes = 0
  const taskItems: VerifiedTaskItem[] = []
  for (const task of tasks.valid) {
    const quote = verify(task.quote, task.segment)
    if (!quote) {
      droppedQuotes++
      log.warn({ quote: task.quote, title: task.title }, 'memory: task quote not found in transcript — item dropped')
      continue
    }
    taskItems.push({ id: `i${taskItems.length + 1}`, task, quote })
  }
  const decisionItems: VerifiedDecisionItem[] = []
  for (const decision of decisions.valid) {
    const quote = verify(decision.quote, decision.segment)
    if (!quote) {
      droppedQuotes++
      log.warn({ quote: decision.quote, text: decision.text }, 'memory: decision quote not found in transcript — item dropped')
      continue
    }
    decisionItems.push({ id: `d${decisionItems.length + 1}`, decision, quote })
  }

  // 3. candidates + 4. resolve
  const candidates = selectCandidates(
    openTasks,
    [...taskItems.map((i) => `${i.task.title} ${i.task.description ?? ''} ${i.quote.quote}`), ...decisionItems.map((d) => d.decision.text)],
    deps.settings.candidateLimit,
  )
  let taskResolutions: TaskResolution[] = []
  let decisionResolutions: DecisionResolution[] = []
  if (taskItems.length > 0 || decisionItems.length > 0) {
    const items = [
      ...taskItems.map(
        (i) =>
          `${i.id} | ${i.task.title} | ${i.task.assignee ?? '—'} | ${i.task.due_date ?? '—'} | ${i.task.status_signal} | ${i.task.related_task_code ?? '—'} | «${i.quote.quote}»`,
      ),
      ...decisionItems.map((d) => `${d.id} | ${d.decision.text} | «${d.quote.quote}»`),
    ]
    const resolveReply = parseJsonObject(
      'MEMORY_RESOLVE',
      await call(
        'MEMORY_RESOLVE',
        RESOLVE_SYSTEM,
        `<candidates>\n${candidates.map(fmtTask).join('\n') || '(none)'}\n</candidates>\n\n` +
          `<recent_decisions>\n${recentDecisions.map((d) => `${d.code} | ${d.text}`).join('\n') || '(none)'}\n</recent_decisions>\n\n` +
          `<items>\n${items.join('\n')}\n</items>`,
        true,
        8192,
      ),
    )
    const tr = parseList(TaskResolution, resolveReply['tasks'])
    const dr = parseList(DecisionResolution, resolveReply['decisions'])
    if (tr.invalid.length || dr.invalid.length) {
      log.warn({ tasks: tr.invalid, decisions: dr.invalid }, 'memory: malformed resolutions rejected')
    }
    taskResolutions = tr.valid
    decisionResolutions = dr.valid
  }

  // 5. gate (D-14)
  const gate = applyGate({
    taskItems,
    decisionItems,
    candidates,
    recentDecisions,
    taskResolutions,
    decisionResolutions,
    participants: src.participants,
    threshold: deps.settings.confidenceThreshold,
    counters: { taskSeq: state.taskSeq, decisionSeq: state.decisionSeq },
    newId,
  })
  if (gate.rejected.length) log.warn({ rejected: gate.rejected }, 'memory: resolutions rejected by the validator')

  // 6. summary = previous + protocol + applied/pending changes
  const summaryMd = await call(
    'MEMORY_SUMMARY',
    SUMMARY_SYSTEM,
    `<previous_summary>\n${state.summaryMd ?? ''}\n</previous_summary>\n\n` +
      `<protocol>\n${src.protocolMarkdown ?? ''}\n</protocol>\n\n` +
      `<changes>\n${renderNotes(gate.notes)}\n</changes>`,
    false,
    4096,
  )

  // 7. one transaction — but first make sure the meeting was not deleted or moved while the
  //    LLM steps ran (the write also refuses a meeting/project tombstoned by the outbox)
  const still = await deps.loadMeeting(payload.meeting_id)
  if (!still || still.projectId !== payload.project_id || still.workspaceId !== payload.workspace_id) {
    return { status: 'SKIPPED', reason: 'meeting deleted or moved during the update' }
  }
  const now = (deps.now ?? (() => new Date()))().toISOString()
  const result = await writeMeetingUpdate(deps.graph, scope, {
    meeting: { id: src.meetingId, title: src.title, occurredAt: src.occurredAt },
    participants: src.participants.map((p) => ({ id: p.id, name: p.name })),
    expected: { taskSeq: state.taskSeq, decisionSeq: state.decisionSeq, meetingSeq: state.meetingSeq, memoryVersion: state.memoryVersion },
    newTasks: gate.newTasks,
    taskUpdates: gate.taskUpdates,
    newDecisions: gate.newDecisions,
    decisionMentions: gate.decisionMentions,
    memory: { id: newId(), summaryMd },
    now,
  })
  if (result.status === 'ALREADY_APPLIED') return result
  if (result.status === 'DELETED') return { status: 'SKIPPED', reason: 'meeting or project deleted from memory' }
  const allEvents = [...gate.newTasks.flatMap((t) => t.events), ...gate.taskUpdates.flatMap((u) => u.events)]
  return {
    status: 'APPLIED',
    memoryVersion: result.memoryVersion,
    createdTasks: result.createdTasks,
    events: result.events,
    pendingEvents: allEvents.filter((e) => e.reviewState === 'PENDING').length,
    createdDecisions: result.createdDecisions,
    droppedQuotes,
    rejected: gate.rejected.length,
  }
}

function renderNotes(notes: readonly ChangeNote[]): string {
  if (notes.length === 0) return '(без изменений реестра)'
  return notes.map((n) => `- ${n.text}${n.pending ? ' — на подтверждении' : ''}`).join('\n')
}
