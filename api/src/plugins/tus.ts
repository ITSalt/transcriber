/**
 * TECH-008 — TUS upload protocol plugin
 *
 * Mounts @tus/server at /api/uploads backed by S3Store (MinIO / AWS S3).
 *
 * Pre-create hook validates:
 *   - BRQ-001: max 500 MB (returns 413 if violated)
 *   - BRQ-002: allowed MIME types — video/mp4, video/webm, video/quicktime,
 *              video/x-msvideo, video/x-matroska (returns 415 if violated)
 *
 * On upload-finish hook creates Meeting + Recording + TranscriptionJob rows
 * for the UC-100-BE ingest pipeline.
 */
import type { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'
import { Server as TusServer, type Upload } from '@tus/server'
import { S3Store } from '@tus/s3-store'
import { prisma } from '../db.js'
import { s3ConfigFromEnv } from '../storage/s3-adapter.js'

// ─── Constants (BRQ-001 / BRQ-002) ───────────────────────────────────────────

/** BRQ-001: 500 MB maximum upload size */
const MAX_SIZE_BYTES = 500 * 1024 * 1024

/**
 * BRQ-002: Allowed video MIME types.
 * Prisma enum VideoMimeType maps: mp4, webm, mov, avi, mkv.
 */
const ALLOWED_MIME_TYPES = new Set([
  'video/mp4',
  'video/webm',
  'video/quicktime',    // .mov
  'video/x-msvideo',   // .avi
  'video/x-matroska',  // .mkv
])

/** Map MIME type to Prisma VideoMimeType enum value */
const MIME_TO_PRISMA: Record<string, string> = {
  'video/mp4': 'VIDEO_MP4',
  'video/webm': 'VIDEO_WEBM',
  'video/quicktime': 'VIDEO_MOV',
  'video/x-msvideo': 'VIDEO_AVI',
  'video/x-matroska': 'VIDEO_MKV',
}

// ─── Plugin ───────────────────────────────────────────────────────────────────

async function tusPluginImpl(app: FastifyInstance): Promise<void> {
  const s3Cfg = s3ConfigFromEnv()

  const store = new S3Store({
    s3ClientConfig: {
      bucket: s3Cfg.bucket,
      region: s3Cfg.region,
      credentials: {
        accessKeyId: s3Cfg.accessKeyId,
        secretAccessKey: s3Cfg.secretAccessKey,
      },
      ...(s3Cfg.endpoint
        ? { endpoint: s3Cfg.endpoint, forcePathStyle: s3Cfg.forcePathStyle ?? true }
        : {}),
    },
  })

  const tusServer = new TusServer({
    path: '/api/uploads',
    datastore: store,

    // ── Pre-create: validate size + MIME ─────────────────────────────────────
    onUploadCreate: async (_req, upload: Upload) => {
      // BRQ-001 — size check
      if (upload.size !== undefined && upload.size > MAX_SIZE_BYTES) {
        // eslint-disable-next-line @typescript-eslint/only-throw-error
        throw { status_code: 413, body: 'File exceeds maximum allowed size of 500 MB' }
      }

      // BRQ-002 — MIME type check
      const filetype = upload.metadata?.['filetype'] ?? ''
      if (!ALLOWED_MIME_TYPES.has(filetype)) {
        // eslint-disable-next-line @typescript-eslint/only-throw-error
        throw { status_code: 415, body: `Unsupported media type: ${filetype}` }
      }

      return {}
    },

    // ── On finish: create Meeting + Recording + TranscriptionJob ─────────────
    onUploadFinish: async (_req, upload: Upload) => {
      try {
        const meta = upload.metadata ?? {}
        const filename = meta['filename'] ?? 'unknown'
        const filetype = meta['filetype'] ?? 'video/mp4'
        const meetingId = meta['meeting_id']
        const sizeBytes = upload.size ?? 0

        const storageKey = upload.id
        const storageUri = `s3://${s3Cfg.bucket}/${storageKey}`
        const mimeTypePrisma = MIME_TO_PRISMA[filetype] ?? 'VIDEO_MP4'

        if (meetingId) {
          // Meeting already exists (created by the client before upload) — just
          // create the Recording and TranscriptionJob.
          await prisma.recording.create({
            data: {
              meetingId,
              storageUri,
              // Prisma enum cast: the string value matches the enum key
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              mimeType: mimeTypePrisma as any,
              sizeBytes: BigInt(sizeBytes),
            },
          })
          await prisma.transcriptionJob.create({
            data: { meetingId },
          })
        } else {
          // No meeting_id provided — auto-create a Meeting row using filename
          // as the title, then attach Recording + TranscriptionJob.
          const meeting = await prisma.meeting.create({
            data: {
              title: filename,
              status: 'UPLOADED',
            },
          })
          await prisma.recording.create({
            data: {
              meetingId: meeting.id,
              storageUri,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              mimeType: mimeTypePrisma as any,
              sizeBytes: BigInt(sizeBytes),
            },
          })
          await prisma.transcriptionJob.create({
            data: { meetingId: meeting.id },
          })
        }
      } catch (err) {
        app.log.error({ err }, 'TUS onUploadFinish: failed to persist upload metadata')
        // Do not re-throw — the file is already stored in S3, aborting the
        // response here would confuse the client. A background reconciliation
        // job can clean up orphaned uploads.
      }

      return {}
    },
  })

  // ── Mount: forward all /api/uploads/** requests to the TUS handler ─────────
  // Fastify uses Node.js http.IncomingMessage / http.ServerResponse under the
  // hood, so we can call tusServer.handle(req.raw, reply.raw) directly.
  app.all('/api/uploads', async (req, reply) => {
    await tusServer.handle(req.raw, reply.raw)
  })

  app.all('/api/uploads/*', async (req, reply) => {
    await tusServer.handle(req.raw, reply.raw)
  })
}

export const tusPlugin = fp(tusPluginImpl, {
  name: 'tus-upload',
  fastify: '5.x',
})
