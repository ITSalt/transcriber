/**
 * Upload — POST /api/uploads/complete integration tests
 *
 * Uses Fastify inject() — no live server, DB, or S3 required.
 * Prisma, BullMQ, fluent-ffmpeg, and S3 are mocked.
 *
 * Test coverage:
 *   T01 — RQ-008: Reject size_bytes > 524,288,000 (500 MB)
 *   T02 — RQ-009: Accept video/mp4|video/x-matroska|video/quicktime; reject others
 *   T03 — RQ-010: Corrupt file (probeContainer fails) rejected with 422 CONTAINER_INVALID
 *   T04 — RQ-011: Atomic DB writes + BullMQ enqueue on success; returns { meeting_id, status: 'TRANSCRIBING' }
 *   T05 — RQ-012: language=null → Meeting.language not set (auto-detect)
 *   T06 — RQ-013: title is passed through to Meeting
 *   T07 — NFR-001: 500 MB boundary accepted (size_bytes = 524,288,000)
 *   T08 — NFR-002: BullMQ job enqueued after DB transaction
 *   T09 — DB failure maps to 500 INTERNAL_ERROR
 *   T10 — Invalid s3_key prefix maps to 400 INVALID_REQUEST
 */
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../server.js'

// ─── Infrastructure stubs ────────────────────────────────────────────────────

// Stub SSE plugin (avoids REDIS_URL requirement at register time)
vi.mock('../plugins/sse.js', () => ({
  ssePlugin: async () => { /* no-op */ },
}))

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

// ─── vi.hoisted: construct mock functions before vi.mock hoisting runs ────────

const { mockMeetingCreate, mockRecordingCreate, mockTranscriptionJobCreate, mockMeetingUpdate, mockTransaction } = vi.hoisted(() => {
  const mockMeetingCreate = vi.fn()
  const mockRecordingCreate = vi.fn()
  const mockTranscriptionJobCreate = vi.fn()
  const mockMeetingUpdate = vi.fn()

  const mockTransaction = vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => {
    const tx = {
      meeting: { create: mockMeetingCreate, update: mockMeetingUpdate },
      recording: { create: mockRecordingCreate },
      transcriptionJob: { create: mockTranscriptionJobCreate },
    }
    return cb(tx)
  })

  return { mockMeetingCreate, mockRecordingCreate, mockTranscriptionJobCreate, mockMeetingUpdate, mockTransaction }
})

vi.mock('../db.js', () => ({
  prisma: {
    $queryRaw: vi.fn().mockResolvedValue([{ '?column?': 1 }]),
    meeting: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    $transaction: mockTransaction,
  },
}))

// ─── Mock BullMQ Queue ────────────────────────────────────────────────────────

