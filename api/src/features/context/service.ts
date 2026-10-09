/**
 * FR-004 / D-9, D-10 — meeting context: draft (PUT), frozen snapshot + start (POST /start),
 * last protocol of a project. Routes: ./routes.ts and ../projects/routes.ts.
 */
import { createHash } from 'node:crypto'
import type { Prisma } from '@prisma/client'
import {
  canonicalSnapshotJson,
  MeetingContextSnapshot,
  PREVIOUS_PROTOCOL_MAX_CHARS,
  PROGRAM_ERRORS,
  PROGRAM_ERROR_MESSAGES,
  type LastProtocolResponse,
  type MeetingContextPut,
  type MeetingContextResponse,
  type ProgramErrorCode,
} from '@transcrib/shared'
import { prisma } from '../../db.js'
import { addTranscriptionJob } from '../../queue.js'
import { AppError } from '../../plugins/errors.js'
import { notFound } from '../auth/access.js'

type Db = Prisma.TransactionClient

export function programError(code: ProgramErrorCode): AppError {
  return new AppError(code, PROGRAM_ERRORS[code], PROGRAM_ERROR_MESSAGES[code])
}

export const previousProtocolUnavailable = (): AppError => programError('PREVIOUS_PROTOCOL_UNAVAILABLE')

/** The newest protocol among the project's meetings, in its current (edited) text. */
export async function lastProtocolOf(projectId: string, db: Db | typeof prisma = prisma): Promise<LastProtocolResponse | null> {
  const protocol = await db.protocol.findFirst({
    where: { meeting: { projectId } },
    orderBy: [{ generatedAt: 'desc' }, { id: 'asc' }],
    include: { meeting: { select: { id: true, title: true } } },
  })
  if (!protocol) return null
  const latest = await db.protocolVersion.aggregate({ where: { meetingId: protocol.meetingId }, _max: { n: true } })
  return {
    meeting_id: protocol.meeting.id,
    meeting_title: protocol.meeting.title,
    version_n: latest._max.n ?? protocol.version,
    markdown: protocol.markdownContent,
    created_at: protocol.generatedAt.toISOString(),
  }
}

type ContextRow = {
  meetingId: string
  meetingType: MeetingContextSnapshot['meeting_type']
  goal: string | null
  agenda: string | null
  participants: unknown
  glossary: unknown
  previousProtocol: unknown
  notes: string | null
  snapshotHash: string | null
  updatedAt: Date
}

const EMPTY: MeetingContextSnapshot = {
  meeting_type: null,
  goal: null,
  agenda: null,
  participants: [],
  glossary: [],
  previous_protocol: { source: 'none' },
  notes: null,
}

function snapshotOf(row: ContextRow | null): MeetingContextSnapshot {
  if (!row) return EMPTY
  return MeetingContextSnapshot.parse({
    meeting_type: row.meetingType,
    goal: row.goal,
    agenda: row.agenda,
    participants: row.participants,
    glossary: row.glossary,
    previous_protocol: row.previousProtocol,
    notes: row.notes,
  })
}

export function contextResponse(row: ContextRow, projectId: string | null): MeetingContextResponse {
  return {
    ...snapshotOf(row),
    meeting_id: row.meetingId,
    project_id: projectId,
    snapshot_hash: row.snapshotHash,
    frozen: row.snapshotHash !== null,
    updated_at: row.updatedAt.toISOString(),
  }
}

export async function readContext(meetingId: string): Promise<MeetingContextResponse> {
  const meeting = await prisma.meeting.findUnique({ where: { id: meetingId }, select: { projectId: true, context: true } })
  if (!meeting?.context) throw notFound()
  return contextResponse(meeting.context, meeting.projectId)
}

/** Saves the DRAFT. Only while AWAITING_START — the guarded update also serialises with /start. */
export async function saveDraft(meetingId: string, projectId: string | null, body: MeetingContextPut): Promise<MeetingContextResponse> {
  return prisma.$transaction(async (tx) => {
    const guarded = await tx.meeting.updateMany({ where: { id: meetingId, status: 'AWAITING_START' }, data: { projectId } })
    if (guarded.count === 0) throw programError('CONTEXT_FROZEN')
    // the project's last protocol is resolved at /start, never trusted from the client
    const previousProtocol =
      body.previous_protocol.source === 'project' ? { source: 'project', meeting_id: null, text: null } : body.previous_protocol
    const data = {
      meetingType: body.meeting_type,
      goal: body.goal,
      agenda: body.agenda,
      participants: body.participants as unknown as Prisma.InputJsonValue,
      glossary: body.glossary as unknown as Prisma.InputJsonValue,
      previousProtocol: previousProtocol as unknown as Prisma.InputJsonValue,
      notes: body.notes,
    }
    const row = await tx.meetingContext.upsert({ where: { meetingId }, create: { meetingId, ...data }, update: data })
    return contextResponse(row, projectId)
  })
}

