/**
 * TECH-008 — TUS upload protocol plugin
 *
 * Mounts @tus/server at /api/uploads backed by S3Store (MinIO / AWS S3).
 *
 * Pre-create hook validates:
 *   - BRQ-001: max 500 MB (returns 413 if violated)
 *   - RQ-009 / BRQ-002: allowed MIME types — video/mp4, video/webm, video/quicktime,
 *              video/x-msvideo, video/x-matroska (returns 415 if violated)
 *
 * NOTE: onUploadFinish no longer auto-creates Meeting/Recording/TranscriptionJob.
 * UC-100-BE's POST /api/uploads/:uploadId/finalize endpoint owns that logic
 * (container probe + atomic DB writes + BullMQ enqueue per RQ-010/RQ-011).
 */
import type { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'
import { Server as TusServer, type Upload } from '@tus/server'
import { S3Store } from '@tus/s3-store'
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