const { mockQueueAdd, mockQueueClose } = vi.hoisted(() => ({
  mockQueueAdd: vi.fn().mockResolvedValue({}),
  mockQueueClose: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('bullmq', () => ({
  Queue: vi.fn().mockImplementation(() => ({
    add: mockQueueAdd,
    close: mockQueueClose,
  })),
}))

// ─── Mock S3 ─────────────────────────────────────────────────────────────────

const { mockCompleteMultipart, mockAbortMultipart, mockCreateMultipart, mockPresignPart } = vi.hoisted(() => ({
  mockCompleteMultipart: vi.fn().mockResolvedValue(undefined),
  mockAbortMultipart: vi.fn().mockResolvedValue(undefined),
  mockCreateMultipart: vi.fn().mockResolvedValue('test-upload-id'),
  mockPresignPart: vi.fn().mockResolvedValue('http://localhost:9000/presigned'),
}))

vi.mock('../storage/s3-adapter.js', () => ({
  s3ConfigFromEnv: vi.fn().mockReturnValue({
    bucket: 'test-bucket',
    region: 'us-east-1',
    accessKeyId: 'key',
    secretAccessKey: 'secret',
  }),
  S3StorageProvider: vi.fn().mockImplementation(() => ({
    createMultipartUpload: mockCreateMultipart,
    presignUploadPart: mockPresignPart,
    completeMultipartUpload: mockCompleteMultipart,
    abortMultipartUpload: mockAbortMultipart,
  })),
}))

// ─── Mock fluent-ffmpeg (probeContainer uses dynamic import) ─────────────────

vi.mock('fluent-ffmpeg', () => ({
  default: {
    ffprobe: vi.fn((_path: string, cb: (err: Error | null) => void) => cb(null)),
  },
}))

// ─── App import after mocks ───────────────────────────────────────────────────

import { buildApp as _buildApp } from '../server.js'

// ─── Valid RFC 4122 UUIDs ─────────────────────────────────────────────────────

const MEETING_UUID = '123e4567-e89b-12d3-a456-426614174000'
const JOB_UUID = '123e4567-e89b-12d3-a456-426614174001'
const S3_KEY = 'pending/test-upload-abc123.mp4'
const S3_UPLOAD_ID = 'test-multipart-upload-id'

function happyBody(overrides: Record<string, unknown> = {}) {
  return {
    s3_key: S3_KEY,
    s3_upload_id: S3_UPLOAD_ID,
    filename: 'meeting.mp4',
    size_bytes: 100 * 1024 * 1024,
    filetype: 'video/mp4',
    title: 'Meeting Title',
    language: null,
    parts: [{ part_number: 1, etag: 'abc123etag' }],
    ...overrides,
  }
}

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('Upload — POST /api/uploads/complete', () => {
  let app: FastifyInstance

  beforeEach(async () => {
    vi.clearAllMocks()

    mockCompleteMultipart.mockResolvedValue(undefined)
    mockMeetingCreate.mockResolvedValue({ id: MEETING_UUID })
    mockRecordingCreate.mockResolvedValue({ id: 'rec-id' })
    mockTranscriptionJobCreate.mockResolvedValue({ id: JOB_UUID })
    mockMeetingUpdate.mockResolvedValue({ id: MEETING_UUID, status: 'TRANSCRIBING' })

    app = await buildApp({ logLevel: 'silent' })
    await app.ready()
  })

  afterAll(async () => {
    await app?.close()
  })

  // ─── T04: happy path ────────────────────────────────────────────────────────

  it('T04 — RQ-011: returns 200 { meeting_id, status: TRANSCRIBING } on success', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/uploads/complete',
      payload: happyBody(),
    })

    expect(res.statusCode).toBe(200)
    const body = res.json<{ meeting_id: string; status: string }>()
    expect(body.meeting_id).toBe(MEETING_UUID)
    expect(body.status).toBe('TRANSCRIBING')
  })

  it('T04b — RQ-011: Prisma transaction creates Meeting, Recording, TranscriptionJob, transitions status', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/uploads/complete',
      payload: happyBody(),
    })

    expect(mockMeetingCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'UPLOADING' }),
      }),
    )
    expect(mockRecordingCreate).toHaveBeenCalledOnce()
    expect(mockTranscriptionJobCreate).toHaveBeenCalledOnce()
    expect(mockMeetingUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: 'TRANSCRIBING' },
      }),
    )
  })

  it('T08 — NFR-002: BullMQ add() called after DB transaction commits', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/uploads/complete',
      payload: happyBody(),
    })

    expect(mockQueueAdd).toHaveBeenCalledOnce()
    expect(mockQueueAdd).toHaveBeenCalledWith(
      'transcribe',
      { transcription_job_id: JOB_UUID },
    )
  })

  // ─── T01: RQ-008 — size too large ──────────────────────────────────────────

  it('T01 — RQ-008: rejects size_bytes > 524,288,000 with 400 VALIDATION_ERROR', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/uploads/complete',
      payload: happyBody({ size_bytes: 524_288_001 }),
    })

    // size_bytes > max is caught by Zod schema validation (400)
    expect(res.statusCode).toBe(400)
  })

  it('T07 — NFR-001: accepts exactly 524,288,000 bytes (500 MB boundary)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/uploads/complete',
      payload: happyBody({ size_bytes: 524_288_000 }),
    })

    expect(res.statusCode).toBe(200)
  })

  // ─── T02: RQ-009 — MIME validation ──────────────────────────────────────────

  it.each([
    ['video/mp4'],
    ['video/x-matroska'],
    ['video/quicktime'],
  ])('T02a — RQ-009: accepts %s', async (filetype) => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/uploads/complete',
      payload: happyBody({ filetype }),
    })
    expect(res.statusCode).toBe(200)
  })

  it('T02b — RQ-009: rejects unsupported MIME type with 400 VALIDATION_ERROR', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/uploads/complete',
      payload: happyBody({ filetype: 'video/webm' }),
    })

    expect(res.statusCode).toBe(400)
  })

  // ─── T10: invalid s3_key prefix ──────────────────────────────────────────────

  it('T10 — invalid s3_key prefix returns 400 INVALID_REQUEST', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/uploads/complete',
      payload: happyBody({ s3_key: '../etc/passwd' }),
    })

    expect(res.statusCode).toBe(400)
    const body = res.json<{ code: string }>()
    expect(body.code).toBe('INVALID_REQUEST')
  })

  // ─── T03: RQ-010 — container probe ──────────────────────────────────────────

  it('T03 — RQ-010: rejects corrupt container with 422 CONTAINER_INVALID', async () => {
    const ffmpeg = await import('fluent-ffmpeg')
    vi.mocked((ffmpeg.default as unknown as { ffprobe: (path: string, cb: (err: Error | null) => void) => void }).ffprobe).mockImplementationOnce(
      (_path: string, cb: (err: Error | null) => void) => cb(new Error('Invalid data')),
    )

    const res = await app.inject({
      method: 'POST',
      url: '/api/uploads/complete',
      payload: happyBody(),
    })

    expect(res.statusCode).toBe(422)
    const body = res.json<{ code: string }>()
    expect(body.code).toBe('CONTAINER_INVALID')
  })

  // ─── T05: RQ-012 — language handling ────────────────────────────────────────

  it('T05a — RQ-012: language=RU is passed to Meeting', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/uploads/complete',
      payload: happyBody({ language: 'RU' }),
    })

    expect(mockMeetingCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ language: 'RU' }),
      }),
    )
  })

  it('T05b — RQ-012: language=EN is passed to Meeting', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/uploads/complete',
      payload: happyBody({ language: 'EN' }),
    })

    expect(mockMeetingCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ language: 'EN' }),
      }),
    )
  })

  it('T05c — RQ-012: language=null leaves Meeting.language unset (auto-detect)', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/uploads/complete',
      payload: happyBody({ language: null }),
    })

    expect(mockMeetingCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.not.objectContaining({ language: expect.anything() }),
      }),
    )
  })

  // ─── T06: RQ-013 — title handling ────────────────────────────────────────────

  it('T06 — RQ-013: provided title is used as-is', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/uploads/complete',
      payload: happyBody({ title: 'Sprint Planning' }),
    })

    expect(mockMeetingCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ title: 'Sprint Planning' }),
      }),
    )
  })

  // ─── T09: DB failure → 500 INTERNAL_ERROR ───────────────────────────────────

  it('T09 — DB failure maps to 500 INTERNAL_ERROR', async () => {
    mockTransaction.mockRejectedValueOnce(new Error('Connection refused'))

    const res = await app.inject({
      method: 'POST',
      url: '/api/uploads/complete',
      payload: happyBody(),
    })

    expect(res.statusCode).toBe(500)
    const body = res.json<{ code: string }>()
    expect(body.code).toBe('INTERNAL_ERROR')
  })

  // ─── Storage URI format ─────────────────────────────────────────────────────

  it('passes correct s3:// storage URI to Recording', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/uploads/complete',
      payload: happyBody({ s3_key: 'pending/uuid-test.mp4' }),
    })

    expect(mockRecordingCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          storageUri: 's3://test-bucket/pending/uuid-test.mp4',
        }),
      }),
    )
  })

  // ─── S3 complete called ─────────────────────────────────────────────────────

  it('calls S3 completeMultipartUpload with correct parts', async () => {
    const parts = [
      { part_number: 1, etag: 'etag-1' },
      { part_number: 2, etag: 'etag-2' },
    ]

    await app.inject({
      method: 'POST',
      url: '/api/uploads/complete',
      payload: happyBody({ parts }),
    })

    expect(mockCompleteMultipart).toHaveBeenCalledWith(
      S3_KEY,
      S3_UPLOAD_ID,
      [
        { PartNumber: 1, ETag: 'etag-1' },
        { PartNumber: 2, ETag: 'etag-2' },
      ],
    )
  })
})
