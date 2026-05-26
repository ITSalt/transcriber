/**
 * UC-002-BE — View meeting detail: integration tests
 *
 * Uses Fastify inject() — no live server or DB required.
 * Prisma is mocked; each test controls the mock return value.
 *
 * Test coverage (per test-spec.md):
 *   T01 — happy path: returns correct MeetingDetailResponse shape
 *   T02 — 404 when meeting does not exist (MEETING_NOT_FOUND)
 *   T03 — 404 when meeting has no recording
 *   T04 — RQ-004: error_reason is surfaced when Meeting.status=ERROR
 *   T05 — nullable fields: latest_transcription_job / latest_protocol_job = null
 *   T06 — transcript_exists / protocol_exists flags
 *   T07 — NFR-007: endpoint reachable without Authorization header
 *   T08 — DB failure maps to 500 INTERNAL_ERROR
 *   T09 — invalid UUID in :id returns 400
 */
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../server.js'

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

const { mockFindUnique } = vi.hoisted(() => ({
  mockFindUnique: vi.fn(),
}))

vi.mock('../db.js', () => ({
  prisma: {
    meeting: {
      findMany: vi.fn(),
      findUnique: mockFindUnique,
    },
    $queryRaw: vi.fn().mockResolvedValue([{ '?column?': 1 }]),
  },
}))

// ─── Valid RFC 4122 UUIDs ─────────────────────────────────────────────────────

