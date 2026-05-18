/**
 * UC-302-BE — Export protocol to PDF: service layer
 *
 * Loads the Protocol for a given meeting, renders it to a PDF buffer,
 * and returns the buffer along with the sanitized filename.
 *
 * RQ-032: PDF export is transient — buffer is NEVER persisted (BRQ-017).
 * RQ-032: Each export re-renders from canonical Markdown (BRQ-018).
 * RQ-033: On render failure → AppError('PDF_RENDER_FAILED', 500); no state change.
 */
import { prisma } from '../db.js'
import { AppError } from '../plugins/errors.js'
import { renderPdf } from '../lib/pdf.js'

/**
 * MeetingStatus values that allow PDF export.
 * RQ-032: gate on Meeting.status in {PROTOCOL_READY, EDITED}.
 */
const PDF_EXPORT_ALLOWED_STATUSES = new Set(['PROTOCOL_READY', 'EDITED'])

export interface PdfExportResult {
  buffer: Buffer
  filename: string
}

/**
 * Sanitize a string for safe use in a Content-Disposition filename.
 * Replaces characters that are unsafe in filenames with dashes.
 */
function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9\-_.]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
}

/**
 * Load the protocol for the given meeting, render to PDF, and return the buffer + filename.
 *
 * Throws AppError('PROTOCOL_NOT_FOUND', 404) if meeting or protocol is absent.
 * Throws AppError('STATUS_NOT_READY', 409) if Meeting.status not in {PROTOCOL_READY, EDITED}.
 * Throws AppError('PDF_RENDER_FAILED', 500) if Puppeteer render fails (RQ-033).
 */
export async function exportProtocolPdf(meetingId: string): Promise<PdfExportResult> {
  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
    include: { protocol: true },
  })

  if (!meeting) {
    throw new AppError('PROTOCOL_NOT_FOUND', 404, `Meeting ${meetingId} not found`)
  }

  // RQ-032: gate on Meeting.status in {PROTOCOL_READY, EDITED}
  if (!PDF_EXPORT_ALLOWED_STATUSES.has(meeting.status)) {
    throw new AppError(
      'STATUS_NOT_READY',
      409,
      `Meeting ${meetingId} has status ${meeting.status}; protocol is not ready for export`,
    )
  }

  if (!meeting.protocol) {
    throw new AppError(
      'PROTOCOL_NOT_FOUND',
      404,
      `Protocol for meeting ${meetingId} not found`,
    )
  }

  const protocol = meeting.protocol
  const title = meeting.title
  const version = String(protocol.version)

  // RQ-032: re-render from canonical Markdown (BRQ-018); NEVER persist the buffer (BRQ-017)
  let buffer: Buffer
  try {
    buffer = await renderPdf({
      markdown: protocol.markdownContent,
      meta: { title, version },
    })
  } catch (err) {
    // RQ-033: on render failure → stable error code; no state change
    throw new AppError('PDF_RENDER_FAILED', 500, 'Failed to render PDF', err)
  }

  const sanitizedTitle = sanitizeFilename(title) || 'protocol'
  const filename = `${sanitizedTitle}-protocol-v${version}.pdf`

  return { buffer, filename }
}
