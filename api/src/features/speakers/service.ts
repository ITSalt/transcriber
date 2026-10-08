/**
 * FR-004 / D-38 — speaker confirmation: label cards (GET) and confirmation (PUT).
 * Contract: shared/src/api/speakers.ts, .tl/external-contracts/speakers-confirmation.md.
 *
 * The API owns the confirmation write of `transcripts.speaker_map`; the worker pre-fills it
 * (self-introduction) and reads it again when it generates the protocol. `raw_text` is NOT
 * rewritten here — the worker rebuilds the labelled text from `segments_blob` + `speaker_map`.
 */
import type { Prisma } from '@prisma/client'
import {
  PROGRAM_ERRORS,
  PROGRAM_ERROR_MESSAGES,
  SPEAKER_SAMPLES_MAX,
  SPEAKER_SAMPLE_TEXT_MAX,
  type MeetingStatus,
  type ProgramErrorCode,
  type SpeakerLabel,
  type SpeakersPutRequest,
  type SpeakersPutResponse,
  type SpeakersResponse,
} from '@transcrib/shared'
import { config } from '../../config.js'
import { prisma } from '../../db.js'
import { AppError } from '../../plugins/errors.js'
import { enqueueProtocolGenerationJob } from '../../queue.js'
import { publishMeetingEvent } from '../../sse/pubsub.js'
import { notFound } from '../auth/access.js'

/** Statuses before the transcript is confirmed-ready: GET answers 409 for them. */
const BEFORE_SPEAKERS: ReadonlySet<string> = new Set(['CREATED', 'UPLOADING', 'UPLOADED', 'AWAITING_START', 'TRANSCRIBING'])

function programError(code: ProgramErrorCode, message?: string): AppError {
  return new AppError(code, PROGRAM_ERRORS[code], message ?? PROGRAM_ERROR_MESSAGES[code])
}

interface Segment {
  start: number
  end: number
  text: string
  speaker: string
}

function segmentsOf(blob: unknown): Segment[] {
  if (!Array.isArray(blob)) return []
  return blob.flatMap((s): Segment[] => {
    if (s === null || typeof s !== 'object') return []
    const o = s as Record<string, unknown>
    if (typeof o['speaker'] !== 'string' || typeof o['text'] !== 'string') return []
    const start = typeof o['start'] === 'number' ? o['start'] : 0
    const end = typeof o['end'] === 'number' ? o['end'] : start
    return [{ start, end, text: o['text'], speaker: o['speaker'] }]
  })
}

function mapOf(json: unknown): Record<string, string | null> {
  if (json === null || typeof json !== 'object' || Array.isArray(json)) return {}
  const out: Record<string, string | null> = {}
  for (const [k, v] of Object.entries(json)) out[k] = typeof v === 'string' ? v : null
  return out
}

const labelIndex = (label: string): number => Number(/^SPEAKER_(\d+)$/.exec(label)?.[1] ?? Number.MAX_SAFE_INTEGER)

/** Participant ids of the stored confirmation request, by label. */
function confirmedParticipants(mapping: unknown): Map<string, string> {
  const out = new Map<string, string>()
  const entries = (mapping as { mapping?: unknown } | null)?.mapping
  if (!Array.isArray(entries)) return out
  for (const e of entries) {
    const o = e as { label?: unknown; participant_id?: unknown }
    if (typeof o?.label === 'string' && typeof o.participant_id === 'string') out.set(o.label, o.participant_id)
  }
  return out
}

function truncate(text: string): string {
  const t = text.trim().replace(/\s+/g, ' ')
  return t.length <= SPEAKER_SAMPLE_TEXT_MAX ? t : `${t.slice(0, SPEAKER_SAMPLE_TEXT_MAX - 1)}…`
}

export function buildLabels(
  blob: unknown,
  speakerMap: unknown,
  speakerMapping: unknown,
): SpeakerLabel[] {
  const names = mapOf(speakerMap)
  const participants = confirmedParticipants(speakerMapping)
  const byLabel = new Map<string, Segment[]>()
  for (const seg of segmentsOf(blob)) {
    const list = byLabel.get(seg.speaker)
    if (list) list.push(seg)
    else byLabel.set(seg.speaker, [seg])
  }
  return [...byLabel.entries()]
    .sort(([a], [b]) => labelIndex(a) - labelIndex(b) || a.localeCompare(b))
    .map(([label, segs]) => {
      const longest = [...segs]
        .filter((s) => s.text.trim().length > 0)
        .sort((a, b) => b.end - b.start - (a.end - a.start) || a.start - b.start)
        .slice(0, SPEAKER_SAMPLES_MAX)
        .sort((a, b) => a.start - b.start)
      const n = labelIndex(label)
      return {
        label,
        display: Number.isFinite(n) && n !== Number.MAX_SAFE_INTEGER ? `Speaker ${n + 1}` : label,
        duration_sec: Math.round(segs.reduce((sum, s) => sum + Math.max(0, s.end - s.start), 0) * 10) / 10,
        segment_count: segs.length,
        samples: longest.map((s) => ({ start_ms: Math.round(s.start * 1000), text: truncate(s.text) })),
        name: names[label] ?? null,
        participant_id: participants.get(label) ?? null,
      }
    })
}