const MEETING_UUID = '123e4567-e89b-12d3-a456-426614174000'
const NOT_A_UUID = 'not-a-uuid'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeDbMeeting(overrides: Record<string, unknown> = {}) {
  const now = new Date('2024-03-01T12:00:00.000Z')
  return {
    id: MEETING_UUID,
    title: 'Sprint Review',
    status: 'UPLOADED',
    language: 'RU',
    createdAt: now,
    updatedAt: now,
    recording: {
      storageUri: 's3://bucket/sprint-review.mp4',
      mimeType: 'VIDEO_MP4',
      sizeBytes: BigInt(104857600), // 100 MB
      durationSec: 3600.9,
      uploadedAt: now,
    },
    transcriptionJob: null,
    protocolGenJob: null,
    transcript: null,
    protocol: null,
    ...overrides,
  }
}

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('UC-002-BE — GET /api/meetings/:id', () => {
  let app: FastifyInstance

  beforeEach(async () => {
    mockFindUnique.mockReset()
    app = await buildApp({ logLevel: 'silent' })
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
  })

  // ─── T01: happy path response shape ──────────────────────────────────────────

  it('T01 — returns correct MeetingDetailResponse for a fully populated meeting', async () => {
    mockFindUnique.mockResolvedValue(makeDbMeeting())

    const res = await app.inject({
      method: 'GET',
      url: `/api/meetings/${MEETING_UUID}`,
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()

    expect(body.meeting).toMatchObject({
      id: MEETING_UUID,
      title: 'Sprint Review',
      status: 'UPLOADED',
      language: 'RU',
      uploaded_at: '2024-03-01T12:00:00.000Z',
      updated_at: '2024-03-01T12:00:00.000Z',
    })
    expect(body.recording).toMatchObject({
      filename: 'sprint-review.mp4',
      size_bytes: 104857600,
      mime_type: 'VIDEO_MP4',
      duration_sec: 3600, // truncated from 3600.9
    })
    expect(body.latest_transcription_job).toBeNull()
    expect(body.latest_protocol_job).toBeNull()
    expect(body.transcript_exists).toBe(false)
    expect(body.protocol_exists).toBe(false)
  })

  // ─── T02: 404 when meeting not found ─────────────────────────────────────────

  it('T02 — returns 404 MEETING_NOT_FOUND when meeting does not exist', async () => {
    mockFindUnique.mockResolvedValue(null)

    const res = await app.inject({
      method: 'GET',
      url: `/api/meetings/${MEETING_UUID}`,
    })

    expect(res.statusCode).toBe(404)
    const body = res.json<{ code: string }>()
    expect(body.code).toBe('MEETING_NOT_FOUND')
  })

  // ─── T03: 404 when recording is null ─────────────────────────────────────────

  it('T03 — returns 404 MEETING_NOT_FOUND when meeting has no recording', async () => {
    mockFindUnique.mockResolvedValue(makeDbMeeting({ recording: null }))

    const res = await app.inject({
      method: 'GET',
      url: `/api/meetings/${MEETING_UUID}`,
    })

    expect(res.statusCode).toBe(404)
    const body = res.json<{ code: string }>()
    expect(body.code).toBe('MEETING_NOT_FOUND')
  })

  // ─── T04: RQ-004 error_reason surfaced from latest job ───────────────────────

  it('T04 — RQ-004: error_reason surfaces from transcription job when status=FAILED', async () => {
    mockFindUnique.mockResolvedValue(
      makeDbMeeting({
        status: 'FAILED',
        transcriptionJob: {
          id: 'aaa00000-e89b-12d3-a456-426614174999',
          meetingId: MEETING_UUID,
          status: 'FAILED',
          startedAt: new Date('2024-03-01T12:05:00.000Z'),
          finishedAt: new Date('2024-03-01T12:06:00.000Z'),
          errorMsg: 'ASR provider returned 503',
          createdAt: new Date('2024-03-01T12:00:00.000Z'),
          updatedAt: new Date('2024-03-01T12:06:00.000Z'),
        },
      }),
    )

    const res = await app.inject({
      method: 'GET',
      url: `/api/meetings/${MEETING_UUID}`,
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.meeting.status).toBe('FAILED')
    expect(body.latest_transcription_job).toMatchObject({
      status: 'FAILED',
      started_at: '2024-03-01T12:05:00.000Z',
      completed_at: '2024-03-01T12:06:00.000Z',
      error_reason: 'ASR provider returned 503',
    })
  })

  // ─── T05: nullable job fields ─────────────────────────────────────────────────

  it('T05 — both jobs null when no jobs exist for the meeting', async () => {
    mockFindUnique.mockResolvedValue(makeDbMeeting())

    const res = await app.inject({
      method: 'GET',
      url: `/api/meetings/${MEETING_UUID}`,
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.latest_transcription_job).toBeNull()
    expect(body.latest_protocol_job).toBeNull()
  })

  // ─── T06: transcript_exists / protocol_exists ─────────────────────────────────

  it('T06 — transcript_exists and protocol_exists are true when records exist', async () => {
    mockFindUnique.mockResolvedValue(
      makeDbMeeting({
        transcript: { id: 'bbb00000-e89b-12d3-a456-426614174001' },
        protocol: { id: 'ccc00000-e89b-12d3-a456-426614174002' },
      }),
    )

    const res = await app.inject({
      method: 'GET',
      url: `/api/meetings/${MEETING_UUID}`,
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.transcript_exists).toBe(true)
    expect(body.protocol_exists).toBe(true)
  })

  // ─── T07: NFR-007 no auth required ───────────────────────────────────────────

  it('T07 — NFR-007: endpoint returns 200 without Authorization header', async () => {
    mockFindUnique.mockResolvedValue(makeDbMeeting())

    const res = await app.inject({
      method: 'GET',
      url: `/api/meetings/${MEETING_UUID}`,
      // Deliberately no Authorization header
    })

    expect(res.statusCode).toBe(200)
  })

  // ─── T08: DB failure → 500 INTERNAL_ERROR ────────────────────────────────────

  it('T08 — DB failure maps to 500 INTERNAL_ERROR', async () => {
    mockFindUnique.mockRejectedValue(new Error('Connection refused'))

    const res = await app.inject({
      method: 'GET',
      url: `/api/meetings/${MEETING_UUID}`,
    })

    expect(res.statusCode).toBe(500)
    const body = res.json<{ code: string }>()
    expect(body.code).toBe('INTERNAL_ERROR')
  })

  // ─── T09: invalid UUID → 400 validation error ────────────────────────────────

  it('T09 — invalid UUID in :id param returns 400 VALIDATION_ERROR', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/meetings/${NOT_A_UUID}`,
    })

    expect(res.statusCode).toBe(400)
    const body = res.json<{ code: string }>()
    expect(body.code).toBe('VALIDATION_ERROR')
  })

  // ─── T10: protocol job surfaces error_reason ──────────────────────────────────

  it('T10 — RQ-004: error_reason surfaces from protocol job when protocol gen failed', async () => {
    mockFindUnique.mockResolvedValue(
      makeDbMeeting({
        status: 'FAILED',
        protocolGenJob: {
          id: 'ddd00000-e89b-12d3-a456-426614174003',
          meetingId: MEETING_UUID,
          status: 'FAILED',
          startedAt: new Date('2024-03-01T13:00:00.000Z'),
          finishedAt: new Date('2024-03-01T13:01:00.000Z'),
          errorMsg: 'LLM quota exceeded',
          createdAt: new Date('2024-03-01T12:00:00.000Z'),
          updatedAt: new Date('2024-03-01T13:01:00.000Z'),
        },
      }),
    )

    const res = await app.inject({
      method: 'GET',
      url: `/api/meetings/${MEETING_UUID}`,
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.latest_protocol_job).toMatchObject({
      status: 'FAILED',
      error_reason: 'LLM quota exceeded',
    })
  })

  // ─── T11: duration_sec truncated from Float ───────────────────────────────────

  it('T11 — duration_sec is truncated from Float to Int', async () => {
    mockFindUnique.mockResolvedValue(
      makeDbMeeting({
        recording: {
          storageUri: 's3://bucket/vid.mp4',
          mimeType: 'VIDEO_MP4',
          sizeBytes: BigInt(1024),
          durationSec: 1800.7,
          uploadedAt: new Date(),
        },
      }),
    )

    const res = await app.inject({
      method: 'GET',
      url: `/api/meetings/${MEETING_UUID}`,
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.recording.duration_sec).toBe(1800)
  })
})
