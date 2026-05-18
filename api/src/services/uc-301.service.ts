/**
 * UC-301-BE — Review and edit protocol: service layer
 *
 * GET: load Protocol by meeting_id; gate on Meeting.status in {PROTOCOL_READY, EDITED} (RQ-029).
 * PUT (save): in a transaction:
 *   - UPDATE Protocol: markdown_content, version+1, edit_count+1, last_edited_at=now (RQ-027/028)
 *   - UPDATE Meeting.status -> EDITED if not already (RQ-029)
 *   - Return updated metadata in response (RQ-029)
 *   - Reject save if Meeting.status NOT in {PROTOCOL_READY, EDITED} (409) (RQ-029)
 *
 * BRQ-008 / BRQ-014 / BRQ-015 / BRQ-018: All enforced here.
 */
import type { ProtocolResponse, ProtocolSaveResponse } from '@transcrib/shared'
import { prisma } from '../db.js'
import { AppError } from '../plugins/errors.js'

/**
 * MeetingStatus values that allow reading or editing the protocol.
 * RQ-029: gate on Meeting.status in {PROTOCOL_READY, EDITED}.
 */
const PROTOCOL_EDITABLE_STATUSES = new Set(['PROTOCOL_READY', 'EDITED'])

/**
 * Load and return the current Protocol DTO for a given meeting.
 *
 * Throws AppError('PROTOCOL_NOT_FOUND', 404) when no meeting or protocol exists.
 * Throws AppError('STATUS_NOT_READY', 409) when Meeting.status not in {PROTOCOL_READY, EDITED}.
 * Throws AppError('INTERNAL_ERROR', 500) on unexpected DB failure.
 *
 * RQ-029: gate on Meeting.status in {PROTOCOL_READY, EDITED}.
 */
export async function getProtocol(meetingId: string): Promise<ProtocolResponse> {
  try {
    const meeting = await prisma.meeting.findUnique({
      where: { id: meetingId },
      include: { protocol: true },
    })

    if (!meeting) {
      throw new AppError('PROTOCOL_NOT_FOUND', 404, `Meeting ${meetingId} not found`)
    }

    // RQ-029: gate on Meeting.status in {PROTOCOL_READY, EDITED}
    if (!PROTOCOL_EDITABLE_STATUSES.has(meeting.status)) {
      throw new AppError(
        'STATUS_NOT_READY',
        409,
        `Meeting ${meetingId} has status ${meeting.status}; protocol is not ready yet`,
      )
    }

    if (!meeting.protocol) {
      throw new AppError(
        'PROTOCOL_NOT_FOUND',
        404,
        `Protocol for meeting ${meetingId} not found`,
      )
    }

    const p = meeting.protocol

    return {
      id: p.id,
      meeting_id: p.meetingId,
      // RQ-030: canonical Markdown (BRQ-018)
      markdown_content: p.markdownContent,
      version: p.version,
      edit_count: p.editCount,
      generated_at: p.generatedAt.toISOString(),
      last_edited_at: p.lastEditedAt ? p.lastEditedAt.toISOString() : null,
    }
  } catch (err) {
    if (err instanceof AppError) throw err
    throw new AppError('INTERNAL_ERROR', 500, 'Failed to fetch protocol', err)
  }
}

/**
 * Atomically save edited Markdown, bump version+1 and edit_count+1, set last_edited_at=now,
 * and transition Meeting.status to EDITED if not already.
 *
 * RQ-027: Each save increments version by exactly 1 (BRQ-014); monotonic.
 * RQ-028: Each save increments edit_count by exactly 1 (BRQ-015).
 * RQ-029: First save: Meeting.status PROTOCOL_READY -> EDITED. Subsequent saves keep EDITED.
 * RQ-030: Edits operate on canonical Markdown (BRQ-018).
 * BRQ-008: All Meeting.status transitions co-occur with the relevant child write in one tx.
 */
export async function saveProtocol(
  meetingId: string,
  markdownContent: string,
): Promise<ProtocolSaveResponse> {
  try {
    const meeting = await prisma.meeting.findUnique({
      where: { id: meetingId },
      include: { protocol: true },
    })

    if (!meeting) {
      throw new AppError('PROTOCOL_NOT_FOUND', 404, `Meeting ${meetingId} not found`)
    }

    // RQ-029: Reject save if Meeting.status NOT in {PROTOCOL_READY, EDITED}
    if (!PROTOCOL_EDITABLE_STATUSES.has(meeting.status)) {
      throw new AppError(
        'STATUS_NOT_READY',
        409,
        `Meeting ${meetingId} has status ${meeting.status}; cannot save protocol edits`,
      )
    }

    if (!meeting.protocol) {
      throw new AppError(
        'PROTOCOL_NOT_FOUND',
        404,
        `Protocol for meeting ${meetingId} not found`,
      )
    }

    const now = new Date()

    // RQ-027/028/029/BRQ-008: All writes in a single transaction
    const [updatedProtocol] = await prisma.$transaction([
      // RQ-027: version+1 (BRQ-014 monotonic); RQ-028: edit_count+1 (BRQ-015)
      prisma.protocol.update({
        where: { meetingId },
        data: {
          // RQ-030: canonical Markdown (BRQ-018)
          markdownContent: markdownContent,
          // RQ-027: increment version by exactly 1
          version: { increment: 1 },
          // RQ-028: increment edit_count by exactly 1
          editCount: { increment: 1 },
          // RQ-029: record manual save timestamp
          lastEditedAt: now,
        },
      }),
      // RQ-029: Transition Meeting.status to EDITED (BRQ-008 — co-occurs with protocol write)
      prisma.meeting.update({
        where: { id: meetingId },
        data: {
          status: 'EDITED',
          updatedAt: now,
        },
      }),
    ])

    return {
      version: updatedProtocol.version,
      edit_count: updatedProtocol.editCount,
      last_edited_at: updatedProtocol.lastEditedAt!.toISOString(),
      meeting_status: 'EDITED',
    }
  } catch (err) {
    if (err instanceof AppError) throw err
    throw new AppError('INTERNAL_ERROR', 500, 'Failed to save protocol', err)
  }
}