export interface StartResult {
  snapshotHash: string
  transcriptionJobId: string
}

/**
 * Freezes the snapshot (project card + meeting additions + previous protocol text) and moves
 * AWAITING_START → TRANSCRIBING in one transaction. A second /start finds the meeting no
 * longer AWAITING_START → 409 (the claim is an UPDATE … WHERE status, so a race has one winner).
 */
export async function freezeAndStart(meetingId: string): Promise<StartResult> {
  return prisma.$transaction(async (tx) => {
    const claimed = await tx.meeting.updateMany({ where: { id: meetingId, status: 'AWAITING_START' }, data: { status: 'TRANSCRIBING' } })
    if (claimed.count === 0) throw programError('MEETING_NOT_AWAITING_START')

    const meeting = await tx.meeting.findUniqueOrThrow({
      where: { id: meetingId },
      select: { projectId: true, context: true, transcriptionJob: { select: { id: true, status: true } } },
    })
    const job = meeting.transcriptionJob
    if (!job || job.status !== 'PENDING') {
      throw new AppError('INTERNAL_ERROR', 500, 'Meeting awaits start without a pending transcription job')
    }

    const draft = snapshotOf(meeting.context)
    const projectParticipants = meeting.projectId
      ? await tx.projectParticipant.findMany({ where: { projectId: meeting.projectId }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] })
      : []
    const projectTerms = meeting.projectId
      ? await tx.glossaryTerm.findMany({ where: { projectId: meeting.projectId }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] })
      : []

    let previous = draft.previous_protocol
    if (previous.source === 'project') {
      const last = meeting.projectId ? await lastProtocolOf(meeting.projectId, tx) : null
      if (!last) throw previousProtocolUnavailable()
      // D-25: never truncated — the author picks «без протокола» or pastes a fragment
      if (last.markdown.length > PREVIOUS_PROTOCOL_MAX_CHARS) throw programError('PREVIOUS_PROTOCOL_TOO_LONG')
      previous = { source: 'project', meeting_id: last.meeting_id, text: last.markdown }
    }

    const snapshot = MeetingContextSnapshot.parse({
      ...draft,
      participants: [
        ...projectParticipants.map((p) => ({
          name: p.name,
          aliases: p.aliases,
          role: p.role,
          organization: p.organization,
          side: p.side,
          source: 'project',
          participant_id: p.id,
        })),
        ...draft.participants.filter((p) => p.source === 'meeting'),
      ],
      glossary: [
        ...projectTerms.map((t) => ({
          term: t.term,
          variants: t.variants,
          definition: t.definition,
          asr_keyterm: t.asrKeyterm,
          source: 'project',
          term_id: t.id,
        })),
        ...draft.glossary.filter((t) => t.source === 'meeting'),
      ],
      previous_protocol: previous,
    })
    const snapshotHash = createHash('sha256').update(canonicalSnapshotJson(snapshot)).digest('hex')

    const data = {
      meetingType: snapshot.meeting_type,
      goal: snapshot.goal,
      agenda: snapshot.agenda,
      participants: snapshot.participants as unknown as Prisma.InputJsonValue,
      glossary: snapshot.glossary as unknown as Prisma.InputJsonValue,
      previousProtocol: snapshot.previous_protocol as unknown as Prisma.InputJsonValue,
      notes: snapshot.notes,
      snapshotHash,
    }
    await tx.meetingContext.upsert({ where: { meetingId }, create: { meetingId, ...data }, update: data })

    return { snapshotHash, transcriptionJobId: job.id }
  })
}

/** Same payload and queue as an immediate start in finalizeUpload (uc-100.service.ts). */
export async function enqueueTranscription(result: StartResult, log: { error: (o: unknown, m: string) => void }): Promise<void> {
  try {
    await addTranscriptionJob({ transcription_job_id: result.transcriptionJobId })
  } catch (err) {
    // the job row exists (PENDING); like finalizeUpload, an enqueue failure is not fatal here
    log.error({ err }, 'Failed to enqueue BullMQ transcription job')
  }
}
