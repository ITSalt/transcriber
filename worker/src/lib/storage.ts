/**
 * Worker-side storage helper.
 *
 * Instantiates an IStorage implementation from environment variables.
 * The worker accesses recordings via S3-compatible object storage
 * using the same S3StorageProvider logic as the API (ADR-004).
 *
 * Avoids importing from api/ by re-implementing the env-based factory.
 */
import {
  S3Client,
  GetObjectCommand,
  NoSuchKey,
  NotFound,
} from '@aws-sdk/client-s3'
import type { IStorage, StorageStream } from '@transcrib/shared'
import { StorageNotFoundError, StorageError } from '@transcrib/shared'

// ─── Config ───────────────────────────────────────────────────────────────────

export interface WorkerS3Config {
  endpoint?: string
  bucket: string
  region: string
  accessKeyId: string
  secretAccessKey: string
  forcePathStyle?: boolean
}

export function workerS3ConfigFromEnv(): WorkerS3Config {
  const bucket = process.env['S3_BUCKET']
  const accessKeyId = process.env['S3_KEY']
  const secretAccessKey = process.env['S3_SECRET']

  if (!bucket) throw new Error('S3_BUCKET env var is required')
  if (!accessKeyId) throw new Error('S3_KEY env var is required')
  if (!secretAccessKey) throw new Error('S3_SECRET env var is required')

  return {
    endpoint: process.env['S3_ENDPOINT'],
    bucket,
    region: process.env['S3_REGION'] ?? 'us-east-1',
    accessKeyId,
    secretAccessKey,
  }
}

// ─── Minimal IStorage for worker (read-only path) ────────────────────────────

/**
 * Minimal read-only storage adapter for the worker.
 * Only implements getObjectStream and URI helpers needed by UC-200.
 */
export class WorkerS3Storage implements Pick<IStorage, 'getObjectStream' | 'storageUriToKey' | 'keyToStorageUri'> {
  private readonly client: S3Client
  private readonly bucket: string

  constructor(cfg: WorkerS3Config) {
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

  keyToStorageUri(key: string): string {
    return `s3://${this.bucket}/${key}`
  }

  storageUriToKey(uri: string): string {
    const prefix = `s3://${this.bucket}/`
    if (!uri.startsWith(prefix)) {
      throw new StorageError(`URI "${uri}" does not match expected prefix "${prefix}"`)
    }
    return uri.slice(prefix.length)
  }

  async getObjectStream(key: string): Promise<StorageStream> {
    try {
      const response = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      )
      if (!response.Body) {
        throw new StorageError(`Empty body returned for key "${key}"`)
      }
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
}

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

/** Factory: create WorkerS3Storage from environment variables. */
export function createStorage(cfg?: WorkerS3Config): WorkerS3Storage {
  return new WorkerS3Storage(cfg ?? workerS3ConfigFromEnv())
}
