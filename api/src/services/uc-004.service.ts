/**
 * UC-004-BE — Retry failed meeting processing: service layer
 *
 * retryMeetingProcessing(meetingId):
 *   1. Load Meeting by id. 404 if absent.
 *   2. Guard: Meeting.status must be FAILED → 409 MEETING_NOT_FAILED (RQ-036).
 *   3a. Idempotency guard: if any job is PENDING/PROCESSING → 409 RETRY_ALREADY_IN_FLIGHT (RQ-035).
 *   3b. Find the most recently FAILED job across both job tables (RQ-034).
 *      Only FAILED jobs are candidates — DONE jobs are never reset.
 *   4. One Prisma transaction: reset job (status=PENDING, attempt_count=0, error_msg=null)
 *      + transition Meeting.status → TRANSCRIBING | GENERATING_PROTOCOL (BRQ-008, RQ-034).
 *   5. After commit: enqueue to BullMQ (RQ-035) and publish SSE meeting.status.
 *
 * Note on job status: Prisma JobStatus uses PENDING as the "queued but not yet
 * started" state — equivalent to what the spec sometimes calls "QUEUED".
 * The spec enums are: PENDING | PROCESSING | DONE | FAILED.
 *
 * Note on Meeting.status: the Prisma schema uses 'GENERATING_PROTOCOL' (not
 * 'PROTOCOL_GENERATING' which appears in some spec wording). We follow Prisma/shared enums.
 */
import { prisma } from '../db.js'
import { AppError } from '../plugins/errors.js'
import { addTranscriptionJob, enqueueProtocolGenerationJob } from '../queue.js'
import { publishMeetingEvent } from '../sse/pubsub.js'
import { config } from '../config.js'

/** Shape returned by the retry endpoint — the updated Meeting. */
export interface RetryMeetingResult {
  id: string
  title: string
  status: string
  language: string
  createdAt: Date
  updatedAt: Date
}

/**
 * Find the most recently updated FAILED job across TranscriptionJob and
 * ProtocolGenerationJob for the given meeting (RQ-034).
 *
 * Only FAILED jobs are candidates — DONE/PENDING/PROCESSING jobs are excluded
 * so a completed stage can never be wrongly reset to PENDING.
 *
 * Returns { stage, jobId, status } or null if no FAILED job exists.
 * The caller checks the result to determine whether to proceed or return early.
 */
async function findMostRecentJob(meetingId: string): Promise<{
  stage: 'transcription' | 'protocol'
  jobId: string
  status: string
} | null> {
  const [transJob, protoJob] = await Promise.all([
    prisma.transcriptionJob.findFirst({
      where: { meetingId, status: 'FAILED' },
      orderBy: { updatedAt: 'desc' },
    }),
    prisma.protocolGenerationJob.findFirst({
      where: { meetingId, status: 'FAILED' },
      orderBy: { updatedAt: 'desc' },
    }),
  ])

  // Pick the most recently updated FAILED job among both types
  type Candidate = {
    stage: 'transcription' | 'protocol'
    job: { id: string; status: string; updatedAt: Date }
  }
  const candidates: Candidate[] = []
  if (transJob) candidates.push({ stage: 'transcription', job: transJob })
  if (protoJob) candidates.push({ stage: 'protocol', job: protoJob })

  if (candidates.length === 0) return null

  // Sort by updatedAt descending to find the most recently failed job
  candidates.sort((a, b) => b.job.updatedAt.getTime() - a.job.updatedAt.getTime())

  const winner = candidates[0]!
  return { stage: winner.stage, jobId: winner.job.id, status: winner.job.status }
}

/**
 * Re-enqueue the most recent FAILED job for a meeting and transition Meeting.status
 * back to the corresponding in-progress state.
 *
 * Throws:
 *   AppError('MEETING_NOT_FOUND', 404) — meeting does not exist
 *   AppError('MEETING_NOT_FAILED', 409) — Meeting.status !== FAILED (RQ-036)
 *   AppError('RETRY_ALREADY_IN_FLIGHT', 409) — job already PENDING/PROCESSING (RQ-035)
 *   AppError('INTERNAL_ERROR', 500) — unexpected DB / enqueue failure
 */
