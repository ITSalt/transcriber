/**
 * UC-302-BE — Export protocol to PDF: integration tests
 *
 * Uses Fastify inject() — no live server, DB, or Puppeteer required.
 * Prisma and renderPdf are mocked; each test controls the mock return value.
 *
 * Test coverage:
 *   T01 — RQ-032: happy path — 200, Content-Type application/pdf, first 4 bytes "%PDF"
 *   T02 — RQ-032: Content-Disposition attachment header with sanitized filename
 *   T03 — RQ-032: transient — renderPdf called each time; no persist side-effects
 *   T04 — 404 PROTOCOL_NOT_FOUND when meeting does not exist
 *   T05 — 404 PROTOCOL_NOT_FOUND when meeting has no protocol row
 *   T06 — 409 STATUS_NOT_READY when Meeting.status not in {PROTOCOL_READY, EDITED}
 *   T07 — 500 PDF_RENDER_FAILED when renderPdf throws (RQ-033)
 *   T08 — 400 VALIDATION_ERROR for invalid UUID in :id
 *   T09 — NFR-007: endpoint reachable without Authorization header
 *   T10 — Status-driven gating: PROTOCOL_READY and EDITED are accepted (200)
 *   T11 — Status-driven gating: non-protocol statuses rejected with 409
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

// ─── renderPdf mock ───────────────────────────────────────────────────────────

const { mockRenderPdf } = vi.hoisted(() => ({
  mockRenderPdf: vi.fn(),
}))

vi.mock('../lib/pdf.js', () => ({
  renderPdf: mockRenderPdf,
}))

// ─── Prisma mock ──────────────────────────────────────────────────────────────

const { mockFindUnique } = vi.hoisted(() => ({
  mockFindUnique: vi.fn(),
}))

vi.mock('../db.js', () => ({
  prisma: {
    meeting: {
      findMany: vi.fn(),
      findUnique: mockFindUnique,
      update: vi.fn(),
      delete: vi.fn(),
      create: vi.fn(),
    },
    protocol: {
      update: vi.fn(),
    },
    $transaction: vi.fn(),
    $queryRaw: vi.fn().mockResolvedValue([{ '?column?': 1 }]),
  },
}))

// ─── Constants ────────────────────────────────────────────────────────────────

const MEETING_UUID = '123e4567-e89b-12d3-a456-426614174000'
const PROTOCOL_UUID = '123e4567-e89b-12d3-a456-426614174002'
const NOT_A_UUID = 'not-a-uuid'

// PDF magic bytes — all real PDFs start with "%PDF-"
const PDF_MAGIC = Buffer.from('%PDF-1.4 fake pdf content for testing')

const GENERATED_AT = new Date('2024-03-01T10:00:00.000Z')

function makeDbProtocol(overrides: Record<string, unknown> = {}) {
  return {
    id: PROTOCOL_UUID,
    meetingId: MEETING_UUID,
    markdownContent: '# Protocol\n\n## Participants\n- Alice',
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

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('UC-302-BE — GET /api/meetings/:id/protocol/pdf', () => {
  let app: FastifyInstance

  beforeEach(async () => {
    mockFindUnique.mockReset()
    mockRenderPdf.mockReset()
    app = await buildApp({ logLevel: 'silent' })
    await app.ready()
  })

  afterEach(async () => {
    await app.close()
  })

  // T01 — happy path: 200, correct Content-Type, first 4 bytes "%PDF"
  it('T01 — RQ-032: 200 with Content-Type application/pdf and %PDF magic bytes', async () => {
    mockFindUnique.mockResolvedValue(makeDbMeeting())
    mockRenderPdf.mockResolvedValue(PDF_MAGIC)

    const res = await app.inject({
      method: 'GET',
      url: `/api/meetings/${MEETING_UUID}/protocol/pdf`,
    })

    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toMatch(/application\/pdf/)
    // RQ-032: verify first 4 bytes are "%PDF"
    const body = res.rawPayload
    expect(body.slice(0, 4).toString('ascii')).toBe('%PDF')
  })

  // T02 — Content-Disposition: attachment; filename="<sanitized-title>-protocol-v<version>.pdf"
  it('T02 — RQ-032: Content-Disposition attachment with sanitized filename', async () => {
    mockFindUnique.mockResolvedValue(makeDbMeeting({ title: 'Sprint Review' }))
    mockRenderPdf.mockResolvedValue(PDF_MAGIC)

    const res = await app.inject({
      method: 'GET',
      url: `/api/meetings/${MEETING_UUID}/protocol/pdf`,
    })

    expect(res.statusCode).toBe(200)
    const disposition = res.headers['content-disposition'] as string
    expect(disposition).toMatch(/attachment/)
    expect(disposition).toMatch(/filename=/)
    expect(disposition).toMatch(/\.pdf/)
    // version 1 → v1
    expect(disposition).toMatch(/v1/)
  })

  // T02b — filename with special characters gets sanitized
  it('T02b — special characters in title are sanitized in filename', async () => {
    mockFindUnique.mockResolvedValue(makeDbMeeting({ title: 'Q1 Review: Goals & Plans!' }))
    mockRenderPdf.mockResolvedValue(PDF_MAGIC)

    const res = await app.inject({
      method: 'GET',
      url: `/api/meetings/${MEETING_UUID}/protocol/pdf`,
    })

    expect(res.statusCode).toBe(200)
    const disposition = res.headers['content-disposition'] as string
    // Must not contain raw special chars in filename
    expect(disposition).not.toMatch(/[&!:?]/)
    expect(disposition).toMatch(/\.pdf/)
  })

  // T03 — RQ-032: transient — renderPdf is called each time (no caching/persisting)
  it('T03 — RQ-032: renderPdf is called on each request (transient, never persisted)', async () => {
    mockFindUnique.mockResolvedValue(makeDbMeeting())
    mockRenderPdf.mockResolvedValue(PDF_MAGIC)

    await app.inject({ method: 'GET', url: `/api/meetings/${MEETING_UUID}/protocol/pdf` })
    await app.inject({ method: 'GET', url: `/api/meetings/${MEETING_UUID}/protocol/pdf` })

    // RQ-032: must re-render from canonical Markdown on every call (BRQ-018)
    expect(mockRenderPdf).toHaveBeenCalledTimes(2)
  })

  // T04 — 404 PROTOCOL_NOT_FOUND when meeting does not exist
  it('T04 — 404 PROTOCOL_NOT_FOUND when meeting does not exist', async () => {
    mockFindUnique.mockResolvedValue(null)

    const res = await app.inject({
      method: 'GET',
      url: `/api/meetings/${MEETING_UUID}/protocol/pdf`,
    })

    expect(res.statusCode).toBe(404)
    expect(res.json<{ code: string }>().code).toBe('PROTOCOL_NOT_FOUND')
  })

  // T05 — 404 PROTOCOL_NOT_FOUND when meeting has no protocol row
  it('T05 — 404 PROTOCOL_NOT_FOUND when meeting has no protocol row', async () => {
    mockFindUnique.mockResolvedValue(makeDbMeeting({ protocol: null }))

    const res = await app.inject({
      method: 'GET',
      url: `/api/meetings/${MEETING_UUID}/protocol/pdf`,
    })

    expect(res.statusCode).toBe(404)
    expect(res.json<{ code: string }>().code).toBe('PROTOCOL_NOT_FOUND')
  })

  // T06 — 409 STATUS_NOT_READY when Meeting.status not in {PROTOCOL_READY, EDITED}
  it('T06 — 409 STATUS_NOT_READY when Meeting.status is TRANSCRIBED', async () => {
    mockFindUnique.mockResolvedValue(makeDbMeeting({ status: 'TRANSCRIBED' }))

    const res = await app.inject({
      method: 'GET',
      url: `/api/meetings/${MEETING_UUID}/protocol/pdf`,
    })

    expect(res.statusCode).toBe(409)
    expect(res.json<{ code: string }>().code).toBe('STATUS_NOT_READY')
  })

  // T07 — 500 PDF_RENDER_FAILED when renderPdf throws (RQ-033)
  it('T07 — RQ-033: 500 PDF_RENDER_FAILED when renderPdf throws', async () => {
    mockFindUnique.mockResolvedValue(makeDbMeeting())
    mockRenderPdf.mockRejectedValue(new Error('Chromium crash'))

    const res = await app.inject({
      method: 'GET',
      url: `/api/meetings/${MEETING_UUID}/protocol/pdf`,
    })

    expect(res.statusCode).toBe(500)
    expect(res.json<{ code: string }>().code).toBe('PDF_RENDER_FAILED')
  })

  // T08 — 400 VALIDATION_ERROR for invalid UUID in :id
  it('T08 — 400 VALIDATION_ERROR for invalid UUID in :id', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/meetings/${NOT_A_UUID}/protocol/pdf`,
    })

    expect(res.statusCode).toBe(400)
    expect(res.json<{ code: string }>().code).toBe('VALIDATION_ERROR')
  })

  // T09 — NFR-007: endpoint reachable without Authorization header
  it('T09 — NFR-007: endpoint reachable without Authorization header', async () => {
    mockFindUnique.mockResolvedValue(makeDbMeeting())
    mockRenderPdf.mockResolvedValue(PDF_MAGIC)

    const res = await app.inject({
      method: 'GET',
      url: `/api/meetings/${MEETING_UUID}/protocol/pdf`,
    })

    expect(res.statusCode).toBe(200)
  })

  // T10 — Status-driven gating: PROTOCOL_READY and EDITED are accepted
  it.each(['PROTOCOL_READY', 'EDITED'])(
    'T10 — status %s is accepted (200)',
    async (status) => {
      mockFindUnique.mockResolvedValue(makeDbMeeting({ status }))
      mockRenderPdf.mockResolvedValue(PDF_MAGIC)

      const res = await app.inject({
        method: 'GET',
        url: `/api/meetings/${MEETING_UUID}/protocol/pdf`,
      })

      expect(res.statusCode).toBe(200)
    },
  )

  // T11 — Status-driven gating: non-protocol statuses rejected with 409
  it.each(['CREATED', 'UPLOADING', 'UPLOADED', 'TRANSCRIBING', 'TRANSCRIBED', 'GENERATING_PROTOCOL'])(
    'T11 — status %s is rejected with 409 STATUS_NOT_READY',
    async (status) => {
      mockFindUnique.mockResolvedValue(makeDbMeeting({ status }))

      const res = await app.inject({
        method: 'GET',
        url: `/api/meetings/${MEETING_UUID}/protocol/pdf`,
      })

      expect(res.statusCode).toBe(409)
      expect(res.json<{ code: string }>().code).toBe('STATUS_NOT_READY')
    },
  )
})
