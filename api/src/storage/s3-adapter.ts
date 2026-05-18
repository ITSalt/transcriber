/**
 * TECH-007 — S3StorageProvider
 * Implements IStorage against MinIO (dev) and AWS S3 / Cloudflare R2 (prod).
 * Configured via env vars: S3_ENDPOINT, S3_BUCKET, S3_KEY, S3_SECRET, S3_REGION.
 * All stored-file references use the s3://bucket/key URI shape (ADR-004).
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  NoSuchKey,
  NotFound,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import type { IStorage, ObjectMeta, StorageStream } from '@transcrib/shared'
import { StorageNotFoundError, StorageError } from '@transcrib/shared'

// ─── Config ───────────────────────────────────────────────────────────────────

export interface S3Config {
  endpoint?: string
  bucket: string
  region: string
  accessKeyId: string
  secretAccessKey: string
  /** Force path-style URLs — required for MinIO. Default: true when endpoint is set */
  forcePathStyle?: boolean
}

export function s3ConfigFromEnv(): S3Config {
  const bucket = process.env['S3_BUCKET']
  const accessKeyId = process.env['S3_KEY']
  const secretAccessKey = process.env['S3_SECRET']

  if (!bucket) throw new Error('S3_BUCKET env var is required')
  if (!accessKeyId) throw new Error('S3_KEY env var is required')
  if (!secretAccessKey) throw new Error('S3_SECRET env var is required')

  const rawForcePathStyle = process.env['S3_FORCE_PATH_STYLE']

  return {
    endpoint: process.env['S3_ENDPOINT'],
    bucket,
    region: process.env['S3_REGION'] ?? 'us-east-1',
    accessKeyId,
    secretAccessKey,
    forcePathStyle:
      rawForcePathStyle !== undefined ? rawForcePathStyle === 'true' : undefined,
  }
}

// ─── Adapter ──────────────────────────────────────────────────────────────────

const DEFAULT_PRESIGN_EXPIRES = 3600 // 1 hour

export class S3StorageProvider implements IStorage {
  private readonly client: S3Client
  private readonly bucket: string

  constructor(cfg: S3Config) {
    this.bucket = cfg.bucket

    this.client = new S3Client({
      region: cfg.region,
      credentials: {
        accessKeyId: cfg.accessKeyId,
        secretAccessKey: cfg.secretAccessKey,
      },
      ...(cfg.endpoint
        ? {
            endpoint: cfg.endpoint,
            forcePathStyle: cfg.forcePathStyle ?? true,
          }
        : {}),
    })
  }

  // ── URI helpers ─────────────────────────────────────────────────────────────

  keyToStorageUri(key: string): string {
    return `s3://${this.bucket}/${key}`
  }

  storageUriToKey(uri: string): string {
    const prefix = `s3://${this.bucket}/`
    if (!uri.startsWith(prefix)) {
      throw new StorageError(
        `URI "${uri}" does not match expected prefix "${prefix}"`,
      )
    }
    return uri.slice(prefix.length)
  }

  // ── Core operations ─────────────────────────────────────────────────────────

  async putObject(
    key: string,
    body: Uint8Array | StorageStream,
    contentType: string,
  ): Promise<void> {
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          // AWS SDK v3 Body accepts Uint8Array, Buffer, string, Readable, or
          // AsyncIterable<Uint8Array> — all of which our StorageStream covers.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          Body: body as any,
          ContentType: contentType,
        }),
      )
    } catch (err) {
      if (err instanceof StorageError) throw err
      throw new StorageError(`Failed to put object "${key}"`, err)
    }
  }

  async getObjectStream(key: string): Promise<StorageStream> {
    try {
      const response = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      )
      if (!response.Body) {
        throw new StorageError(`Empty body returned for key "${key}"`)
      }
      // The AWS SDK v3 Body is a SdkStreamMixin which implements AsyncIterable<Uint8Array>
      return response.Body as unknown as StorageStream
    } catch (err) {
      if (err instanceof StorageNotFoundError) throw err
      if (err instanceof StorageError) throw err
      if (isNotFound(err)) {
        throw new StorageNotFoundError(key)
      }
      throw new StorageError(`Failed to get object "${key}"`, err)
    }
  }

  async deleteObject(key: string): Promise<void> {
    // HEAD first to verify the object exists — S3 DeleteObject is a no-op for
    // missing keys, but our contract requires throwing StorageNotFoundError.
    await this.headObject(key)

    try {
      await this.client.send(
        new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
      )
    } catch (err) {
      throw new StorageError(`Failed to delete object "${key}"`, err)
    }
  }

  async headObject(key: string): Promise<ObjectMeta> {
    try {
      const response = await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      )
      return {
        size: response.ContentLength ?? 0,
        contentType: response.ContentType ?? 'application/octet-stream',
        etag: (response.ETag ?? '').replace(/"/g, ''),
      }
    } catch (err) {
      if (isNotFound(err)) {
        throw new StorageNotFoundError(key)
      }
      throw new StorageError(`Failed to head object "${key}"`, err)
    }
  }

  // ── Pre-signed URLs ─────────────────────────────────────────────────────────

  async getPresignedUploadUrl(
    key: string,
    _contentType: string,
    expiresSec: number = DEFAULT_PRESIGN_EXPIRES,
  ): Promise<string> {
    return getSignedUrl(
      this.client,
      new PutObjectCommand({ Bucket: this.bucket, Key: key }),
      { expiresIn: expiresSec },
    )
  }

  async getPresignedDownloadUrl(
    key: string,
    expiresSec: number = DEFAULT_PRESIGN_EXPIRES,
  ): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      { expiresIn: expiresSec },
    )
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isNotFound(err: unknown): boolean {
  return (
    err instanceof NoSuchKey ||
    err instanceof NotFound ||
    (typeof err === 'object' &&
      err !== null &&
      (('$metadata' in err &&
        typeof (err as Record<string, unknown>)['$metadata'] === 'object' &&
        (err as { $metadata: { httpStatusCode?: number } }).$metadata
          .httpStatusCode === 404) ||
        ('Code' in err && (err as { Code: string }).Code === 'NoSuchKey') ||
        ('name' in err && (err as { name: string }).name === 'NoSuchKey') ||
        ('name' in err && (err as { name: string }).name === 'NotFound')))
  )
}
