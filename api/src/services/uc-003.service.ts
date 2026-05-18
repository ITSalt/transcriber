/**
 * UC-003-BE — Delete meeting: service layer
 *
 * Steps (per impl-brief.md):
 *   1. Load Meeting + Recording (to get storageUri) + jobs (to check IN_PROGRESS).
 *   2. Throw MEETING_NOT_FOUND (404) if Meeting does not exist.
 *   3. In a DB transaction:
 *      a. Mark any PROCESSING TranscriptionJob/ProtocolGenerationJob → FAILED
 *         with error_reason='deleted by user' (RQ-007).
 *      b. Delete Meeting — Prisma onDelete:Cascade removes all child rows.
 *   4. Delete the S3 storage object via IStorage (RQ-006).
 *   5. Return { deleted: true, in_flight_failed } — in_flight_failed=true when
 *      at least one job was PROCESSING at delete time (RQ-007).
 *
 * BRQ-009: Already-terminal jobs (DONE/FAILED) preserve immutability — we only
 *          mutate PROCESSING (IN_PROGRESS) jobs.
 * NFR-007: No auth at MVP — ownership is unchecked (RQ-003 deferred).
 */
import type { IStorage } from '@transcrib/shared'
import { StorageError, StorageNotFoundError } from '@transcrib/shared'
import { prisma } from '../db.js'
import { AppError } from '../plugins/errors.js'

export interface DeleteMeetingResult {
  deleted: true
  in_flight_failed: boolean
}

/**
 * Delete a meeting and all its derived artifacts.
 *
 * @param id          Meeting UUID
 * @param storage     IStorage adapter (injected for testability)
 */
export async function deleteMeeting(
  id: string,
  storage: IStorage,
): Promise<DeleteMeetingResult> {
  // ── 1. Load Meeting with related jobs + recording ────────────────────────────

  const meeting = await prisma.meeting.findUnique({
    where: { id },
    include: {
      recording: true,
      transcriptionJob: true,
      protocolGenJob: true,
    },
  })

  if (!meeting) {
    // RQ-006: 404 on unknown meeting id (per api-contract.md)
    throw new AppError('MEETING_NOT_FOUND', 404, `Meeting ${id} not found`)
  }

  // ── 2. Determine in-flight jobs (PROCESSING = IN_PROGRESS in Prisma enum) ───

  const inFlightJobIds: string[] = []

  if (meeting.transcriptionJob?.status === 'PROCESSING') {
    // RQ-007: capture id to mark FAILED inside transaction
    inFlightJobIds.push('transcription:' + meeting.transcriptionJob.id)
  }

  if (meeting.protocolGenJob?.status === 'PROCESSING') {
    // RQ-007: capture id to mark FAILED inside transaction
    inFlightJobIds.push('protocol:' + meeting.protocolGenJob.id)
  }

  const hasInFlight = inFlightJobIds.length > 0

  // ── 3. Transaction: mark in-flight jobs FAILED → cascade-delete Meeting ──────

  try {
    await prisma.$transaction(async (tx) => {
      // RQ-007: Mark any PROCESSING jobs as FAILED before deletion.
      // BRQ-009: DONE/FAILED jobs are terminal-immutable; we only touch PROCESSING.
      if (meeting.transcriptionJob?.status === 'PROCESSING') {
        await tx.transcriptionJob.update({
          where: { id: meeting.transcriptionJob.id },
          data: {
            status: 'FAILED',
            errorMsg: 'deleted by user',
            finishedAt: new Date(),
          },
        })
      }

      if (meeting.protocolGenJob?.status === 'PROCESSING') {
        await tx.protocolGenerationJob.update({
          where: { id: meeting.protocolGenJob.id },
          data: {
            status: 'FAILED',
            errorMsg: 'deleted by user',
            finishedAt: new Date(),
          },
        })
      }

      // RQ-006: Delete Meeting — onDelete:Cascade removes Recording,
      //         TranscriptionJob, Transcript, ProtocolGenerationJob, Protocol.
      await tx.meeting.delete({ where: { id } })
    })
  } catch (err) {
    if (err instanceof AppError) throw err
    throw new AppError('INTERNAL_ERROR', 500, 'Failed to delete meeting', err)
  }

  // ── 4. Delete S3 storage object (after DB commit to avoid orphaned rows) ─────

  if (meeting.recording) {
    try {
      // RQ-006: Remove the storage object from EXT-04.
      const key = storage.storageUriToKey(meeting.recording.storageUri)
      await storage.deleteObject(key)
    } catch (err) {
      if (err instanceof StorageNotFoundError) {
        // Object already absent — treat as success (idempotent).
      } else if (err instanceof StorageError) {
        throw new AppError(
          'STORAGE_DELETE_FAILED',
          500,
          `Failed to delete storage object for meeting ${id}`,
          err,
        )
      } else {
        throw new AppError(
          'STORAGE_DELETE_FAILED',
          500,
          `Failed to delete storage object for meeting ${id}`,
          err,
        )
      }
    }
  }

  // ── 5. Return result ─────────────────────────────────────────────────────────

  // RQ-007: in_flight_failed=true signals that at least one job was aborted.
  return { deleted: true, in_flight_failed: hasInFlight }
}
