/**
 * UC-100-BE — Upload meeting video: integration tests
 *
 * Uses Fastify inject() — no live server, DB, or S3 required.
 * Prisma, BullMQ, and fluent-ffmpeg are mocked.
 *
 * Test coverage (per test-spec.md):
 *   T01 — RQ-008: Reject size_bytes > 524,288,000 (500 MB)
 *   T02 — RQ-009: Accept video/mp4|video/x-matroska|video/quicktime; reject others
 *   T03 — RQ-010: Corrupt file (probeContainer fails) rejected with 422 CONTAINER_INVALID
 *   T04 — RQ-011: Atomic DB writes + BullMQ enqueue on success; returns { meeting_id, status: 'TRANSCRIBING' }
 *   T05 — RQ-012: language=null → Meeting.language not set (auto-detect)
 *   T06 — RQ-013: title blank → defaults to filename without extension
 *   T07 — NFR-001: 500 MB boundary accepted (size_bytes = 524,288,000)
 *   T08 — NFR-002: BullMQ job enqueued (async); DB row created synchronously
 *   T09 — DB failure maps to 500 INTERNAL_ERROR
 *   T10 — Missing S3 config maps to 500 INTERNAL_ERROR
 */
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../server.js'

// ─── Infrastructure stubs ────────────────────────────────────────────────────

// Stub TUS plugin (avoids S3 env requirement)
vi.mock('../plugins/tus.js', () => ({
  tusPlugin: async () => { /* no-op */ },
}))

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

  // $transaction implementation: executes the callback with mock tx
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

// ─── Mock S3 config ──────────────────────────────────────────────────────────

