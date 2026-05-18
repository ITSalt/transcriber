/**
 * UC-003-BE — Delete meeting: integration tests
 *
 * Uses Fastify inject() — no live server or DB required.
 * Prisma and S3StorageProvider are mocked.
 *
 * Test coverage (per test-spec.md + api-contract.md):
 *   T01 — RQ-006: happy path — meeting deleted, returns {deleted:true, in_flight_failed:false}
 *   T02 — 404 when meeting does not exist (MEETING_NOT_FOUND)
 *   T03 — RQ-007: in-flight TranscriptionJob marked FAILED; in_flight_failed=true
 *   T04 — RQ-007: in-flight ProtocolGenerationJob marked FAILED; in_flight_failed=true
 *   T05 — RQ-007: BRQ-009 — terminal jobs (DONE/FAILED) not mutated
 *   T06 — 500 STORAGE_DELETE_FAILED when S3 delete throws StorageError
 *   T07 — NFR-007: endpoint reachable without Authorization header
 *   T08 — invalid UUID in :id returns 400 VALIDATION_ERROR
 *   T09 — DB failure maps to 500 INTERNAL_ERROR
 *   T10 — RQ-006: meeting with no recording deletes without S3 call
 */
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../server.js'
import { StorageError } from '@transcrib/shared'

// ─── Infrastructure stubs ─────────────────────────────────────────────────────

vi.mock('../plugins/tus.js', () => ({
  tusPlugin: async () => { /* no-op */ },
}))

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

// ─── Prisma mock ──────────────────────────────────────────────────────────────

const {
  mockFindUnique,
  mockMeetingDelete,
  mockTranscriptionJobUpdate,
  mockProtocolGenJobUpdate,
  mockTransaction,
} = vi.hoisted(() => ({
  mockFindUnique: vi.fn(),
  mockMeetingDelete: vi.fn(),
  mockTranscriptionJobUpdate: vi.fn(),
  mockProtocolGenJobUpdate: vi.fn(),
  mockTransaction: vi.fn(),
}))

vi.mock('../db.js', () => ({
  prisma: {
    meeting: {
      findUnique: mockFindUnique,
      findMany: vi.fn(),
    },
    transcriptionJob: {
      update: mockTranscriptionJobUpdate,
    },
    protocolGenerationJob: {
      update: mockProtocolGenJobUpdate,
    },
    $transaction: mockTransaction,
    $queryRaw: vi.fn().mockResolvedValue([{ '?column?': 1 }]),
  },
}))

// ─── S3StorageProvider mock ───────────────────────────────────────────────────

