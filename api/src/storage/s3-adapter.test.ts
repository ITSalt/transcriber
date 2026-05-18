/**
 * TECH-007 — S3StorageProvider unit tests
 * S3Client is fully mocked — no live MinIO required.
 *
 * Acceptance criteria from test-spec.md:
 *   1. Round trip: putObject(stream) then getObjectStream returns identical bytes
 *   2. deleteObject removes the key; subsequent get throws StorageNotFoundError
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Readable } from 'node:stream'
import { S3StorageProvider, s3ConfigFromEnv } from './s3-adapter.js'
import { StorageNotFoundError, StorageError } from '@transcrib/shared'

// ─── Mock @aws-sdk/client-s3 ─────────────────────────────────────────────────

const mockSend = vi.fn()

vi.mock('@aws-sdk/client-s3', async (importOriginal) => {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  const original = await importOriginal<typeof import('@aws-sdk/client-s3')>()
  return {
    ...original,
    S3Client: vi.fn().mockImplementation(() => ({
      send: mockSend,
    })),
  }
})

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi
    .fn()
    .mockImplementation((_client: unknown, cmd: { constructor: { name: string } }) =>
      Promise.resolve(`https://minio.local/test-bucket/some-key?sig=fake&cmd=${cmd.constructor.name}`),
    ),
}))

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeProvider(): S3StorageProvider {
  return new S3StorageProvider({
    bucket: 'test-bucket',
    region: 'us-east-1',
    accessKeyId: 'minioadmin',
    secretAccessKey: 'minioadmin',
    endpoint: 'http://localhost:9000',
    forcePathStyle: true,
  })
}

function readableFromString(str: string): Readable {
  return Readable.from([Buffer.from(str)])
}

async function streamToString(stream: NodeJS.ReadableStream): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of stream as AsyncIterable<Buffer>) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string))
  }
  return Buffer.concat(chunks).toString()
}

// ─── URI helpers ─────────────────────────────────────────────────────────────

describe('URI helpers', () => {
  const provider = makeProvider()

  it('keyToStorageUri returns s3://bucket/key', () => {
    expect(provider.keyToStorageUri('recordings/abc.mp4')).toBe(
      's3://test-bucket/recordings/abc.mp4',
    )
  })

  it('storageUriToKey extracts the bare key', () => {
    expect(provider.storageUriToKey('s3://test-bucket/recordings/abc.mp4')).toBe(
      'recordings/abc.mp4',
    )
  })

  it('storageUriToKey throws StorageError for wrong bucket', () => {
    expect(() => provider.storageUriToKey('s3://other-bucket/key')).toThrow(StorageError)
  })

  it('round-trip: keyToStorageUri -> storageUriToKey is identity', () => {
    const key = 'some/deep/path/file.webm'
    expect(provider.storageUriToKey(provider.keyToStorageUri(key))).toBe(key)
  })
})

// ─── putObject ────────────────────────────────────────────────────────────────

describe('putObject', () => {
  beforeEach(() => {
    mockSend.mockReset()
    mockSend.mockResolvedValue({})
  })

  it('calls S3 PutObjectCommand with correct params', async () => {
    const provider = makeProvider()
    const stream = readableFromString('hello world')

    await expect(
      provider.putObject('recordings/test.mp4', stream, 'video/mp4'),
    ).resolves.toBeUndefined()

    expect(mockSend).toHaveBeenCalledOnce()
  })

  it('wraps S3 errors in StorageError', async () => {
    mockSend.mockRejectedValue(new Error('Network failure'))
    const provider = makeProvider()

    await expect(
      provider.putObject('recordings/test.mp4', Buffer.from('x'), 'video/mp4'),
    ).rejects.toThrow(StorageError)
  })
})

// ─── getObjectStream ──────────────────────────────────────────────────────────

describe('getObjectStream', () => {
  beforeEach(() => {
    mockSend.mockReset()
  })

  it('returns a readable stream with the object body', async () => {
    const content = 'binary content'
    const bodyStream = readableFromString(content)
    mockSend.mockResolvedValue({ Body: bodyStream })

    const provider = makeProvider()
    const stream = await provider.getObjectStream('recordings/test.mp4')
    const result = await streamToString(stream)

    expect(result).toBe(content)
  })

  it('throws StorageNotFoundError when S3 returns NoSuchKey', async () => {
    const { NoSuchKey } = await import('@aws-sdk/client-s3')
    mockSend.mockRejectedValue(new NoSuchKey({ message: 'NoSuchKey', $metadata: {} }))

    const provider = makeProvider()

    await expect(provider.getObjectStream('missing/key')).rejects.toThrow(
      StorageNotFoundError,
    )
  })

  it('throws StorageNotFoundError for 404 $metadata response', async () => {
    const err = Object.assign(new Error('Not found'), {
      $metadata: { httpStatusCode: 404 },
    })
    mockSend.mockRejectedValue(err)

    const provider = makeProvider()

    await expect(provider.getObjectStream('missing/key')).rejects.toThrow(
      StorageNotFoundError,
    )
  })

  it('wraps other S3 errors in StorageError', async () => {
    mockSend.mockRejectedValue(new Error('Connection refused'))

    const provider = makeProvider()

    await expect(provider.getObjectStream('recordings/test.mp4')).rejects.toThrow(
      StorageError,
    )
  })
})

// ─── headObject ───────────────────────────────────────────────────────────────

describe('headObject', () => {
  beforeEach(() => {
    mockSend.mockReset()
  })

  it('returns ObjectMeta on success', async () => {
    mockSend.mockResolvedValue({
      ContentLength: 1024,
      ContentType: 'video/mp4',
      ETag: '"abc123"',
    })

    const provider = makeProvider()
    const meta = await provider.headObject('recordings/test.mp4')

    expect(meta).toEqual({ size: 1024, contentType: 'video/mp4', etag: 'abc123' })
  })

  it('strips surrounding quotes from ETag', async () => {
    mockSend.mockResolvedValue({
      ContentLength: 0,
      ContentType: 'application/octet-stream',
      ETag: '"deadbeef"',
    })
    const provider = makeProvider()
    const meta = await provider.headObject('some/key')
    expect(meta.etag).toBe('deadbeef')
  })

  it('throws StorageNotFoundError when S3 returns NotFound', async () => {
    const { NotFound } = await import('@aws-sdk/client-s3')
    mockSend.mockRejectedValue(new NotFound({ message: 'NotFound', $metadata: {} }))

    const provider = makeProvider()

    await expect(provider.headObject('missing/key')).rejects.toThrow(
      StorageNotFoundError,
    )
  })
})

// ─── deleteObject ─────────────────────────────────────────────────────────────

describe('deleteObject', () => {
  beforeEach(() => {
    mockSend.mockReset()
  })

  it('succeeds when object exists (HEAD then DELETE)', async () => {
    // First call is HEAD (headObject check), second is DELETE
    mockSend
      .mockResolvedValueOnce({ ContentLength: 10, ContentType: 'video/mp4', ETag: '"abc"' })
      .mockResolvedValueOnce({})

    const provider = makeProvider()
    await expect(provider.deleteObject('recordings/test.mp4')).resolves.toBeUndefined()
    expect(mockSend).toHaveBeenCalledTimes(2)
  })

  it('throws StorageNotFoundError when object does not exist (HEAD returns 404)', async () => {
    const { NotFound } = await import('@aws-sdk/client-s3')
    mockSend.mockRejectedValue(new NotFound({ message: 'NotFound', $metadata: {} }))

    const provider = makeProvider()

    await expect(provider.deleteObject('missing/key')).rejects.toThrow(
      StorageNotFoundError,
    )
  })
})

// ─── Acceptance test: round trip ──────────────────────────────────────────────

describe('Acceptance: round trip', () => {
  it('putObject then getObjectStream returns identical bytes', async () => {
    const content = 'round-trip content bytes'
    const bodyStream = readableFromString(content)

    // Simulate in-memory store
    const store = new Map<string, Readable>()

    mockSend.mockReset()
    mockSend.mockImplementation(
      async (cmd: { constructor: { name: string }; input: { Key: string; Body?: Readable } }) => {
        const name = cmd.constructor.name
        const key: string = cmd.input['Key'] as string
        if (name === 'PutObjectCommand') {
          store.set(key, cmd.input['Body'] as Readable)
          return {}
        }
        if (name === 'GetObjectCommand') {
          if (!store.has(key)) {
            const { NoSuchKey } = await import('@aws-sdk/client-s3')
            throw new NoSuchKey({ message: 'NoSuchKey', $metadata: {} })
          }
          return { Body: store.get(key) }
        }
        return {}
      },
    )

    const provider = makeProvider()

    await provider.putObject('test/round-trip.bin', bodyStream, 'application/octet-stream')
    const outStream = await provider.getObjectStream('test/round-trip.bin')
    const result = await streamToString(outStream)

    expect(result).toBe(content)
  })
})

// ─── Acceptance test: delete then get throws ─────────────────────────────────

describe('Acceptance: deleteObject removes the key; subsequent get throws NotFound', () => {
  it('get after delete throws StorageNotFoundError', async () => {
    const store = new Map<string, boolean>()
    store.set('to-delete/file.mp4', true)

    mockSend.mockReset()
    mockSend.mockImplementation(
      async (cmd: { constructor: { name: string }; input: { Key: string } }) => {
        const name = cmd.constructor.name
        const key: string = cmd.input['Key'] as string
        if (name === 'HeadObjectCommand') {
          if (!store.has(key)) {
            const { NotFound } = await import('@aws-sdk/client-s3')
            throw new NotFound({ message: 'NotFound', $metadata: {} })
          }
          return { ContentLength: 10, ContentType: 'video/mp4', ETag: '"etag"' }
        }
        if (name === 'DeleteObjectCommand') {
          store.delete(key)
          return {}
        }
        if (name === 'GetObjectCommand') {
          if (!store.has(key)) {
            const { NoSuchKey } = await import('@aws-sdk/client-s3')
            throw new NoSuchKey({ message: 'NoSuchKey', $metadata: {} })
          }
          return { Body: Readable.from(['data']) }
        }
        return {}
      },
    )

    const provider = makeProvider()

    // delete succeeds
    await expect(provider.deleteObject('to-delete/file.mp4')).resolves.toBeUndefined()

    // subsequent get throws StorageNotFoundError
    await expect(provider.getObjectStream('to-delete/file.mp4')).rejects.toThrow(
      StorageNotFoundError,
    )
  })
})

// ─── Pre-signed URLs ──────────────────────────────────────────────────────────

describe('getPresignedUploadUrl', () => {
  it('returns a non-empty URL string', async () => {
    const provider = makeProvider()
    const url = await provider.getPresignedUploadUrl('uploads/video.mp4', 'video/mp4', 3600)
    expect(typeof url).toBe('string')
    expect(url.length).toBeGreaterThan(0)
  })
})

describe('getPresignedDownloadUrl', () => {
  it('returns a non-empty URL string', async () => {
    const provider = makeProvider()
    const url = await provider.getPresignedDownloadUrl('uploads/video.mp4', 3600)
    expect(typeof url).toBe('string')
    expect(url.length).toBeGreaterThan(0)
  })
})

// ─── TECH-021: s3ConfigFromEnv — env-driven region and forcePathStyle ─────────

describe('TECH-021: s3ConfigFromEnv', () => {
  const savedEnv: Record<string, string | undefined> = {}

  beforeEach(() => {
    // Save and set required vars
    savedEnv['S3_BUCKET'] = process.env['S3_BUCKET']
    savedEnv['S3_KEY'] = process.env['S3_KEY']
    savedEnv['S3_SECRET'] = process.env['S3_SECRET']
    savedEnv['S3_ENDPOINT'] = process.env['S3_ENDPOINT']
    savedEnv['S3_REGION'] = process.env['S3_REGION']
    savedEnv['S3_FORCE_PATH_STYLE'] = process.env['S3_FORCE_PATH_STYLE']

    process.env['S3_BUCKET'] = 'test-bucket'
    process.env['S3_KEY'] = 'key'
    process.env['S3_SECRET'] = 'secret'
  })

  afterEach(() => {
    for (const [k, v] of Object.entries(savedEnv)) {
      if (v === undefined) {
        delete process.env[k]
      } else {
        process.env[k] = v
      }
    }
  })

  it('MinIO dev profile: defaults to us-east-1 region and forcePathStyle not set', () => {
    process.env['S3_ENDPOINT'] = 'http://localhost:9000'
    delete process.env['S3_REGION']
    delete process.env['S3_FORCE_PATH_STYLE']

    const cfg = s3ConfigFromEnv()

    expect(cfg.region).toBe('us-east-1')
    expect(cfg.endpoint).toBe('http://localhost:9000')
    // forcePathStyle is not set in env — constructor applies default
    expect(cfg.forcePathStyle).toBeUndefined()
  })

  it('Cloud.ru prod profile: honors S3_REGION and S3_FORCE_PATH_STYLE=true', () => {
    process.env['S3_ENDPOINT'] = 'https://s3.cloud.ru'
    process.env['S3_REGION'] = 'ru-central-1'
    process.env['S3_FORCE_PATH_STYLE'] = 'true'

    const cfg = s3ConfigFromEnv()

    expect(cfg.region).toBe('ru-central-1')
    expect(cfg.endpoint).toBe('https://s3.cloud.ru')
    expect(cfg.forcePathStyle).toBe(true)
  })

  it('S3_FORCE_PATH_STYLE=false is honored', () => {
    process.env['S3_ENDPOINT'] = 'https://s3.amazonaws.com'
    process.env['S3_REGION'] = 'us-east-1'
    process.env['S3_FORCE_PATH_STYLE'] = 'false'

    const cfg = s3ConfigFromEnv()

    expect(cfg.forcePathStyle).toBe(false)
  })

  it('throws if S3_BUCKET is missing', () => {
    delete process.env['S3_BUCKET']
    expect(() => s3ConfigFromEnv()).toThrow('S3_BUCKET')
  })

  it('throws if S3_KEY is missing', () => {
    delete process.env['S3_KEY']
    expect(() => s3ConfigFromEnv()).toThrow('S3_KEY')
  })

  it('throws if S3_SECRET is missing', () => {
    delete process.env['S3_SECRET']
    expect(() => s3ConfigFromEnv()).toThrow('S3_SECRET')
  })
})
