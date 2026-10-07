/**
 * FR-006 — what the memory module reads from / writes to Postgres (Prisma): the meeting
 * source for the pipeline, ProtocolGeneration rows of the memory steps, the trigger lookup
 * after a protocol job, and the GraphOutbox rows. Never touches Meeting / Protocol status.
 */
import type { PrismaClient } from '@prisma/client'
import type { GenerationRecord, MeetingSource } from './pipeline.js'
import type { OutboxRepo, OutboxRow } from './outbox.js'
import { toMemorySegments } from './transcript.js'

export function createMeetingLoader(prisma: PrismaClient) {
  return async (meetingId: string): Promise<MeetingSource | null> => {
    const m = await prisma.meeting.findUnique({
      where: { id: meetingId },
      select: {
        id: true,
        title: true,
        createdAt: true,
        workspaceId: true,
        projectId: true,
        transcript: { select: { segmentsBlob: true, speakerMap: true } },
        protocol: { select: { markdownContent: true } },
        project: { select: { participants: { select: { id: true, name: true, aliases: true }, orderBy: { createdAt: 'asc' } } } },
      },
    })
    if (!m) return null
    return {
      meetingId: m.id,
      workspaceId: m.workspaceId,
      projectId: m.projectId,
      title: m.title,
      occurredAt: m.createdAt.toISOString(),
      segments: toMemorySegments(m.transcript?.segmentsBlob, m.transcript?.speakerMap),
      protocolMarkdown: m.protocol?.markdownContent ?? null,
      participants: m.project?.participants ?? [],
    }
  }
}

export function createGenerationRecorder(prisma: PrismaClient) {
  return async (r: GenerationRecord): Promise<void> => {
    await prisma.protocolGeneration.create({
      data: {
        meetingId: r.meetingId,
        kind: r.kind,
        model: r.model,
        promptVersion: r.promptVersion,
        inputTokens: r.inputTokens,
        outputTokens: r.outputTokens,
      },
    })
  }
}

/** protocolJobCompleted → the meeting to update, or null (job not DONE / meeting without project). */
export function createProtocolJobLookup(prisma: PrismaClient) {
  return async (protocolGenerationJobId: string) => {
    const job = await prisma.protocolGenerationJob.findUnique({
      where: { id: protocolGenerationJobId },
      select: { status: true, meeting: { select: { id: true, projectId: true, workspaceId: true } } },
    })
    if (!job || job.status !== 'DONE' || !job.meeting.projectId || !job.meeting.workspaceId) return null
    return { meeting_id: job.meeting.id, project_id: job.meeting.projectId, workspace_id: job.meeting.workspaceId }
  }
}

const MAX_ERROR_LENGTH = 2000

export function createOutboxRepo(prisma: PrismaClient): OutboxRepo {
  return {
    async pending(limit: number): Promise<OutboxRow[]> {
      const rows = await prisma.graphOutbox.findMany({
        where: { doneAt: null },
        orderBy: { createdAt: 'asc' },
        take: limit,
        select: { id: true, op: true, payload: true, attempts: true },
      })
      return rows
    },
    async markDone(id: string, at: Date): Promise<void> {
      await prisma.graphOutbox.update({ where: { id }, data: { doneAt: at, lastError: null } })
    },
    async markFailed(id: string, error: string): Promise<void> {
      await prisma.graphOutbox.update({
        where: { id },
        data: { attempts: { increment: 1 }, lastError: error.slice(0, MAX_ERROR_LENGTH) },
      })
    },
  }
}