export async function retryMeetingProcessing(meetingId: string): Promise<RetryMeetingResult> {
  try {
    // Step 1: Load meeting
    const meeting = await prisma.meeting.findUnique({
      where: { id: meetingId },
    })

    if (!meeting) {
      throw new AppError('MEETING_NOT_FOUND', 404, `Meeting ${meetingId} not found`)
    }

    // Step 2: Guard — only FAILED meetings can be retried (RQ-036)
    if (meeting.status !== 'FAILED') {
      throw new AppError(
        'MEETING_NOT_FAILED',
        409,
        `Meeting ${meetingId} has status ${meeting.status}; retry is only allowed when status=FAILED`,
      )
    }

    // Step 3a: Idempotency guard (RQ-035) — reject if any job is currently in flight.
    // This check uses an unrestricted status query so PENDING/PROCESSING jobs are
    // visible even though they are excluded from the FAILED-job selection below.
    const [inFlightTrans, inFlightProto] = await Promise.all([
      prisma.transcriptionJob.findFirst({
        where: { meetingId, status: { in: ['PENDING', 'PROCESSING'] } },
        orderBy: { updatedAt: 'desc' },
      }),
      prisma.protocolGenerationJob.findFirst({
        where: { meetingId, status: { in: ['PENDING', 'PROCESSING'] } },
        orderBy: { updatedAt: 'desc' },
      }),
    ])
    const inFlightJob = inFlightTrans ?? inFlightProto
    if (inFlightJob) {
      throw new AppError(
        'RETRY_ALREADY_IN_FLIGHT',
        409,
        `Job ${inFlightJob.id} for meeting ${meetingId} is already ${inFlightJob.status}; retry is a no-op`,
      )
    }

    // Step 3b: Find the most recently FAILED job to re-enqueue (RQ-034).
    // Only FAILED jobs are candidates — DONE jobs must never be reset.
    const mostRecentJob = await findMostRecentJob(meetingId)

    if (!mostRecentJob) {
      // Meeting is FAILED but no FAILED job row exists — invariant violation
      throw new AppError(
        'INTERNAL_ERROR',
        500,
        `Meeting ${meetingId} is FAILED but no FAILED job row was found`,
      )
    }

    const { stage, jobId } = mostRecentJob

    // Determine the new Meeting.status for this stage (RQ-034)
    const newMeetingStatus = stage === 'transcription' ? 'TRANSCRIBING' : 'GENERATING_PROTOCOL'

    // Step 5: One Prisma transaction: reset job + transition Meeting.status (BRQ-008, RQ-034)
    let updatedMeeting!: RetryMeetingResult

    await prisma.$transaction(async (tx) => {
      // Reset the failed job: status=PENDING, attempt_count=0, error_msg=null
      if (stage === 'transcription') {
        await tx.transcriptionJob.update({
          where: { id: jobId },
          data: {
            status: 'PENDING',
            attemptCount: 0,
            errorMsg: null,
          },
        })
      } else {
        await tx.protocolGenerationJob.update({
          where: { id: jobId },
          data: {
            status: 'PENDING',
            attemptCount: 0,
            errorMsg: null,
          },
        })
      }

      // Transition Meeting.status FAILED → TRANSCRIBING | GENERATING_PROTOCOL
      const updated = await tx.meeting.update({
        where: { id: meetingId },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data: { status: newMeetingStatus as any },
      })

      updatedMeeting = {
        id: updated.id,
        title: updated.title,
        status: updated.status,
        language: updated.language,
        createdAt: updated.createdAt,
        updatedAt: updated.updatedAt,
      }
    })

    // Step 6: After commit — enqueue to BullMQ (RQ-035)
    try {
      if (stage === 'transcription') {
        await addTranscriptionJob({ transcription_job_id: jobId, speaker_count: null })
      } else {
        await enqueueProtocolGenerationJob({ protocol_generation_job_id: jobId })
      }
    } catch (enqueueErr) {
      // Enqueue failure is non-fatal: DB state is consistent.
      // A reconciliation worker can re-enqueue orphaned PENDING jobs.
      console.error('Failed to enqueue BullMQ retry job:', enqueueErr)
    }

    // Step 6: Publish SSE meeting.status after commit (RQ-035)
    try {
      await publishMeetingEvent(
        config.REDIS_URL,
        {
          type: 'meeting.status',
          meeting_id: meetingId,
          status: newMeetingStatus as 'TRANSCRIBING' | 'GENERATING_PROTOCOL',
          error_reason: null,
        },
        meetingId,
      )
    } catch (sseErr) {
      // SSE publish failure is non-fatal — best effort
      console.error('Failed to publish SSE event for retry:', sseErr)
    }

    return updatedMeeting
  } catch (err) {
    if (err instanceof AppError) throw err
    throw new AppError('INTERNAL_ERROR', 500, 'Failed to retry meeting processing', err)
  }
}
