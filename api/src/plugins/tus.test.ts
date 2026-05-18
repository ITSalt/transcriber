/**
 * TECH-008 — TUS upload plugin tests
 *
 * Acceptance criteria from test-spec.md:
 *   1. TUS POST /api/uploads with valid Upload-Metadata returns 201 + Location
 *   2. Oversized file (>500 MB declared) rejected at pre-create with 413
 *   3. Wrong MIME rejected with 415
 *
 * @tus/s3-store is mocked — no live MinIO or S3 required.
 * Prisma client is mocked — no live DB required.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'

// ─── vi.hoisted: construct mock class before vi.mock hoisting runs ────────────
// vi.hoisted runs synchronously before all other imports and vi.mock factories.

const { MockS3Store } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { DataStore } = require('@tus/utils') as typeof import('@tus/utils')

  type UploadRecord = {
    id: string
    size?: number
    offset: number
    metadata?: Record<string, string | null>
    creation_date?: string
    storage?: { type: string; path: string; bucket?: string }
  }

  class MockS3Store extends DataStore {
    private uploads: Map<string, UploadRecord> = new Map()

    async create(upload: UploadRecord) {
      upload.creation_date = upload.creation_date ?? new Date().toISOString()
      this.uploads.set(upload.id, { ...upload })
      return upload as Parameters<typeof DataStore.prototype.create>[0]
    }

    async write(_src: unknown, id: string, offset: number) {
      const upload = this.uploads.get(id)
      if (!upload) throw new Error(`Upload ${id} not found`)
      upload.offset = offset
      return offset
    }

    async getUpload(id: string) {
      const upload = this.uploads.get(id)
      if (!upload) throw new Error(`Upload ${id} not found`)
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { Upload } = require('@tus/utils') as typeof import('@tus/utils')
      return new Upload({ id, ...upload })
    }

    async remove(id: string) {
      this.uploads.delete(id)
    }

    getExpiration() { return 0 }

    async deleteExpired() { return 0 }
  }

  return { MockS3Store }
})

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock('@tus/s3-store', () => ({
  S3Store: MockS3Store,
}))

vi.mock('../db.js', () => ({
  prisma: {
    $queryRaw: vi.fn().mockResolvedValue([{ '?column?': 1 }]),
    meeting: {
      create: vi.fn().mockResolvedValue({ id: 'meeting-id-1' }),
    },
    recording: {
      create: vi.fn().mockResolvedValue({ id: 'recording-id-1' }),
    },
    transcriptionJob: {
      create: vi.fn().mockResolvedValue({ id: 'job-id-1' }),
    },
  },
}))

vi.mock('ioredis', () => {
  const Redis = vi.fn().mockImplementation(() => ({
    ping: vi.fn().mockResolvedValue('PONG'),
    disconnect: vi.fn(),
  }))
  return { Redis }
})

vi.mock('../config.js', () => ({
  config: {
    PORT: 3000,
    HOST: '0.0.0.0',
    DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
    REDIS_URL: 'redis://localhost:6379',
    LOG_LEVEL: 'silent',
    NODE_ENV: 'test',
  },
}))

// ─── App import after mocks ───────────────────────────────────────────────────

import { buildApp } from '../server.js'

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Build a base64-encoded TUS Upload-Metadata header value.
 * TUS spec: "key base64value,key base64value,..."
 */
function tusMetadata(pairs: Record<string, string>): string {
  return Object.entries(pairs)
    .map(([k, v]) => `${k} ${Buffer.from(v).toString('base64')}`)
    .join(',')
}

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('TECH-008 — TUS upload plugin', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    // Set required S3 env vars for the plugin initialisation
    process.env['S3_BUCKET'] = 'test-bucket'
    process.env['S3_KEY'] = 'test-key'
    process.env['S3_SECRET'] = 'test-secret'
    process.env['S3_ENDPOINT'] = 'http://localhost:9000'

    app = await buildApp({ logLevel: 'silent' })
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
  })

  // ── Test 1: Valid upload creation returns 201 + Location ───────────────────

  it('POST /api/uploads with valid Upload-Metadata returns 201 + Location header', async () => {
    const metadata = tusMetadata({
      filename: 'meeting.mp4',
      filetype: 'video/mp4',
      meeting_id: 'meeting-uuid-1',
    })

    const response = await app.inject({
      method: 'POST',
      url: '/api/uploads',
      headers: {
        'Tus-Resumable': '1.0.0',
        'Upload-Length': String(100 * 1024 * 1024), // 100 MB
        'Upload-Metadata': metadata,
        'Content-Length': '0',
      },
    })

    expect(response.statusCode).toBe(201)
    expect(response.headers['location']).toBeDefined()
    expect(typeof response.headers['location']).toBe('string')
    expect(response.headers['tus-resumable']).toBe('1.0.0')
  })

  // ── Test 2: Oversized file rejected with 413 ───────────────────────────────

  it('POST /api/uploads with Upload-Length > 500 MB rejected with 413', async () => {
    const fiveHundredOneMB = 501 * 1024 * 1024

    const metadata = tusMetadata({
      filename: 'huge.mp4',
      filetype: 'video/mp4',
      meeting_id: 'meeting-uuid-2',
    })

    const response = await app.inject({
      method: 'POST',
      url: '/api/uploads',
      headers: {
        'Tus-Resumable': '1.0.0',
        'Upload-Length': String(fiveHundredOneMB),
        'Upload-Metadata': metadata,
        'Content-Length': '0',
      },
    })

    expect(response.statusCode).toBe(413)
  })

  // ── Test 3: Wrong MIME rejected with 415 ──────────────────────────────────

  it('POST /api/uploads with unsupported MIME type rejected with 415', async () => {
    const metadata = tusMetadata({
      filename: 'document.pdf',
      filetype: 'application/pdf',
      meeting_id: 'meeting-uuid-3',
    })

    const response = await app.inject({
      method: 'POST',
      url: '/api/uploads',
      headers: {
        'Tus-Resumable': '1.0.0',
        'Upload-Length': String(10 * 1024 * 1024), // 10 MB
        'Upload-Metadata': metadata,
        'Content-Length': '0',
      },
    })

    expect(response.statusCode).toBe(415)
  })
})
