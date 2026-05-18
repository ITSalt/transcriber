/**
 * UC-001-BE — View meeting catalog: service layer
 *
 * Queries all meetings sorted by updated_at DESC and left-joins Recording
 * for duration_sec. Maps Prisma model → MeetingListItem DTO.
 *
 * RQ-001: Meeting catalog MUST sort meetings by updated_at descending.
 * RQ-003: AUTHOR sees only own meetings; deferred until auth (NFR-007), so
 *         MVP returns all meetings.
 */
import type { MeetingListItem, MeetingListResponse } from '@transcrib/shared'
import { prisma } from '../db.js'
import { AppError } from '../plugins/errors.js'

/**
 * Derive a display filename from the storage URI (s3://bucket/key).
 * Used as the `filename` fallback field required by MeetingListItem.
 */
function filenameFromUri(storageUri: string): string {
  // s3://bucket/some/path/filename.mp4  → "filename.mp4"
  const parts = storageUri.split('/')
  return parts[parts.length - 1] ?? storageUri
}

/**
 * Return the full meeting list sorted by updated_at DESC.
 * RQ-001, RQ-003 (MVP scope = all)
 */
export async function listMeetings(): Promise<MeetingListResponse> {
  try {
    const meetings = await prisma.meeting.findMany({
      // RQ-001: sort by updated_at descending
      orderBy: { updatedAt: 'desc' },
      include: {
        // Left-join Recording to obtain duration_sec
        recording: {
          select: {
            durationSec: true,
            storageUri: true,
          },
        },
      },
    })

    const items: MeetingListItem[] = meetings.map((m) => ({
      id: m.id,
      // title: non-nullable in Prisma schema but nullable in DTO contract
      // (schema will be relaxed when upload flow sets real titles)
      title: m.title ?? null,
      // filename: derive from recording storage URI, or fall back to title or id
      filename: m.recording?.storageUri
        ? filenameFromUri(m.recording.storageUri)
        : (m.title ?? m.id),
      status: m.status,
      language: m.language ?? null,
      // uploaded_at: Meeting has no dedicated uploaded_at; use createdAt
      uploaded_at: m.createdAt.toISOString(),
      updated_at: m.updatedAt.toISOString(),
      // duration_sec: Float? in Prisma → Int? in DTO (truncate fractional seconds)
      duration_sec:
        m.recording?.durationSec != null
          ? Math.trunc(m.recording.durationSec)
          : null,
    }))

    return { items }
  } catch (err) {
    if (err instanceof AppError) throw err
    throw new AppError('INTERNAL_ERROR', 500, 'Failed to fetch meetings', err)
  }
}
