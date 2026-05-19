/**
 * POST /api/uploads/complete — Complete S3 multipart upload and finalize meeting
 * POST /api/uploads/abort   — Abort an in-progress multipart upload
 *
 * After the browser finishes uploading all parts directly to S3,
 * this endpoint completes the multipart upload and triggers the
 * same finalize flow as the old TUS route (ffprobe → DB → BullMQ).
 */
import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from '@fastify/type-provider-zod'
import { UploadCompleteRequest, UploadAbortRequest, UploadFinalizeResponse } from '@transcrib/shared'
import { S3StorageProvider, s3ConfigFromEnv } from '../storage/s3-adapter.js'
import { finalizeUpload } from '../services/uc-100.service.js'
import { AppError } from '../plugins/errors.js'

export async function uploadCompleteRoutes(app: FastifyInstance): Promise<void> {
  app.withTypeProvider<ZodTypeProvider>().post(
    '/api/uploads/complete',
    {
      schema: {
        body: UploadCompleteRequest,
        response: { 200: UploadFinalizeResponse },
      },
    },
    async (request, reply) => {
      const {
        s3_key,
        s3_upload_id,
        filename,
        size_bytes,
        filetype,
        title,
        language,
        speaker_count,
        parts,
      } = request.body

      if (!s3_key.startsWith('pending/')) {
        throw new AppError('INVALID_REQUEST', 400, 'Invalid s3_key')
      }

      const s3Cfg = s3ConfigFromEnv()
      const s3 = new S3StorageProvider(s3Cfg)

      try {
        await s3.completeMultipartUpload(
          s3_key,
          s3_upload_id,
          parts.map((p) => ({ PartNumber: p.part_number, ETag: p.etag })),
        )
      } catch (err) {
        throw new AppError('STORAGE_WRITE_FAILED', 500, 'Failed to complete multipart upload', err)
      }

      const result = await finalizeUpload({
        s3Key: s3_key,
        filename,
        sizeBytes: size_bytes,
        mimeType: filetype,
        bucket: s3Cfg.bucket,
        title,
        language: language ?? undefined,
        speakerCount: speaker_count ?? undefined,
      })

      return reply.status(200).send(result)
    },
  )

  app.withTypeProvider<ZodTypeProvider>().post(
    '/api/uploads/abort',
    {
      schema: { body: UploadAbortRequest },
    },
    async (request, reply) => {
      const { s3_key, s3_upload_id } = request.body

      if (!s3_key.startsWith('pending/')) {
        throw new AppError('INVALID_REQUEST', 400, 'Invalid s3_key')
      }

      const s3 = new S3StorageProvider(s3ConfigFromEnv())
      await s3.abortMultipartUpload(s3_key, s3_upload_id).catch(() => {})
      return reply.status(204).send()
    },
  )
}
