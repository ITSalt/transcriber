/**
 * TECH-007 — IStorage interface
 * Abstraction over object storage (MinIO in dev, AWS S3/R2 in prod — ADR-004).
 * All file references use the s3://bucket/key URI shape.
 *
 * This file is intentionally free of Node.js-specific globals so it can be
 * imported by both api/ (Node) and web/ (browser).  The concrete stream type
 * is left as `unknown` here; each consuming package narrows it as needed.
 */

export interface ObjectMeta {
  size: number
  contentType: string
  etag: string
}

// Use the minimal interface that covers both Node.js Readable and WHATWG
// ReadableStream without importing any platform-specific types.
export type StorageStream = AsyncIterable<Uint8Array>

export interface IStorage {
  /**
   * Upload an object from a Buffer/Uint8Array or an async-iterable stream
   * (server-side write).  Supports multipart streaming for large uploads.
   */
  putObject(
    key: string,
    body: Uint8Array | StorageStream,
    contentType: string,
  ): Promise<void>

  /**
   * Download an object as an async-iterable stream.
   * Throws StorageNotFoundError if the key does not exist.
   */
  getObjectStream(key: string): Promise<StorageStream>

  /**
   * Delete an object.
   * Throws StorageNotFoundError if the key does not exist.
   */
  deleteObject(key: string): Promise<void>

  /**
   * Retrieve metadata for an object without downloading its body.
   * Throws StorageNotFoundError if the key does not exist.
   */
  headObject(key: string): Promise<ObjectMeta>

  /**
   * Generate a pre-signed URL for client-side PUT upload.
   */
  getPresignedUploadUrl(
    key: string,
    contentType: string,
    expiresSec?: number,
  ): Promise<string>

  /**
   * Generate a pre-signed URL for client-side GET download.
   */
  getPresignedDownloadUrl(key: string, expiresSec?: number): Promise<string>

  /** Convert s3://bucket/key to bare key. */
  storageUriToKey(uri: string): string

  /** Convert bare key to s3://bucket/key. */
  keyToStorageUri(key: string): string
}

// ─── Domain errors ────────────────────────────────────────────────────────────

export class StorageNotFoundError extends Error {
  constructor(key: string) {
    super(`Storage object not found: ${key}`)
    this.name = 'StorageNotFoundError'
  }
}

export class StorageError extends Error {
  public readonly storageCause: unknown

  constructor(message: string, cause?: unknown) {
    super(message)
    this.name = 'StorageError'
    this.storageCause = cause
  }
}
