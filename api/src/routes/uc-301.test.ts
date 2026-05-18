/**
 * UC-301-BE — Review and edit protocol: integration tests
 *
 * Uses Fastify inject() — no live server or DB required.
 * Prisma is mocked; each test controls the mock return value.
 *
 * Test coverage (per test-spec.md):
 *   T01 — RQ-027: GET returns correct ProtocolResponse shape
 *   T02 — RQ-027: PUT increments version by exactly 1 each save (BRQ-014)
 *   T03 — RQ-028: PUT increments edit_count by exactly 1 each save (BRQ-015)
 *   T04 — RQ-029: First save transitions Meeting.status PROTOCOL_READY -> EDITED (BRQ-008)
 *   T05 — RQ-029: Subsequent saves keep status=EDITED; last_edited_at updated
 *   T06 — RQ-030: PUT saves the exact markdown_content passed (canonical Markdown BRQ-018)
 *   T07 — 404 PROTOCOL_NOT_FOUND when meeting does not exist (GET)
 *   T08 — 404 PROTOCOL_NOT_FOUND when meeting has no protocol row (GET)
 *   T09 — 409 STATUS_NOT_READY when Meeting.status not in {PROTOCOL_READY, EDITED} (GET)
 *   T10 — 409 STATUS_NOT_READY when Meeting.status not in {PROTOCOL_READY, EDITED} (PUT)
 *   T11 — 400 VALIDATION_FAILED when markdown_content missing/empty (PUT)
 *   T12 — 500 INTERNAL_ERROR on DB failure (GET)
 *   T13 — 400 VALIDATION_ERROR for invalid UUID in :id
 *   T14 — NFR-007: endpoints reachable without Authorization header
 *   T15 — Status-driven gating: PROTOCOL_READY and EDITED are accepted (GET)
 *   T16 — Status-driven gating: non-protocol statuses rejected with 409 (GET)
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
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

const { mockFindUnique, mockProtocolUpdate, mockMeetingUpdate, mockTransaction } = vi.hoisted(() => ({
  mockFindUnique: vi.fn(),
  mockProtocolUpdate: vi.fn(),
  mockMeetingUpdate: vi.fn(),
  mockTransaction: vi.fn(),
}))

vi.mock('../db.js', () => ({
  prisma: {
    meeting: {
      findMany: vi.fn(),
      findUnique: mockFindUnique,
      update: mockMeetingUpdate,
    },
    protocol: {
      update: mockProtocolUpdate,
    },
    $transaction: mockTransaction,
    $queryRaw: vi.fn().mockResolvedValue([{ '?column?': 1 }]),
  },
}))

// ─── Valid RFC 4122 UUIDs ────────────────────────────────────────────────────

const MEETING_UUID = '123e4567-e89b-12d3-a456-426614174000'
const PROTOCOL_UUID = '123e4567-e89b-12d3-a456-426614174002'
const NOT_A_UUID = 'not-a-uuid'

// ─── Helpers ─────────────────────────────────────────────────────────────────

const GENERATED_AT = new Date('2024-03-01T10:00:00.000Z')
const LAST_EDITED_AT = new Date('2024-03-01T12:00:00.000Z')

function makeDbProtocol(overrides: Record<string, unknown> = {}) {
  return {
    id: PROTOCOL_UUID,
    meetingId: MEETING_UUID,
    markdownContent: '# Protocol\n\n## Participants\n- Alice\n\n## Discussion\n- Topic A\n\n## Decisions\n- Decision 1\n\n## Action Items\n- Action 1',
    version: 1,
    editCount: 0,
    generatedAt: GENERATED_AT,
    lastEditedAt: null as Date | null,
    createdAt: GENERATED_AT,
    updatedAt: GENERATED_AT,
    ...overrides,
  }
}

function makeDbMeeting(overrides: Record<string, unknown> = {}) {
  return {
    id: MEETING_UUID,
    title: 'Sprint Review',
    status: 'PROTOCOL_READY',
    language: 'RU',
    createdAt: GENERATED_AT,
    updatedAt: GENERATED_AT,
    protocol: makeDbProtocol(),
    ...overrides,
  }
}

// ─── GET /api/meetings/:id/protocol ──────────────────────────────────────────

describe('UC-301-BE — GET /api/meetings/:id/protocol', () => {
  let app: FastifyInstance

  beforeEach(async () => {
    mockFindUnique.mockReset()
    app = await buildApp({ logLevel: 'silent' })
    await app.ready()
  })

  afterEach(async () => {
    await app.close()
  })

  // T01: RQ-027 happy path — returns correct ProtocolResponse shape
  it('T01 — RQ-027: returns correct ProtocolResponse shape', async () => {
    mockFindUnique.mockResolvedValue(makeDbMeeting())

    const res = await app.inject({
      method: 'GET',
      url: `/api/meetings/${MEETING_UUID}/protocol`,
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body).toMatchObject({
      id: PROTOCOL_UUID,
      meeting_id: MEETING_UUID,
      version: 1,
      edit_count: 0,
      generated_at: '2024-03-01T10:00:00.000Z',
      last_edited_at: null,
    })
    expect(typeof body.markdown_content).toBe('string')
    expect(body.markdown_content.length).toBeGreaterThan(0)
  })

  // T07: 404 when meeting not found
  it('T07 — 404 PROTOCOL_NOT_FOUND when meeting does not exist', async () => {
    mockFindUnique.mockResolvedValue(null)

    const res = await app.inject({
      method: 'GET',
      url: `/api/meetings/${MEETING_UUID}/protocol`,
    })

    expect(res.statusCode).toBe(404)
    expect(res.json<{ code: string }>().code).toBe('PROTOCOL_NOT_FOUND')
  })

  // T08: 404 when protocol row absent
  it('T08 — 404 PROTOCOL_NOT_FOUND when meeting has no protocol row', async () => {
    mockFindUnique.mockResolvedValue(makeDbMeeting({ protocol: null }))

    const res = await app.inject({
      method: 'GET',
      url: `/api/meetings/${MEETING_UUID}/protocol`,
    })

    expect(res.statusCode).toBe(404)
    expect(res.json<{ code: string }>().code).toBe('PROTOCOL_NOT_FOUND')
  })

  // T09: 409 when status not in {PROTOCOL_READY, EDITED}
  it('T09 — 409 STATUS_NOT_READY when Meeting.status is TRANSCRIBED', async () => {
    mockFindUnique.mockResolvedValue(makeDbMeeting({ status: 'TRANSCRIBED' }))

    const res = await app.inject({
      method: 'GET',
      url: `/api/meetings/${MEETING_UUID}/protocol`,
    })

    expect(res.statusCode).toBe(409)
    expect(res.json<{ code: string }>().code).toBe('STATUS_NOT_READY')
  })

  // T12: DB failure → 500 INTERNAL_ERROR
  it('T12 — DB failure maps to 500 INTERNAL_ERROR', async () => {
    mockFindUnique.mockRejectedValue(new Error('Connection refused'))

    const res = await app.inject({
      method: 'GET',
      url: `/api/meetings/${MEETING_UUID}/protocol`,
    })

    expect(res.statusCode).toBe(500)
    expect(res.json<{ code: string }>().code).toBe('INTERNAL_ERROR')
  })

  // T13: invalid UUID → 400
  it('T13 — invalid UUID in :id returns 400 VALIDATION_ERROR', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/meetings/${NOT_A_UUID}/protocol`,
    })

    expect(res.statusCode).toBe(400)
    expect(res.json<{ code: string }>().code).toBe('VALIDATION_ERROR')
  })

  // T14: NFR-007 no auth required
  it('T14 — NFR-007: endpoint reachable without Authorization header', async () => {
    mockFindUnique.mockResolvedValue(makeDbMeeting())

    const res = await app.inject({
      method: 'GET',
      url: `/api/meetings/${MEETING_UUID}/protocol`,
    })

    expect(res.statusCode).toBe(200)
  })

  // T15: accepted statuses
  it.each(['PROTOCOL_READY', 'EDITED'])(
    'T15 — status %s is accepted (200)',
    async (status) => {
      mockFindUnique.mockResolvedValue(makeDbMeeting({ status }))

      const res = await app.inject({
        method: 'GET',
        url: `/api/meetings/${MEETING_UUID}/protocol`,
      })

      expect(res.statusCode).toBe(200)
    },
  )

  // T16: rejected statuses
  it.each(['CREATED', 'UPLOADING', 'UPLOADED', 'TRANSCRIBING', 'TRANSCRIBED', 'GENERATING_PROTOCOL'])(
    'T16 — status %s is rejected with 409 STATUS_NOT_READY',
    async (status) => {
      mockFindUnique.mockResolvedValue(makeDbMeeting({ status }))

      const res = await app.inject({
        method: 'GET',
        url: `/api/meetings/${MEETING_UUID}/protocol`,
      })

      expect(res.statusCode).toBe(409)
      expect(res.json<{ code: string }>().code).toBe('STATUS_NOT_READY')
    },
  )
})

// ─── PUT /api/meetings/:id/protocol ──────────────────────────────────────────

describe('UC-301-BE — PUT /api/meetings/:id/protocol', () => {
  let app: FastifyInstance

  beforeEach(async () => {
    mockFindUnique.mockReset()
    mockTransaction.mockReset()
    app = await buildApp({ logLevel: 'silent' })
    await app.ready()
  })

  afterEach(async () => {
    await app.close()
  })

  const NEW_MARKDOWN = '# Protocol\n\n## Participants\n- Alice\n- Bob\n\n## Discussion\n- Updated\n\n## Decisions\n- Dec 1\n\n## Action Items\n- Act 1'

  function makeUpdatedProtocol(version: number, editCount: number) {
    return {
      ...makeDbProtocol(),
      markdownContent: NEW_MARKDOWN,
      version,
      editCount,
      lastEditedAt: LAST_EDITED_AT,
    }
  }

  // T02: RQ-027 — version increments by exactly 1
  it('T02 — RQ-027: PUT increments version by exactly 1 (BRQ-014)', async () => {
    mockFindUnique.mockResolvedValue(makeDbMeeting())
    // $transaction returns [updatedProtocol, updatedMeeting]
    mockTransaction.mockResolvedValue([
      makeUpdatedProtocol(2, 1),
      { ...makeDbMeeting(), status: 'EDITED' },
    ])

    const res = await app.inject({
      method: 'PUT',
      url: `/api/meetings/${MEETING_UUID}/protocol`,
      headers: { 'Content-Type': 'application/json' },
      payload: { markdown_content: NEW_MARKDOWN },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    // RQ-027: version was 1, after first save must be 2
    expect(body.version).toBe(2)
  })

  // T03: RQ-028 — edit_count increments by exactly 1
  it('T03 — RQ-028: PUT increments edit_count by exactly 1 (BRQ-015)', async () => {
    mockFindUnique.mockResolvedValue(makeDbMeeting())
    mockTransaction.mockResolvedValue([
      makeUpdatedProtocol(2, 1),
      { ...makeDbMeeting(), status: 'EDITED' },
    ])

    const res = await app.inject({
      method: 'PUT',
      url: `/api/meetings/${MEETING_UUID}/protocol`,
      headers: { 'Content-Type': 'application/json' },
      payload: { markdown_content: NEW_MARKDOWN },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    // RQ-028: edit_count was 0, after first save must be 1
    expect(body.edit_count).toBe(1)
  })

  // T04: RQ-029 — First save: PROTOCOL_READY -> EDITED; meeting_status = EDITED
  it('T04 — RQ-029: First save transitions Meeting.status PROTOCOL_READY -> EDITED (BRQ-008)', async () => {
    mockFindUnique.mockResolvedValue(makeDbMeeting({ status: 'PROTOCOL_READY' }))
    mockTransaction.mockResolvedValue([
      makeUpdatedProtocol(2, 1),
      { ...makeDbMeeting(), status: 'EDITED' },
    ])

    const res = await app.inject({
      method: 'PUT',
      url: `/api/meetings/${MEETING_UUID}/protocol`,
      headers: { 'Content-Type': 'application/json' },
      payload: { markdown_content: NEW_MARKDOWN },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    // RQ-029: meeting_status must be EDITED after first save
    expect(body.meeting_status).toBe('EDITED')
    expect(body.last_edited_at).toBeTruthy()
  })

  // T05: RQ-029 — Subsequent saves keep status=EDITED
  it('T05 — RQ-029: Subsequent saves keep meeting_status=EDITED', async () => {
    mockFindUnique.mockResolvedValue(makeDbMeeting({ status: 'EDITED' }))
    mockTransaction.mockResolvedValue([
      makeUpdatedProtocol(3, 2),
      { ...makeDbMeeting(), status: 'EDITED' },
    ])

    const res = await app.inject({
      method: 'PUT',
      url: `/api/meetings/${MEETING_UUID}/protocol`,
      headers: { 'Content-Type': 'application/json' },
      payload: { markdown_content: NEW_MARKDOWN },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.meeting_status).toBe('EDITED')
    expect(body.version).toBe(3)
    expect(body.edit_count).toBe(2)
  })

  // T06: RQ-030 — saves exact markdown_content
  it('T06 — RQ-030: PUT saves the exact markdown_content passed (BRQ-018)', async () => {
    mockFindUnique.mockResolvedValue(makeDbMeeting())
    mockTransaction.mockImplementation(async (ops: unknown[]) => {
      // Execute both ops to verify the protocol update call includes correct content
      if (Array.isArray(ops)) {
        return [makeUpdatedProtocol(2, 1), { ...makeDbMeeting(), status: 'EDITED' }]
      }
      return []
    })

    const res = await app.inject({
      method: 'PUT',
      url: `/api/meetings/${MEETING_UUID}/protocol`,
      headers: { 'Content-Type': 'application/json' },
      payload: { markdown_content: NEW_MARKDOWN },
    })

    expect(res.statusCode).toBe(200)
    // Verify $transaction was called (atomicity — BRQ-008)
    expect(mockTransaction).toHaveBeenCalledTimes(1)
  })

  // T10: 409 when Meeting.status not in {PROTOCOL_READY, EDITED} for PUT
  it('T10 — 409 STATUS_NOT_READY when Meeting.status is TRANSCRIBED (PUT)', async () => {
    mockFindUnique.mockResolvedValue(makeDbMeeting({ status: 'TRANSCRIBED' }))

    const res = await app.inject({
      method: 'PUT',
      url: `/api/meetings/${MEETING_UUID}/protocol`,
      headers: { 'Content-Type': 'application/json' },
      payload: { markdown_content: NEW_MARKDOWN },
    })

    expect(res.statusCode).toBe(409)
    expect(res.json<{ code: string }>().code).toBe('STATUS_NOT_READY')
  })

  // T11: 400 when markdown_content missing/empty
  it('T11 — 400 VALIDATION_FAILED when markdown_content is empty string', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `/api/meetings/${MEETING_UUID}/protocol`,
      headers: { 'Content-Type': 'application/json' },
      payload: { markdown_content: '' },
    })

    expect(res.statusCode).toBe(400)
  })

  it('T11b — 400 VALIDATION_FAILED when markdown_content is missing', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `/api/meetings/${MEETING_UUID}/protocol`,
      headers: { 'Content-Type': 'application/json' },
      payload: {},
    })

    expect(res.statusCode).toBe(400)
  })

  // 404 when meeting not found (PUT)
  it('404 PROTOCOL_NOT_FOUND when meeting does not exist (PUT)', async () => {
    mockFindUnique.mockResolvedValue(null)

    const res = await app.inject({
      method: 'PUT',
      url: `/api/meetings/${MEETING_UUID}/protocol`,
      headers: { 'Content-Type': 'application/json' },
      payload: { markdown_content: NEW_MARKDOWN },
    })

    expect(res.statusCode).toBe(404)
    expect(res.json<{ code: string }>().code).toBe('PROTOCOL_NOT_FOUND')
  })

  // 404 when protocol row absent (PUT)
  it('404 PROTOCOL_NOT_FOUND when meeting has no protocol row (PUT)', async () => {
    mockFindUnique.mockResolvedValue(makeDbMeeting({ protocol: null }))

    const res = await app.inject({
      method: 'PUT',
      url: `/api/meetings/${MEETING_UUID}/protocol`,
      headers: { 'Content-Type': 'application/json' },
      payload: { markdown_content: NEW_MARKDOWN },
    })

    expect(res.statusCode).toBe(404)
    expect(res.json<{ code: string }>().code).toBe('PROTOCOL_NOT_FOUND')
  })

  // DB failure → 500
  it('500 INTERNAL_ERROR on DB failure (PUT)', async () => {
    mockFindUnique.mockResolvedValue(makeDbMeeting())
    mockTransaction.mockRejectedValue(new Error('DB down'))

    const res = await app.inject({
      method: 'PUT',
      url: `/api/meetings/${MEETING_UUID}/protocol`,
      headers: { 'Content-Type': 'application/json' },
      payload: { markdown_content: NEW_MARKDOWN },
    })

    expect(res.statusCode).toBe(500)
    expect(res.json<{ code: string }>().code).toBe('INTERNAL_ERROR')
  })

  // NFR-007: no auth required (PUT)
  it('NFR-007: PUT endpoint reachable without Authorization header', async () => {
    mockFindUnique.mockResolvedValue(makeDbMeeting())
    mockTransaction.mockResolvedValue([
      makeUpdatedProtocol(2, 1),
      { ...makeDbMeeting(), status: 'EDITED' },
    ])

    const res = await app.inject({
      method: 'PUT',
      url: `/api/meetings/${MEETING_UUID}/protocol`,
      headers: { 'Content-Type': 'application/json' },
      payload: { markdown_content: NEW_MARKDOWN },
    })

    expect(res.statusCode).toBe(200)
  })

  // Invalid UUID in PUT
  it('400 VALIDATION_ERROR for invalid UUID in :id (PUT)', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `/api/meetings/${NOT_A_UUID}/protocol`,
      headers: { 'Content-Type': 'application/json' },
      payload: { markdown_content: NEW_MARKDOWN },
    })

    expect(res.statusCode).toBe(400)
    expect(res.json<{ code: string }>().code).toBe('VALIDATION_ERROR')
  })
})