async function participantsOf(projectId: string | null): Promise<SpeakersResponse['participants']> {
  if (!projectId) return []
  const rows = await prisma.projectParticipant.findMany({
    where: { projectId },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: { id: true, name: true, role: true, organization: true },
  })
  return rows
}

export async function readSpeakers(meetingId: string, projectId: string | null): Promise<SpeakersResponse> {
  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
    select: { status: true, projectId: true, transcript: { select: { segmentsBlob: true, speakerMap: true, speakerMapping: true, speakersConfirmedAt: true } } },
  })
  if (!meeting) throw notFound()
  if (BEFORE_SPEAKERS.has(meeting.status) || !meeting.transcript) throw programError('MEETING_NOT_AWAITING_SPEAKERS')
  const t = meeting.transcript
  const pid = meeting.projectId ?? projectId
  return {
    meeting_id: meetingId,
    status: meeting.status as MeetingStatus,
    project_id: pid,
    participants: await participantsOf(pid),
    labels: buildLabels(t.segmentsBlob, t.speakerMap, t.speakerMapping),
    confirmed_at: t.speakersConfirmedAt ? t.speakersConfirmedAt.toISOString() : null,
  }
}

export async function confirmSpeakers(
  meetingId: string,
  body: SpeakersPutRequest,
  log: { error: (o: unknown, m: string) => void },
): Promise<SpeakersPutResponse> {
  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
    select: { status: true, projectId: true, transcript: { select: { segmentsBlob: true, speakerMap: true } } },
  })
  if (!meeting) throw notFound()
  if (meeting.status !== 'AWAITING_SPEAKERS' || !meeting.transcript) throw programError('MEETING_NOT_AWAITING_SPEAKERS')

  const speakerMap = mapOf(meeting.transcript.speakerMap)
  let nextMap: Record<string, string | null> = speakerMap
  let stored: { action: 'confirm' | 'skip'; mapping: unknown[] } = { action: 'skip', mapping: [] }

  if (body.action === 'confirm') {
    const known = new Set(segmentsOf(meeting.transcript.segmentsBlob).map((s) => s.speaker))
    const seen = new Set<string>()
    for (const e of body.mapping) {
      if (!known.has(e.label)) throw programError('UNKNOWN_SPEAKER_LABEL', `Неизвестная метка спикера: ${e.label}`)
      if (seen.has(e.label)) throw programError('UNKNOWN_SPEAKER_LABEL', `Метка спикера повторяется: ${e.label}`)
      seen.add(e.label)
    }
    // a participant of another project (or a nonexistent one) is the same 404 as a foreign meeting
    const ids = [...new Set(body.mapping.flatMap((e) => (e.participant_id ? [e.participant_id] : [])))]
    if (ids.length > 0 && !meeting.projectId) throw notFound()
    const found = ids.length
      ? await prisma.projectParticipant.findMany({
          where: { id: { in: ids }, projectId: meeting.projectId! },
          select: { id: true, name: true },
        })
      : []
    const nameOf = new Map(found.map((p) => [p.id, p.name]))
    if (nameOf.size !== ids.length) throw notFound()

    nextMap = { ...speakerMap }
    const normalized = body.mapping.map((e) => {
      const free = e.name?.trim() || null
      const participantId = e.participant_id ?? null
      nextMap[e.label] = participantId ? (nameOf.get(participantId) ?? null) : free
      return { label: e.label, participant_id: participantId, name: participantId ? null : free }
    })
    stored = { action: 'confirm', mapping: normalized }
  }

  const jobId = await prisma.$transaction(async (tx) => {
    // the status flip is the guard: of two concurrent PUTs exactly one gets count 1
    const flipped = await tx.meeting.updateMany({
      where: { id: meetingId, status: 'AWAITING_SPEAKERS' },
      data: { status: 'GENERATING_PROTOCOL' },
    })
    if (flipped.count !== 1) throw programError('MEETING_NOT_AWAITING_SPEAKERS')
    await tx.transcript.update({
      where: { meetingId },
      data: {
        speakerMap: nextMap as Prisma.InputJsonObject,
        speakerMapping: stored as unknown as Prisma.InputJsonObject,
        speakersConfirmedAt: new Date(),
      },
    })
    const job = await tx.protocolGenerationJob.upsert({
      where: { meetingId },
      create: { meetingId },
      update: { status: 'PENDING', startedAt: null, finishedAt: null, errorMsg: null, attemptCount: 0 },
    })
    return job.id
  })

  // after commit, like uc-004: a failed enqueue / publish leaves a consistent DB (PENDING job)
  try {
    await enqueueProtocolGenerationJob({ protocol_generation_job_id: jobId })
  } catch (err) {
    log.error({ err }, 'Failed to enqueue BullMQ protocol generation job')
  }
  try {
    await publishMeetingEvent(
      config.REDIS_URL,
      { type: 'meeting.status', meeting_id: meetingId, status: 'GENERATING_PROTOCOL', error_reason: null },
      meetingId,
    )
  } catch (err) {
    log.error({ err }, 'Failed to publish SSE event for speaker confirmation')
  }
  return { meeting_id: meetingId, status: 'GENERATING_PROTOCOL' }
}
