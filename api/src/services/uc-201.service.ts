/**
 * UC-201-BE — View and download transcript: service layer
 *
 * Loads a Transcript by meeting_id, gates on Meeting.status >= TRANSCRIBED,
 * and maps the Prisma model to the TranscriptResponse DTO.
 *
 * RQ-019: Transcript view MUST display each segment with its speaker label
 *         (resolved from speaker_map or 'Speaker N') and minute/second timestamps.
 * RQ-020: Download produces a plain-text file (.txt) with verbatim transcript
 *         + speaker labels + timestamps.
 */
import type { TranscriptResponse } from '@transcrib/shared'
import { prisma } from '../db.js'
import { AppError } from '../plugins/errors.js'

/**
 * MeetingStatus values that indicate a transcript exists and is accessible.
 * Any status in this set means Meeting.status >= TRANSCRIBED (BRQ-008 mirror).
 */
const TRANSCRIPT_READY_STATUSES = new Set([
  'TRANSCRIBED',
  'GENERATING_PROTOCOL',
  'PROTOCOL_READY',
  'EDITED',
])

/**
 * Load and return the transcript DTO for a given meeting.
 *
 * Throws AppError('STATUS_NOT_READY', 409) when Meeting.status < TRANSCRIBED.
 * Throws AppError('TRANSCRIPT_NOT_FOUND', 404) when no transcript or meeting exists.
 * Throws AppError('INTERNAL_ERROR', 500) on unexpected DB failure.
 */
export async function getTranscript(meetingId: string): Promise<TranscriptResponse> {
  try {
    const meeting = await prisma.meeting.findUnique({
      where: { id: meetingId },
      include: {
        transcript: true,
      },
    })

    if (!meeting) {
      throw new AppError('TRANSCRIPT_NOT_FOUND', 404, `Meeting ${meetingId} not found`)
    }

    // Gate on Meeting.status >= TRANSCRIBED (RQ-019 — transcript must be produced first)
    if (!TRANSCRIPT_READY_STATUSES.has(meeting.status)) {
      throw new AppError(
        'STATUS_NOT_READY',
        409,
        `Meeting ${meetingId} has status ${meeting.status}; transcript is not ready yet`,
      )
    }

    if (!meeting.transcript) {
      // RQ-019: meeting is in a transcript-ready status but no Transcript row exists
      throw new AppError('TRANSCRIPT_NOT_FOUND', 404, `Transcript for meeting ${meetingId} not found`)
    }

    const t = meeting.transcript

    // Derive segments_count and speakers_count from segmentsBlob JSON array
    // segmentsBlob is JSONB stored as an array of utterance objects
    const segments = Array.isArray(t.segmentsBlob) ? t.segmentsBlob : []
    const segmentsCount = segments.length

    // Count distinct speaker IDs from segments (each segment may have a speaker field)
    // or fall back to speakerMap key count if no segments
    const speakerIds = new Set<string>()
    for (const seg of segments) {
      if (
        seg !== null &&
        typeof seg === 'object' &&
        'speaker' in (seg as object) &&
        typeof (seg as Record<string, unknown>)['speaker'] === 'string'
      ) {
        speakerIds.add((seg as Record<string, unknown>)['speaker'] as string)
      }
    }

    // If speaker IDs are not in segments, derive from speakerMap keys
    const rawSpeakerMap =
      t.speakerMap !== null &&
      typeof t.speakerMap === 'object' &&
      !Array.isArray(t.speakerMap)
        ? (t.speakerMap as Record<string, string | null>)
        : null

    // Return null for empty speaker map (no named speakers)
    const speakerMap =
      rawSpeakerMap !== null && Object.keys(rawSpeakerMap).length > 0
        ? rawSpeakerMap
        : null

    const speakersCount =
      speakerIds.size > 0
        ? speakerIds.size
        : speakerMap !== null
          ? Object.keys(speakerMap).length
          : 0

    return {
      id: t.id,
      meeting_id: t.meetingId,
      // RQ-019: rawText holds the verbatim transcript with speaker labels + timestamps
      full_text: t.rawText ?? '',
      segments_count: segmentsCount,
      speakers_count: speakersCount,
      // language: from Meeting (Transcript has no own language field in Prisma schema)
      language: meeting.language,
      speaker_map: speakerMap,
      created_at: t.createdAt.toISOString(),
    }
  } catch (err) {
    if (err instanceof AppError) throw err
    throw new AppError('INTERNAL_ERROR', 500, 'Failed to fetch transcript', err)
  }
}

/**
 * Build the plain-text download content for a transcript.
 * RQ-020: plain-text file with verbatim transcript + speaker labels + timestamps.
 *
 * Returns { content, filename } where filename follows:
 *   '<meeting-title>-transcript.txt' or '<filename-fallback>-transcript.txt'
 */
export async function getTranscriptDownload(
  meetingId: string,
): Promise<{ content: string; filename: string }> {
  try {
    const meeting = await prisma.meeting.findUnique({
      where: { id: meetingId },
      include: {
        transcript: true,
        recording: { select: { storageUri: true } },
      },
    })

    if (!meeting) {
      throw new AppError('TRANSCRIPT_NOT_FOUND', 404, `Meeting ${meetingId} not found`)
    }

    // Gate on Meeting.status >= TRANSCRIBED (RQ-020)
    if (!TRANSCRIPT_READY_STATUSES.has(meeting.status)) {
      throw new AppError(
        'STATUS_NOT_READY',
        409,
        `Meeting ${meetingId} has status ${meeting.status}; transcript is not ready yet`,
      )
    }

    if (!meeting.transcript) {
      throw new AppError('TRANSCRIPT_NOT_FOUND', 404, `Transcript for meeting ${meetingId} not found`)
    }

    // RQ-020: filename = '<meeting-title>-transcript.txt' (or filename fallback)
    const baseName = meeting.title
      ? meeting.title
      : meeting.recording?.storageUri
        ? filenameWithoutExt(meeting.recording.storageUri)
        : meetingId

    const filename = `${sanitizeFilename(baseName)}-transcript.txt`
    const content = meeting.transcript.rawText ?? ''

    return { content, filename }
  } catch (err) {
    if (err instanceof AppError) throw err
    throw new AppError('INTERNAL_ERROR', 500, 'Failed to fetch transcript for download', err)
  }
}

/**
 * Extract the filename (without extension) from an s3://bucket/key URI.
 */
function filenameWithoutExt(storageUri: string): string {
  const parts = storageUri.split('/')
  const base = parts[parts.length - 1] ?? storageUri
  const dotIdx = base.lastIndexOf('.')
  return dotIdx > 0 ? base.slice(0, dotIdx) : base
}

/**
 * Remove characters that are invalid in Content-Disposition filenames.
 * Replaces spaces and special characters with hyphens.
 */
function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9_\-().]/g, '-').replace(/-{2,}/g, '-')
}
