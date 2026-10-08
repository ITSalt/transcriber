/**
 * FR-005 — protocol versions and protocol feedback (WP-API-FEEDBACK-01; UC-301 changed;
 * contract: shared/src/api/feedback.ts; D-12, D-15).
 *
 *   GET  /api/meetings/:id/protocol/versions            → ProtocolVersionListResponse
 *   GET  /api/meetings/:id/protocol/versions/:n         → ProtocolVersionResponse | 404
 *   POST /api/meetings/:id/feedback  (multipart)        → 201 FeedbackCreateResponse
 *   GET  /api/meetings/:id/feedback                     → FeedbackListResponse (newest first)
 *   GET  /api/meetings/:id/feedback/:feedbackId/file    → the stored file (attachment)
 *
 * Access: every route sits under `/api/meetings/:id`, so the auth plugin has already
 * answered 404 NOT_FOUND for a foreign or nonexistent meeting before validation and the
 * handler (features/auth). Feedback rows are additionally filtered by the meeting's workspace.
 * Files: s3://<bucket>/ws/<workspaceId>/feedback/<feedbackId>/<fileName> (ADR-004).
 * A .docx that cannot be parsed is still stored; `extracted.error` says why.
 */
import { randomUUID } from 'node:crypto'
import { Readable } from 'node:stream'
import multipart from '@fastify/multipart'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { ZodTypeProvider } from '@fastify/type-provider-zod'
import { z } from 'zod'
import {
  FEEDBACK_FILE_MAX_BYTES,
  FEEDBACK_TEXT_MAX,
  FeedbackExtract,
  FeedbackFields,
  PROGRAM_ERRORS,
  PROGRAM_ERROR_MESSAGES,
  StorageNotFoundError,
  ZIP_SIGNATURE,
  checkFeedbackSubmission,
  type FeedbackCreateResponse,
  type FeedbackItem,
  type FeedbackListResponse,
  type ProgramErrorCode,
  type ProtocolVersionListResponse,
  type ProtocolVersionResponse,
} from '@transcrib/shared'
import { prisma } from '../../db.js'
import { AppError } from '../../plugins/errors.js'
import { S3StorageProvider, s3ConfigFromEnv } from '../../storage/s3-adapter.js'
import { notFound, requireAuth } from '../auth/access.js'
import { extractDocxPlainText, extractDocxReview, extractFailed } from './docx.js'

const MeetingParams = z.object({ id: z.string().uuid() })
const FeedbackFileParams = z.object({ id: z.string().uuid(), feedbackId: z.string().uuid() })
const VersionParams = z.object({ id: z.string().uuid(), n: z.string() })

const MAX_INT4 = 2_147_483_647

function programError(code: ProgramErrorCode): AppError {
  return new AppError(code, PROGRAM_ERRORS[code], PROGRAM_ERROR_MESSAGES[code])
}

const errorCode = (err: unknown): string | undefined =>
  typeof err === 'object' && err !== null && 'code' in err ? String((err as { code: unknown }).code) : undefined

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Object-key-safe file name: no path, no control or separator characters, bounded length. */
export function safeFileName(raw: string): string {
  const base = raw.split(/[\\/]/).pop() ?? ''
  const cleaned = base.replace(/[^\p{L}\p{N}._ -]/gu, '_').replace(/^\.+/, '_').trim()
  const name = cleaned.length > 0 ? cleaned : 'file'
  if (name.length <= 120) return name
  const dot = name.lastIndexOf('.')
  const ext = dot > 0 && name.length - dot <= 12 ? name.slice(dot) : ''
  return name.slice(0, 120 - ext.length) + ext
}

const hasZipSignature = (bytes: Uint8Array): boolean => ZIP_SIGNATURE.every((b, i) => bytes[i] === b)

const extOf = (name: string): string => {
  const dot = name.lastIndexOf('.')
  return dot >= 0 ? name.slice(dot).toLowerCase() : ''
}

interface ParsedSubmission {
  fields: Record<string, string>
  file: { fileName: string; mime: string; buffer: Buffer } | null
}

async function readSubmission(request: FastifyRequest): Promise<ParsedSubmission> {
  if (!request.isMultipart()) {
    throw new AppError('VALIDATION_ERROR', 400, 'Expected multipart/form-data')
  }
  const fields: Record<string, string> = {}
  let file: ParsedSubmission['file'] = null
  try {
    for await (const part of request.parts()) {
      if (part.type === 'file') {
        const buffer = await part.toBuffer() // throws FST_REQ_FILE_TOO_LARGE past the limit
        // an unchosen <input type=file> arrives as an empty part with an empty name
        if (part.fieldname !== 'file' || file || (part.filename === '' && buffer.length === 0)) continue
        file = { fileName: part.filename, mime: part.mimetype, buffer }
      } else if (typeof part.value === 'string') {
        fields[part.fieldname] = part.value
      }
    }
  } catch (err) {
    const code = errorCode(err)
    if (code === 'FST_REQ_FILE_TOO_LARGE') throw programError('FEEDBACK_FILE_TOO_LARGE')
    if (code?.startsWith('FST_')) throw new AppError('VALIDATION_ERROR', 400, 'Invalid multipart request', { code })
    throw err
  }
  return { fields, file }
}

