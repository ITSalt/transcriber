/**
 * UC-201-BE — View and download transcript: integration tests
 *
 * Uses Fastify inject() — no live server or DB required.
 * Prisma is mocked; each test controls the mock return value.
 *
 * Test coverage (per test-spec.md):
 *   T01 — RQ-019: GET /transcript returns correct TranscriptResponse shape
 *   T02 — RQ-020: GET /transcript/download returns text/plain with Content-Disposition
 *   T03 — 404 TRANSCRIPT_NOT_FOUND when no meeting exists
 *   T04 — 404 TRANSCRIPT_NOT_FOUND when meeting has no transcript row
 *   T05 — 409 STATUS_NOT_READY when Meeting.status < TRANSCRIBED
 *   T06 — NFR-007: endpoints reachable without Authorization header
 *   T07 — DB failure maps to 500 INTERNAL_ERROR
 *   T08 — invalid UUID in :id returns 400 VALIDATION_ERROR
 *   T09 — download filename uses meeting title when available
 *   T10 — download filename falls back to recording filename when title absent
 *   T11 — speaker_map null when transcript has no speaker map entries
 *   T12 — status-driven gating: TRANSCRIBED, GENERATING_PROTOCOL, PROTOCOL_READY are accepted
 *   T13 — status-driven gating: CREATED, UPLOADING, UPLOADED, TRANSCRIBING are rejected with 409
 */
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../server.js'

// ─── Infrastructure stubs ────────────────────────────────────────────────────

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

// ─── Valid RFC 4122 UUIDs ────────────────────────────────────────────────────

const MEETING_UUID = '123e4567-e89b-12d3-a456-426614174000'
const TRANSCRIPT_UUID = '123e4567-e89b-12d3-a456-426614174001'
const NOT_A_UUID = 'not-a-uuid'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeDbMeeting(overrides: Record<string, unknown> = {}) {
  const now = new Date('2024-03-01T12:00:00.000Z')
  return {
    id: MEETING_UUID,
    title: 'Sprint Review',
    status: 'TRANSCRIBED',
    language: 'RU',
    createdAt: now,
    updatedAt: now,
    recording: {
      storageUri: 's3://bucket/sprint-review.mp4',
    },
    transcript: makeDbTranscript(),
    ...overrides,
  }
}

