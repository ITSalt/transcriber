/**
 * UC-100-BE — Upload meeting video: route handler
 *
 * POST /api/uploads/:uploadId/finalize
 *
 * Called by the client after TUS bytes are fully transferred.
 * Triggers container probe, atomic DB writes, and BullMQ enqueue.
 *
 * NFR-007: No authentication at MVP — endpoint is open.
 * RQ-011: Returns { meeting_id, status: 'TRANSCRIBING' } on success.
 */
import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from '@fastify/type-provider-zod'
import { z } from 'zod'
import { UploadFinalizeResponse } from '@transcrib/shared'
import { finalizeUpload } from '../services/uc-100.service.js'
import { AppError } from '../plugins/errors.js'
import { s3ConfigFromEnv } from '../storage/s3-adapter.js'

/** Params schema for the finalize endpoint */
const FinalizeParams = z.object({
  uploadId: z.string().min(1),
})

/**
 * Body sent by the client with metadata gathered at upload-create time.
 * The TUS server already validated size/mime at onUploadCreate; this endpoint
 * re-receives metadata so the service can persist it.
 */
const FinalizeBody = z.object({
  filename: z.string().min(1),
  /** Size in bytes (int) — validated for > 500 MB in handler (RQ-008) */
  size_bytes: z.number().int().positive(),
  /** MIME type from TUS metadata (RQ-009) */
  mime_type: z.string().min(1),
  /** Optional user-supplied title (RQ-013) */
  title: z.string().optional(),
  /** Optional language hint: RU | EN (omit for auto-detect) (RQ-012) */
  language: z.enum(['RU', 'EN', 'AUTO']).optional(),
  /** Skip ffprobe container check (test/dev only) */
  skip_probe: z.boolean().optional(),
})

export async function uploadFinalizeRoutes(app: FastifyInstance): Promise<void> {
  app.withTypeProvider<ZodTypeProvider>().post(
    '/api/uploads/:uploadId/finalize',
    {
      schema: {
        params: FinalizeParams,
        body: FinalizeBody,
        response: {
          200: UploadFinalizeResponse,
        },
      },
    },
    async (request, reply) => {
      const { uploadId } = request.params
      const { filename, size_bytes, mime_type, title, language, skip_probe } = request.body

      // RQ-008: reject oversized uploads (should be caught at TUS pre-create, double-check)
      if (size_bytes > 524_288_000) {
        throw new AppError('FILE_TOO_LARGE', 413, 'File exceeds maximum allowed size of 500 MB')
      }

      // RQ-009: reject unsupported MIME types
      const ALLOWED_MIME = new Set(['video/mp4', 'video/x-matroska', 'video/quicktime', 'video/webm', 'video/x-msvideo'])
      if (!ALLOWED_MIME.has(mime_type)) {
        throw new AppError('UNSUPPORTED_MIME', 415, `Unsupported media type: ${mime_type}`)
      }

      let bucket: string
      try {
        const s3Cfg = s3ConfigFromEnv()
        bucket = s3Cfg.bucket
      } catch {
        throw new AppError('INTERNAL_ERROR', 500, 'S3 configuration is missing')
      }

      // RQ-011: finalize — probe, persist, enqueue
      const result = await finalizeUpload({
        uploadId,
        filename,
        sizeBytes: size_bytes,
        mimeType: mime_type,
        bucket,
        title,
        language,
        skipProbe: skip_probe ?? false,
      })

      return reply.status(200).send(result)
    },
  )
}