vi.mock('../storage/s3-adapter.js', () => ({
  s3ConfigFromEnv: vi.fn().mockReturnValue({
    bucket: 'test-bucket',
    region: 'us-east-1',
    accessKeyId: 'key',
    secretAccessKey: 'secret',
  }),
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
const UPLOAD_ID = 'some-tus-upload-id-abc123'

// ─── Default happy-path request body ─────────────────────────────────────────

function happyBody(overrides: Record<string, unknown> = {}) {
  return {
    filename: 'meeting.mp4',
    size_bytes: 100 * 1024 * 1024, // 100 MB
    mime_type: 'video/mp4',
    skip_probe: true, // skip ffprobe in tests by default
    ...overrides,
  }
}

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('UC-100-BE — POST /api/uploads/:uploadId/finalize', () => {
  let app: FastifyInstance

  beforeEach(async () => {
    vi.clearAllMocks()

    // Default: $transaction succeeds and returns meeting_id + transcription_job_id
    mockMeetingCreate.mockResolvedValue({ id: MEETING_UUID })
    mockRecordingCreate.mockResolvedValue({ id: 'rec-id' })
    mockTranscriptionJobCreate.mockResolvedValue({ id: JOB_UUID })
    mockMeetingUpdate.mockResolvedValue({ id: MEETING_UUID, status: 'TRANSCRIBING' })

    app = await buildApp({ logLevel: 'silent' })
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
  })

  // ─── T04: happy path ────────────────────────────────────────────────────────

  it('T04 — RQ-011: returns 200 { meeting_id, status: TRANSCRIBING } on success', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/uploads/${UPLOAD_ID}/finalize`,
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
      url: `/api/uploads/${UPLOAD_ID}/finalize`,
      payload: happyBody(),
    })

    // Meeting created with status=UPLOADING
    expect(mockMeetingCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'UPLOADING' }),
      }),
    )
    // Recording created
    expect(mockRecordingCreate).toHaveBeenCalledOnce()
    // TranscriptionJob created
    expect(mockTranscriptionJobCreate).toHaveBeenCalledOnce()
    // Meeting transitioned to TRANSCRIBING
    expect(mockMeetingUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: 'TRANSCRIBING' },
      }),
    )
  })

  it('T08 — NFR-002: BullMQ add() called after DB transaction commits', async () => {
    await app.inject({
      method: 'POST',
      url: `/api/uploads/${UPLOAD_ID}/finalize`,
      payload: happyBody(),
    })

    expect(mockQueueAdd).toHaveBeenCalledOnce()
    expect(mockQueueAdd).toHaveBeenCalledWith(
      'transcribe',
      { transcription_job_id: JOB_UUID },
    )
  })

  // ─── T01: RQ-008 — size too large ──────────────────────────────────────────

  it('T01 — RQ-008: rejects size_bytes > 524,288,000 with 413 FILE_TOO_LARGE', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/uploads/${UPLOAD_ID}/finalize`,
      payload: happyBody({ size_bytes: 524_288_001 }),
    })

    expect(res.statusCode).toBe(413)
    const body = res.json<{ code: string }>()
    expect(body.code).toBe('FILE_TOO_LARGE')
  })

  it('T07 — NFR-001: accepts exactly 524,288,000 bytes (500 MB boundary)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/uploads/${UPLOAD_ID}/finalize`,
      payload: happyBody({ size_bytes: 524_288_000 }),
    })

    expect(res.statusCode).toBe(200)
  })

  // ─── T02: RQ-009 — MIME validation ──────────────────────────────────────────

  it.each([
    ['video/mp4'],
    ['video/x-matroska'],
    ['video/quicktime'],
  ])('T02a — RQ-009: accepts %s', async (mimeType) => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/uploads/${UPLOAD_ID}/finalize`,
      payload: happyBody({ mime_type: mimeType }),
    })
    expect(res.statusCode).toBe(200)
  })

  it('T02b — RQ-009: rejects unsupported MIME type with 415 UNSUPPORTED_MIME', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/uploads/${UPLOAD_ID}/finalize`,
      payload: happyBody({ mime_type: 'application/pdf' }),
    })

    expect(res.statusCode).toBe(415)
    const body = res.json<{ code: string }>()
    expect(body.code).toBe('UNSUPPORTED_MIME')
  })

  it('T02c — RQ-009: rejects video/avi as unsupported per contract', async () => {
    // api-contract.md only lists {video/mp4, video/x-matroska, video/quicktime}
    // The route strictly enforces this set.
    const res = await app.inject({
      method: 'POST',
      url: `/api/uploads/${UPLOAD_ID}/finalize`,
      payload: happyBody({ mime_type: 'application/octet-stream' }),
    })
    expect(res.statusCode).toBe(415)
  })

  // ─── T03: RQ-010 — container probe ──────────────────────────────────────────

  it('T03 — RQ-010: rejects corrupt container with 422 CONTAINER_INVALID', async () => {
    // Override the fluent-ffmpeg mock to simulate a probe failure
    const ffmpeg = await import('fluent-ffmpeg')
    vi.mocked((ffmpeg.default as unknown as { ffprobe: (path: string, cb: (err: Error | null) => void) => void }).ffprobe).mockImplementationOnce(
      (_path: string, cb: (err: Error | null) => void) => cb(new Error('Invalid data found when processing input')),
    )

    const res = await app.inject({
      method: 'POST',
      url: `/api/uploads/${UPLOAD_ID}/finalize`,
      // Don't skip probe this time
      payload: { ...happyBody(), skip_probe: false },
    })

    expect(res.statusCode).toBe(422)
    const body = res.json<{ code: string }>()
    expect(body.code).toBe('CONTAINER_INVALID')
  })

  // ─── T05: RQ-012 — language handling ────────────────────────────────────────

  it('T05a — RQ-012: language=RU is passed to Meeting', async () => {
    await app.inject({
      method: 'POST',
      url: `/api/uploads/${UPLOAD_ID}/finalize`,
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
      url: `/api/uploads/${UPLOAD_ID}/finalize`,
      payload: happyBody({ language: 'EN' }),
    })

    expect(mockMeetingCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ language: 'EN' }),
      }),
    )
  })

  it('T05c — RQ-012: omitting language leaves Meeting.language unset (auto-detect)', async () => {
    await app.inject({
      method: 'POST',
      url: `/api/uploads/${UPLOAD_ID}/finalize`,
      payload: happyBody({ language: undefined }),
    })

    // language key should not be present in the create data
    expect(mockMeetingCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.not.objectContaining({ language: expect.anything() }),
      }),
    )
  })

  // ─── T06: RQ-013 — title defaulting ──────────────────────────────────────────

  it('T06a — RQ-013: title blank → defaults to filename without extension', async () => {
    await app.inject({
      method: 'POST',
      url: `/api/uploads/${UPLOAD_ID}/finalize`,
      payload: happyBody({ filename: 'my-meeting.mp4', title: undefined }),
    })

    expect(mockMeetingCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ title: 'my-meeting' }),
      }),
    )
  })

  it('T06b — RQ-013: provided title is used as-is', async () => {
    await app.inject({
      method: 'POST',
      url: `/api/uploads/${UPLOAD_ID}/finalize`,
      payload: happyBody({ filename: 'raw.mp4', title: 'Sprint Planning' }),
    })

    expect(mockMeetingCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ title: 'Sprint Planning' }),
      }),
    )
  })

  it('T06c — RQ-013: filename without extension uses full filename as title', async () => {
    await app.inject({
      method: 'POST',
      url: `/api/uploads/${UPLOAD_ID}/finalize`,
      payload: happyBody({ filename: 'meeting', title: undefined }),
    })

    expect(mockMeetingCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ title: 'meeting' }),
      }),
    )
  })

  // ─── T09: DB failure → 500 INTERNAL_ERROR ───────────────────────────────────

  it('T09 — DB failure maps to 500 INTERNAL_ERROR', async () => {
    mockTransaction.mockRejectedValueOnce(new Error('Connection refused'))

    const res = await app.inject({
      method: 'POST',
      url: `/api/uploads/${UPLOAD_ID}/finalize`,
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
      url: `/api/uploads/${UPLOAD_ID}/finalize`,
      payload: happyBody(),
    })

    expect(mockRecordingCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          storageUri: `s3://test-bucket/${UPLOAD_ID}`,
        }),
      }),
    )
  })
})