function makeDbTranscript(overrides: Record<string, unknown> = {}) {
  const now = new Date('2024-03-01T12:10:00.000Z')
  return {
    id: TRANSCRIPT_UUID,
    meetingId: MEETING_UUID,
    speakerMap: { 'Speaker 1': 'Ivan', 'Speaker 2': null },
    segmentsBlob: [
      { speaker: 'Speaker 1', start: 0, end: 5, text: 'Hello everyone.' },
      { speaker: 'Speaker 2', start: 6, end: 12, text: 'Good morning.' },
    ],
    rawText: '[00:00] Speaker 1: Hello everyone.\n[00:06] Speaker 2: Good morning.',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('UC-201-BE — GET /api/meetings/:id/transcript', () => {
  let app: FastifyInstance

  beforeEach(async () => {
    mockFindUnique.mockReset()
    app = await buildApp({ logLevel: 'silent' })
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
  })

  // ─── T01: RQ-019 happy path JSON response ────────────────────────────────────

  it('T01 — RQ-019: returns correct TranscriptResponse shape', async () => {
    mockFindUnique.mockResolvedValue(makeDbMeeting())

    const res = await app.inject({
      method: 'GET',
      url: `/api/meetings/${MEETING_UUID}/transcript`,
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body).toMatchObject({
      id: TRANSCRIPT_UUID,
      meeting_id: MEETING_UUID,
      full_text: '[00:00] Speaker 1: Hello everyone.\n[00:06] Speaker 2: Good morning.',
      segments_count: 2,
      speakers_count: 2,
      language: 'RU',
      speaker_map: { 'Speaker 1': 'Ivan', 'Speaker 2': null },
      created_at: '2024-03-01T12:10:00.000Z',
    })
  })

  // ─── T03: 404 when meeting not found ─────────────────────────────────────────

  it('T03 — 404 TRANSCRIPT_NOT_FOUND when meeting does not exist', async () => {
    mockFindUnique.mockResolvedValue(null)

    const res = await app.inject({
      method: 'GET',
      url: `/api/meetings/${MEETING_UUID}/transcript`,
    })

    expect(res.statusCode).toBe(404)
    expect(res.json<{ code: string }>().code).toBe('TRANSCRIPT_NOT_FOUND')
  })

  // ─── T04: 404 when transcript row absent ─────────────────────────────────────

  it('T04 — 404 TRANSCRIPT_NOT_FOUND when meeting has no transcript row', async () => {
    mockFindUnique.mockResolvedValue(makeDbMeeting({ transcript: null }))

    const res = await app.inject({
      method: 'GET',
      url: `/api/meetings/${MEETING_UUID}/transcript`,
    })

    expect(res.statusCode).toBe(404)
    expect(res.json<{ code: string }>().code).toBe('TRANSCRIPT_NOT_FOUND')
  })

  // ─── T05: 409 when status not ready ──────────────────────────────────────────

  it('T05 — 409 STATUS_NOT_READY when Meeting.status is TRANSCRIBING', async () => {
    mockFindUnique.mockResolvedValue(makeDbMeeting({ status: 'TRANSCRIBING' }))

    const res = await app.inject({
      method: 'GET',
      url: `/api/meetings/${MEETING_UUID}/transcript`,
    })

    expect(res.statusCode).toBe(409)
    expect(res.json<{ code: string }>().code).toBe('STATUS_NOT_READY')
  })

  // ─── T06: NFR-007 no auth required ───────────────────────────────────────────

  it('T06 — NFR-007: endpoint reachable without Authorization header', async () => {
    mockFindUnique.mockResolvedValue(makeDbMeeting())

    const res = await app.inject({
      method: 'GET',
      url: `/api/meetings/${MEETING_UUID}/transcript`,
    })

    expect(res.statusCode).toBe(200)
  })

  // ─── T07: DB failure → 500 INTERNAL_ERROR ────────────────────────────────────

  it('T07 — DB failure maps to 500 INTERNAL_ERROR', async () => {
    mockFindUnique.mockRejectedValue(new Error('Connection refused'))

    const res = await app.inject({
      method: 'GET',
      url: `/api/meetings/${MEETING_UUID}/transcript`,
    })

    expect(res.statusCode).toBe(500)
    expect(res.json<{ code: string }>().code).toBe('INTERNAL_ERROR')
  })

  // ─── T08: invalid UUID → 400 ─────────────────────────────────────────────────

  it('T08 — invalid UUID in :id returns 400 VALIDATION_ERROR', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/meetings/${NOT_A_UUID}/transcript`,
    })

    expect(res.statusCode).toBe(400)
    expect(res.json<{ code: string }>().code).toBe('VALIDATION_ERROR')
  })

  // ─── T11: speaker_map null when no speaker map ────────────────────────────────

  it('T11 — speaker_map is null when transcript has empty speakerMap', async () => {
    mockFindUnique.mockResolvedValue(
      makeDbMeeting({
        transcript: makeDbTranscript({ speakerMap: {} }),
      }),
    )

    const res = await app.inject({
      method: 'GET',
      url: `/api/meetings/${MEETING_UUID}/transcript`,
    })

    expect(res.statusCode).toBe(200)
    // empty object {} → speaker_map: null (no named speakers)
    expect(res.json<{ speaker_map: unknown }>().speaker_map).toBeNull()
  })

  // ─── T12: accepted statuses ───────────────────────────────────────────────────

  it.each(['TRANSCRIBED', 'GENERATING_PROTOCOL', 'PROTOCOL_READY'])(
    'T12 — status %s is accepted (200)',
    async (status) => {
      mockFindUnique.mockResolvedValue(makeDbMeeting({ status }))

      const res = await app.inject({
        method: 'GET',
        url: `/api/meetings/${MEETING_UUID}/transcript`,
      })

      expect(res.statusCode).toBe(200)
    },
  )

  // ─── T13: rejected statuses ───────────────────────────────────────────────────

  it.each(['CREATED', 'UPLOADING', 'UPLOADED', 'TRANSCRIBING'])(
    'T13 — status %s is rejected with 409 STATUS_NOT_READY',
    async (status) => {
      mockFindUnique.mockResolvedValue(makeDbMeeting({ status }))

      const res = await app.inject({
        method: 'GET',
        url: `/api/meetings/${MEETING_UUID}/transcript`,
      })

      expect(res.statusCode).toBe(409)
      expect(res.json<{ code: string }>().code).toBe('STATUS_NOT_READY')
    },
  )
})

describe('UC-201-BE — GET /api/meetings/:id/transcript/download', () => {
  let app: FastifyInstance

  beforeEach(async () => {
    mockFindUnique.mockReset()
    app = await buildApp({ logLevel: 'silent' })
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
  })

  // ─── T02: RQ-020 happy path download ─────────────────────────────────────────

  it('T02 — RQ-020: returns text/plain attachment with correct content', async () => {
    mockFindUnique.mockResolvedValue(makeDbMeeting())

    const res = await app.inject({
      method: 'GET',
      url: `/api/meetings/${MEETING_UUID}/transcript/download`,
    })

    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toContain('text/plain')
    expect(res.headers['content-disposition']).toContain('attachment')
    expect(res.body).toBe(
      '[00:00] Speaker 1: Hello everyone.\n[00:06] Speaker 2: Good morning.',
    )
  })

  // ─── T09: download filename uses meeting title ────────────────────────────────

  it('T09 — RQ-020: download filename uses meeting title when available', async () => {
    mockFindUnique.mockResolvedValue(makeDbMeeting({ title: 'Sprint Review' }))

    const res = await app.inject({
      method: 'GET',
      url: `/api/meetings/${MEETING_UUID}/transcript/download`,
    })

    expect(res.statusCode).toBe(200)
    expect(res.headers['content-disposition']).toContain('Sprint-Review-transcript.txt')
  })

  // ─── T10: download filename falls back to recording filename ─────────────────

  it('T10 — RQ-020: download filename falls back to recording filename when title is absent', async () => {
    mockFindUnique.mockResolvedValue(
      makeDbMeeting({
        title: null,
        recording: { storageUri: 's3://bucket/my-standup.mp4' },
      }),
    )

    const res = await app.inject({
      method: 'GET',
      url: `/api/meetings/${MEETING_UUID}/transcript/download`,
    })

    expect(res.statusCode).toBe(200)
    expect(res.headers['content-disposition']).toContain('my-standup-transcript.txt')
  })

  // ─── 404 when meeting not found ───────────────────────────────────────────────

  it('returns 404 TRANSCRIPT_NOT_FOUND when meeting does not exist', async () => {
    mockFindUnique.mockResolvedValue(null)

    const res = await app.inject({
      method: 'GET',
      url: `/api/meetings/${MEETING_UUID}/transcript/download`,
    })

    expect(res.statusCode).toBe(404)
    expect(res.json<{ code: string }>().code).toBe('TRANSCRIPT_NOT_FOUND')
  })

  // ─── 409 when status not ready ────────────────────────────────────────────────

  it('returns 409 STATUS_NOT_READY when Meeting.status is UPLOADED', async () => {
    mockFindUnique.mockResolvedValue(makeDbMeeting({ status: 'UPLOADED' }))

    const res = await app.inject({
      method: 'GET',
      url: `/api/meetings/${MEETING_UUID}/transcript/download`,
    })

    expect(res.statusCode).toBe(409)
    expect(res.json<{ code: string }>().code).toBe('STATUS_NOT_READY')
  })

  // ─── invalid UUID → 400 ───────────────────────────────────────────────────────

  it('returns 400 VALIDATION_ERROR for invalid UUID in :id', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/meetings/${NOT_A_UUID}/transcript/download`,
    })

    expect(res.statusCode).toBe(400)
    expect(res.json<{ code: string }>().code).toBe('VALIDATION_ERROR')
  })
})