function parseFields(raw: Record<string, string>): FeedbackFields {
  const cleaned: Record<string, string> = {}
  for (const key of ['kind', 'category', 'text']) {
    const value = raw[key]
    if (value !== undefined && value.trim() !== '') cleaned[key] = value
  }
  const parsed = FeedbackFields.safeParse(cleaned)
  if (!parsed.success) {
    throw new AppError('VALIDATION_ERROR', 400, 'Request validation failed', parsed.error.issues)
  }
  return parsed.data
}

async function extractFor(
  kind: FeedbackFields['kind'],
  file: NonNullable<ParsedSubmission['file']>,
): Promise<FeedbackExtract> {
  const ext = extOf(file.fileName)
  if (ext === '.docx') {
    return kind === 'DOCX_REVIEW' ? extractDocxReview(file.buffer) : extractDocxPlainText(file.buffer)
  }
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(file.buffer).replace(/^\uFEFF/, '')
    return FeedbackExtract.parse({ plain_text: text })
  } catch (err) {
    return extractFailed(err)
  }
}

type FeedbackRow = {
  id: string
  meetingId: string
  protocolVersionN: number
  kind: FeedbackItem['kind']
  category: FeedbackItem['category']
  text: string | null
  fileName: string | null
  mime: string | null
  sizeBytes: bigint | null
  extracted: unknown
  createdAt: Date
  user: { id: string; name: string }
}

function toItem(row: FeedbackRow): FeedbackItem {
  const extract = row.extracted == null ? null : FeedbackExtract.safeParse(row.extracted)
  return {
    id: row.id,
    meeting_id: row.meetingId,
    protocol_version_n: row.protocolVersionN,
    kind: row.kind,
    category: row.category,
    text: row.text,
    file:
      row.fileName === null
        ? null
        : {
            name: row.fileName,
            mime: row.mime ?? 'application/octet-stream',
            size_bytes: Number(row.sizeBytes ?? 0),
            download_path: `/api/meetings/${row.meetingId}/feedback/${row.id}/file`,
          },
    extracted_counts: extract
      ? extract.success
        ? { comments: extract.data.comments.length, revisions: extract.data.revisions.length, error: extract.data.error !== null }
        : { comments: 0, revisions: 0, error: true }
      : null,
    author: { id: row.user.id, name: row.user.name },
    created_at: row.createdAt.toISOString(),
  }
}

