/**
 * UC-002-BE — View meeting detail: service layer
 *
 * Loads a single Meeting by id with eager joins:
 *   - Recording (metadata)
 *   - TranscriptionJob (latest status, error)
 *   - ProtocolGenerationJob (latest status, error)
 *   - Transcript / Protocol existence flags
 *
 * RQ-003: AUTHOR sees only own meetings; deferred until auth (NFR-007), so
 *         MVP returns any meeting by id.
 * RQ-004: error_reason is surfaced from the latest job when Meeting.status=ERROR.
 */
import type { MeetingDetailResponse } from '@transcrib/shared'
import { prisma } from '../db.js'
import { AppError } from '../plugins/errors.js'

/**
 * Derive a display filename from the storage URI (s3://bucket/key).
 */
function filenameFromUri(storageUri: string): string {
  const parts = storageUri.split('/')
  return parts[parts.length - 1] ?? storageUri
}

/**
 * Return full meeting detail for the given meeting id.
 * Throws AppError('MEETING_NOT_FOUND', 404) if the meeting does not exist.
 * RQ-004, RQ-003/NFR-007
 */
export async function getMeetingDetail(id: string): Promise<MeetingDetailResponse> {
  try {
    const meeting = await prisma.meeting.findUnique({
      where: { id },
      include: {
        recording: true,
        transcriptionJob: true,
        transcript: { select: { id: true } },
        protocolGenJob: true,
        protocol: { select: { id: true } },
      },
    })

    if (!meeting) {
      // 404 on missing meeting id (per api-contract.md)
      throw new AppError('MEETING_NOT_FOUND', 404, `Meeting ${id} not found`)
    }

    // recording must exist for a meeting that has progressed past CREATED;
    // however the schema allows it to be null (optional relation), so we guard.
    if (!meeting.recording) {
      throw new AppError(
        'MEETING_NOT_FOUND',
        404,
        `Recording for meeting ${id} not found`,
      )
    }

    const rec = meeting.recording

    return {
      meeting: {
        id: meeting.id,
        title: meeting.title ?? null,
        language: meeting.language ?? null,
        status: meeting.status,
        // Meeting has no dedicated uploaded_at; use createdAt
        uploaded_at: meeting.createdAt.toISOString(),
        updated_at: meeting.updatedAt.toISOString(),
      },
      recording: {
        filename: filenameFromUri(rec.storageUri),
        // BigInt → number; recordings are ≤ 500 MB (BRQ-001) so safe to cast
        size_bytes: Number(rec.sizeBytes),
        mime_type: rec.mimeType,
        // Float? → Int? (truncate fractional seconds)
        duration_sec: rec.durationSec != null ? Math.trunc(rec.durationSec) : null,
      },
      // RQ-004: surface error_reason (errorMsg in Prisma) from the latest job
      latest_transcription_job: meeting.transcriptionJob
        ? {
            status: meeting.transcriptionJob.status,
            started_at: meeting.transcriptionJob.startedAt?.toISOString() ?? null,
            completed_at: meeting.transcriptionJob.finishedAt?.toISOString() ?? null,
            error_reason: meeting.transcriptionJob.errorMsg ?? null,
          }
        : null,
      latest_protocol_job: meeting.protocolGenJob
        ? {
            status: meeting.protocolGenJob.status,
            started_at: meeting.protocolGenJob.startedAt?.toISOString() ?? null,
            completed_at: meeting.protocolGenJob.finishedAt?.toISOString() ?? null,
            error_reason: meeting.protocolGenJob.errorMsg ?? null,
          }
        : null,
      transcript_exists: meeting.transcript !== null,
      protocol_exists: meeting.protocol !== null,
    }
  } catch (err) {
    if (err instanceof AppError) throw err
    throw new AppError('INTERNAL_ERROR', 500, 'Failed to fetch meeting detail', err)
  }
}
