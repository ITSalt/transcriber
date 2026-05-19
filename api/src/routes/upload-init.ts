/**
 * POST /api/uploads/init — Initiate S3 multipart upload
 *
 * Creates an S3 multipart upload and returns presigned PUT URLs for each part.
 * The browser uploads parts directly to S3 in parallel, then calls
 * POST /api/uploads/complete to finalize.
 *
 * BRQ-001: max 500 MB   BRQ-002: allowed MIME types
 */
import { randomUUID } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from '@fastify/type-provider-zod'
import { UploadInitRequest, UploadInitResponse } from '@transcrib/shared'
import { S3StorageProvider, s3ConfigFromEnv } from '../storage/s3-adapter.js'
import { AppError } from '../plugins/errors.js'

const PART_SIZE = 10 * 1024 * 1024 // 10 MB (S3 minimum for non-last parts is 5 MB)
const PRESIGN_EXPIRES_SEC = 3600   // 1 hour

const EXT_MAP: Record<string, string> = {
  'video/mp4': 'mp4',
  'video/x-matroska': 'mkv',
  'video/quicktime': 'mov',
}

export async function uploadInitRoutes(app: FastifyInstance): Promise<void> {
  app.withTypeProvider<ZodTypeProvider>().post(
    '/api/uploads/init',
    {
      schema: {
        body: UploadInitRequest,
        response: { 200: UploadInitResponse },
      },
    },
    async (request, reply) => {
      const { filetype, size_bytes } = request.body

      const s3 = new S3StorageProvider(s3ConfigFromEnv())
      const ext = EXT_MAP[filetype] ?? 'mp4'
      const s3Key = `pending/${randomUUID()}.${ext}`

      let s3UploadId: string
      try {
        s3UploadId = await s3.createMultipartUpload(s3Key, filetype)
      } catch (err) {
        throw new AppError('STORAGE_WRITE_FAILED', 500, 'Failed to initiate multipart upload', err)
      }

      const numParts = Math.ceil(size_bytes / PART_SIZE)
      const parts: Array<{ part_number: number; url: string }> = []

      try {
        for (let i = 1; i <= numParts; i++) {
          const url = await s3.presignUploadPart(s3Key, s3UploadId, i, PRESIGN_EXPIRES_SEC)
          parts.push({ part_number: i, url })
        }
      } catch (err) {
        await s3.abortMultipartUpload(s3Key, s3UploadId).catch(() => {})
        throw new AppError('STORAGE_WRITE_FAILED', 500, 'Failed to generate upload URLs', err)
      }

      return reply.send({
        s3_key: s3Key,
        s3_upload_id: s3UploadId,
        part_size: PART_SIZE,
        parts,
      })
    },
  )
}