const contentDisposition = (name: string): string => {
  const ascii = name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_')
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`
}

// ─── Plugin ───────────────────────────────────────────────────────────────────

export default async function feedbackRoutes(app: FastifyInstance): Promise<void> {
  await app.register(multipart, {
    limits: {
      fileSize: FEEDBACK_FILE_MAX_BYTES,
      files: 1,
      fields: 10,
      fieldSize: FEEDBACK_TEXT_MAX * 4, // bytes: up to 4 UTF-8 bytes per character
      parts: 12,
    },
  })

  const typed = app.withTypeProvider<ZodTypeProvider>()

  // ── GET /api/meetings/:id/protocol/versions ───────────────────────────────
  typed.get('/api/meetings/:id/protocol/versions', { schema: { params: MeetingParams } }, async (request) => {
    const rows = await prisma.protocolVersion.findMany({
      where: { meetingId: request.params.id },
      orderBy: { n: 'asc' },
      select: {
        n: true,
        kind: true,
        generationId: true,
        createdAt: true,
        author: { select: { id: true, name: true } },
      },
    })
    const body: ProtocolVersionListResponse = {
      items: rows.map((r) => ({
        n: r.n,
        kind: r.kind,
        author: r.author ? { id: r.author.id, name: r.author.name } : null,
        generation_id: r.generationId,
        created_at: r.createdAt.toISOString(),
      })),
      current_n: rows.length > 0 ? rows[rows.length - 1]!.n : null,
    }
    return body
  })

  // ── GET /api/meetings/:id/protocol/versions/:n ────────────────────────────
  typed.get('/api/meetings/:id/protocol/versions/:n', { schema: { params: VersionParams } }, async (request) => {
    const { id, n: rawN } = request.params
    const n = /^[1-9]\d{0,9}$/.test(rawN) ? Number(rawN) : 0
    if (n < 1 || n > MAX_INT4) throw programError('PROTOCOL_VERSION_NOT_FOUND')
    const row = await prisma.protocolVersion.findFirst({
      where: { meetingId: id, n },
      select: {
        n: true,
        kind: true,
        markdown: true,
        generationId: true,
        createdAt: true,
        author: { select: { id: true, name: true } },
      },
    })
    if (!row) throw programError('PROTOCOL_VERSION_NOT_FOUND')
    const body: ProtocolVersionResponse = {
      n: row.n,
      kind: row.kind,
      author: row.author ? { id: row.author.id, name: row.author.name } : null,
      generation_id: row.generationId,
      created_at: row.createdAt.toISOString(),
      markdown: row.markdown,
    }
    return body
  })

  // ── POST /api/meetings/:id/feedback ───────────────────────────────────────
  typed.post('/api/meetings/:id/feedback', { schema: { params: MeetingParams } }, async (request, reply) => {
    const auth = requireAuth(request)
    // ProtocolFeedback.user_id is required; the legacy principal (D-20) has no users row
    if (auth.userId === null) throw programError('UNAUTHENTICATED')
    const access = request.meetingAccess
    if (!access) throw notFound()

    const { fields: rawFields, file } = await readSubmission(request)
    const fields = parseFields(rawFields)
    const meta = file && { fileName: file.fileName, mime: file.mime, sizeBytes: file.buffer.length }
    const rejected = checkFeedbackSubmission(fields, meta)
    if (rejected) throw programError(rejected)
    if (file && extOf(file.fileName) === '.docx' && !hasZipSignature(file.buffer)) {
      throw programError('FEEDBACK_FILE_TYPE')
    }

    // bound to the CURRENT protocol version at submit time
    const current = await prisma.protocolVersion.findFirst({
      where: { meetingId: access.meetingId },
      orderBy: { n: 'desc' },
      select: { n: true },
    })
    if (!current) throw programError('PROTOCOL_VERSION_NOT_FOUND')

    const id = randomUUID()
    const extracted: FeedbackExtract | null = file
      ? await extractFor(fields.kind, file)
      : null

    let storage: S3StorageProvider | null = null
    let key: string | null = null
    let fileUri: string | null = null
    let storedName: string | null = null
    let storedMime: string | null = null
    if (file) {
      storedName = safeFileName(file.fileName)
      storedMime = file.mime.split(';')[0]!.trim().toLowerCase()
      storage = new S3StorageProvider(s3ConfigFromEnv())
      key = `ws/${access.workspaceId}/feedback/${id}/${storedName}`
      try {
        await storage.putObject(key, file.buffer, storedMime)
      } catch (err) {
        throw new AppError('STORAGE_WRITE_FAILED', 500, 'Failed to store the feedback file', err)
      }
      fileUri = storage.keyToStorageUri(key)
    }

    let row: FeedbackRow
    try {
      row = await prisma.protocolFeedback.create({
        data: {
          id,
          meetingId: access.meetingId,
          workspaceId: access.workspaceId,
          userId: auth.userId,
          protocolVersionN: current.n,
          kind: fields.kind,
          category: fields.category ?? null,
          text: fields.text ?? null,
          fileUri,
          fileName: storedName,
          mime: storedMime,
          sizeBytes: file ? BigInt(file.buffer.length) : null,
          ...(extracted ? { extracted } : {}),
        },
        include: { user: { select: { id: true, name: true } } },
      })
    } catch (err) {
      if (storage && key) await storage.deleteObject(key).catch(() => undefined)
      throw err
    }

    const body: FeedbackCreateResponse = { ...toItem(row), extracted }
    return reply.status(201).send(body)
  })

  // ── GET /api/meetings/:id/feedback ────────────────────────────────────────
  typed.get('/api/meetings/:id/feedback', { schema: { params: MeetingParams } }, async (request) => {
    const access = request.meetingAccess
    if (!access) throw notFound()
    const rows = await prisma.protocolFeedback.findMany({
      where: { meetingId: access.meetingId, workspaceId: access.workspaceId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      include: { user: { select: { id: true, name: true } } },
    })
    const body: FeedbackListResponse = { items: rows.map(toItem) }
    return body
  })

  // ── GET /api/meetings/:id/feedback/:feedbackId/file ───────────────────────
  typed.get('/api/meetings/:id/feedback/:feedbackId/file', { schema: { params: FeedbackFileParams } }, async (request, reply) => {
    const access = request.meetingAccess
    if (!access) throw notFound()
    const row = await prisma.protocolFeedback.findFirst({
      where: { id: request.params.feedbackId, meetingId: access.meetingId, workspaceId: access.workspaceId },
      select: { fileUri: true, fileName: true, mime: true, sizeBytes: true },
    })
    if (!row || !row.fileUri || !row.fileName) throw notFound()

    const storage = new S3StorageProvider(s3ConfigFromEnv())
    let stream: AsyncIterable<Uint8Array>
    try {
      stream = await storage.getObjectStream(storage.storageUriToKey(row.fileUri))
    } catch (err) {
      if (err instanceof StorageNotFoundError) throw notFound()
      throw new AppError('STORAGE_READ_FAILED', 500, 'Failed to read the feedback file', err)
    }
    reply
      .header('Content-Type', row.mime ?? 'application/octet-stream')
      .header('Content-Disposition', contentDisposition(row.fileName))
      .header('X-Content-Type-Options', 'nosniff')
    if (row.sizeBytes !== null) reply.header('Content-Length', String(row.sizeBytes))
    return reply.send(Readable.from(stream))
  })
}