const { mockDeleteObject, mockStorageUriToKey } = vi.hoisted(() => ({
  mockDeleteObject: vi.fn(),
  mockStorageUriToKey: vi.fn((uri: string) => {
    // Simulate s3://bucket/key → key
    return uri.replace(/^s3:\/\/[^/]+\//, '')
  }),
}))

vi.mock('../storage/s3-adapter.js', () => ({
  s3ConfigFromEnv: () => ({
    endpoint: 'http://localhost:9000',
    bucket: 'test-bucket',
    region: 'us-east-1',
    accessKeyId: 'minio',
    secretAccessKey: 'minio123',
  }),
  S3StorageProvider: vi.fn().mockImplementation(() => ({
    deleteObject: mockDeleteObject,
    storageUriToKey: mockStorageUriToKey,
  })),
}))

// ─── SSE publish mock ─────────────────────────────────────────────────────────

vi.mock('../sse/pubsub.js', () => ({
  publishMeetingEvent: vi.fn().mockResolvedValue(undefined),
}))

// ─── Constants ────────────────────────────────────────────────────────────────

const MEETING_UUID = '123e4567-e89b-12d3-a456-426614174000'
const JOB_UUID_TRANS = 'aaa00000-e89b-12d3-a456-426614174001'
const JOB_UUID_PROTO = 'bbb00000-e89b-12d3-a456-426614174002'
const NOT_A_UUID = 'not-a-uuid'
const STORAGE_URI = 's3://test-bucket/uploads/test-file.mp4'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeDbMeeting(overrides: Record<string, unknown> = {}) {
  return {
    id: MEETING_UUID,
    title: 'Sprint Review',
    status: 'UPLOADED',
    language: 'RU',
    createdAt: new Date('2024-03-01T12:00:00.000Z'),
    updatedAt: new Date('2024-03-01T12:00:00.000Z'),
    recording: {
      id: 'rec-0001-e89b-12d3-a456-426614174000',
      meetingId: MEETING_UUID,
      storageUri: STORAGE_URI,
      mimeType: 'VIDEO_MP4',
      sizeBytes: BigInt(104857600),
      durationSec: 3600,
      uploadedAt: new Date('2024-03-01T12:00:00.000Z'),
    },
    transcriptionJob: null,
    protocolGenJob: null,
    ...overrides,
  }
}

/**
 * Set up mockTransaction to run the callback with a tx-proxy that delegates
 * update/delete calls to the outer prisma mocks.
 */
function setupTransactionPassthrough() {
  mockTransaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
    const tx = {
      transcriptionJob: { update: mockTranscriptionJobUpdate },
      protocolGenerationJob: { update: mockProtocolGenJobUpdate },
      meeting: { delete: mockMeetingDelete },
    }
    return cb(tx)
  })
}

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('UC-003-BE — DELETE /api/meetings/:id', () => {
  let app: FastifyInstance

  beforeEach(async () => {
    vi.clearAllMocks()
    // Default: deleteObject succeeds
    mockDeleteObject.mockResolvedValue(undefined)
    // Default: meeting.delete succeeds
    mockMeetingDelete.mockResolvedValue(undefined)
    // Default: job updates succeed
    mockTranscriptionJobUpdate.mockResolvedValue(undefined)
    mockProtocolGenJobUpdate.mockResolvedValue(undefined)
    // Set up transaction passthrough
    setupTransactionPassthrough()

    app = await buildApp({ logLevel: 'silent' })
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
  })

  // ─── T01: happy path ──────────────────────────────────────────────────────

  it('T01 — RQ-006: happy path returns {deleted:true, in_flight_failed:false}', async () => {
    mockFindUnique.mockResolvedValue(makeDbMeeting())

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/meetings/${MEETING_UUID}`,
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body).toEqual({ deleted: true, in_flight_failed: false })
    // S3 delete was called
    expect(mockDeleteObject).toHaveBeenCalledOnce()
    // Meeting.delete was called inside the transaction
    expect(mockMeetingDelete).toHaveBeenCalledWith({ where: { id: MEETING_UUID } })
  })

  // ─── T02: 404 when meeting not found ─────────────────────────────────────

  it('T02 — returns 404 MEETING_NOT_FOUND when meeting does not exist', async () => {
    mockFindUnique.mockResolvedValue(null)

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/meetings/${MEETING_UUID}`,
    })

    expect(res.statusCode).toBe(404)
    const body = res.json<{ code: string }>()
    expect(body.code).toBe('MEETING_NOT_FOUND')
    // DB delete and S3 should never be called
    expect(mockMeetingDelete).not.toHaveBeenCalled()
    expect(mockDeleteObject).not.toHaveBeenCalled()
  })

  // ─── T03: in-flight TranscriptionJob marked FAILED ────────────────────────

  it('T03 — RQ-007: in-flight TranscriptionJob is marked FAILED; in_flight_failed=true', async () => {
    mockFindUnique.mockResolvedValue(
      makeDbMeeting({
        transcriptionJob: {
          id: JOB_UUID_TRANS,
          meetingId: MEETING_UUID,
          status: 'PROCESSING',
          startedAt: new Date(),
          finishedAt: null,
          errorMsg: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      }),
    )

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/meetings/${MEETING_UUID}`,
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body).toEqual({ deleted: true, in_flight_failed: true })

    // RQ-007: transcription job was updated to FAILED
    expect(mockTranscriptionJobUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: JOB_UUID_TRANS },
        data: expect.objectContaining({
          status: 'FAILED',
          errorMsg: 'deleted by user',
        }),
      }),
    )
  })

  // ─── T04: in-flight ProtocolGenerationJob marked FAILED ──────────────────

  it('T04 — RQ-007: in-flight ProtocolGenerationJob is marked FAILED; in_flight_failed=true', async () => {
    mockFindUnique.mockResolvedValue(
      makeDbMeeting({
        protocolGenJob: {
          id: JOB_UUID_PROTO,
          meetingId: MEETING_UUID,
          status: 'PROCESSING',
          startedAt: new Date(),
          finishedAt: null,
          errorMsg: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      }),
    )

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/meetings/${MEETING_UUID}`,
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body).toEqual({ deleted: true, in_flight_failed: true })

    // RQ-007: protocol gen job was updated to FAILED
    expect(mockProtocolGenJobUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: JOB_UUID_PROTO },
        data: expect.objectContaining({
          status: 'FAILED',
          errorMsg: 'deleted by user',
        }),
      }),
    )
  })

  // ─── T05: BRQ-009 — terminal jobs not mutated ────────────────────────────

  it('T05 — BRQ-009: terminal (DONE/FAILED) jobs are not mutated, in_flight_failed=false', async () => {
    mockFindUnique.mockResolvedValue(
      makeDbMeeting({
        transcriptionJob: {
          id: JOB_UUID_TRANS,
          meetingId: MEETING_UUID,
          status: 'DONE', // terminal — must NOT be updated
          startedAt: new Date(),
          finishedAt: new Date(),
          errorMsg: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        protocolGenJob: {
          id: JOB_UUID_PROTO,
          meetingId: MEETING_UUID,
          status: 'FAILED', // terminal — must NOT be updated
          startedAt: new Date(),
          finishedAt: new Date(),
          errorMsg: 'previous error',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      }),
    )

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/meetings/${MEETING_UUID}`,
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    // Neither job was in-flight
    expect(body.in_flight_failed).toBe(false)
    // BRQ-009: no job updates for terminal jobs
    expect(mockTranscriptionJobUpdate).not.toHaveBeenCalled()
    expect(mockProtocolGenJobUpdate).not.toHaveBeenCalled()
  })

  // ─── T06: S3 delete failure → 500 STORAGE_DELETE_FAILED ─────────────────

  it('T06 — 500 STORAGE_DELETE_FAILED when S3 deleteObject throws StorageError', async () => {
    mockFindUnique.mockResolvedValue(makeDbMeeting())
    mockDeleteObject.mockRejectedValue(new StorageError('S3 connection failed'))

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/meetings/${MEETING_UUID}`,
    })

    expect(res.statusCode).toBe(500)
    const body = res.json<{ code: string }>()
    expect(body.code).toBe('STORAGE_DELETE_FAILED')
  })

  // ─── T07: NFR-007 — no auth required ────────────────────────────────────

  it('T07 — NFR-007: endpoint returns 200 without Authorization header', async () => {
    mockFindUnique.mockResolvedValue(makeDbMeeting())

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/meetings/${MEETING_UUID}`,
      // Deliberately no Authorization header
    })

    expect(res.statusCode).toBe(200)
  })

  // ─── T08: invalid UUID → 400 VALIDATION_ERROR ────────────────────────────

  it('T08 — invalid UUID in :id param returns 400 VALIDATION_ERROR', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/meetings/${NOT_A_UUID}`,
    })

    expect(res.statusCode).toBe(400)
    const body = res.json<{ code: string }>()
    expect(body.code).toBe('VALIDATION_ERROR')
  })

  // ─── T09: DB failure → 500 INTERNAL_ERROR ────────────────────────────────

  it('T09 — DB failure on findUnique maps to 500 INTERNAL_ERROR', async () => {
    mockFindUnique.mockRejectedValue(new Error('Connection refused'))

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/meetings/${MEETING_UUID}`,
    })

    expect(res.statusCode).toBe(500)
    const body = res.json<{ code: string }>()
    expect(body.code).toBe('INTERNAL_ERROR')
  })

  // ─── T10: meeting with no recording — no S3 call ─────────────────────────

  it('T10 — RQ-006: meeting with no recording deletes without calling S3', async () => {
    mockFindUnique.mockResolvedValue(makeDbMeeting({ recording: null }))

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/meetings/${MEETING_UUID}`,
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.deleted).toBe(true)
    // No recording → no S3 delete
    expect(mockDeleteObject).not.toHaveBeenCalled()
  })
})
