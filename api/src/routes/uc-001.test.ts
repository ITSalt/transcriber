/**
 * UC-001-BE — View meeting catalog: integration tests
 *
 * Uses Fastify inject() — no live server or DB required.
 * Prisma is mocked; each test controls the mock return value.
 *
 * Test coverage (per test-spec.md):
 *   T01 — RQ-001: results sorted by updated_at DESC
 *   T02 — RQ-002: transient-status meetings appear in the list
 *   T03 — RQ-003/NFR-007: no auth required; all meetings returned (MVP scope = all)
 *   T04 — NFR-007: endpoint reachable without authentication header
 *   T05 — empty list returns {items: []}
 *   T06 — DB failure maps to 500 INTERNAL_ERROR
 *   T07 — duration_sec is null when Recording is absent
 *   T08 — duration_sec is truncated from Float to Int
 */
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../server.js'

// ─── Infrastructure stubs ────────────────────────────────────────────────────

// Stub TUS plugin (avoids S3 env requirement)
vi.mock('../plugins/tus.js', () => ({
  tusPlugin: async () => { /* no-op */ },
}))

// Stub SSE redis (avoids REDIS_URL requirement at register time)
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

// vi.hoisted ensures the mock function is created before the vi.mock() factory
// runs (vi.mock calls are hoisted to the top of the file by Vitest).
const { mockFindMany } = vi.hoisted(() => ({
  mockFindMany: vi.fn(),
}))

vi.mock('../db.js', () => ({
  prisma: {
    meeting: {
      findMany: mockFindMany,
    },
    $queryRaw: vi.fn().mockResolvedValue([{ '?column?': 1 }]),
  },
}))

// ─── Valid RFC 4122 UUIDs for use in tests ───────────────────────────────────
// Zod v4 enforces strict RFC 4122 format (version nibble [1-8], variant [89abAB])

const UUID_A = '123e4567-e89b-12d3-a456-426614174000'
const UUID_B = '123e4567-e89b-12d3-a456-426614174001'
const UUID_C = '123e4567-e89b-12d3-a456-426614174002'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeDbMeeting(overrides: Partial<{
  id: string
  title: string
  status: string
  language: string
  createdAt: Date
  updatedAt: Date
  recording: { durationSec: number | null; storageUri: string } | null
}> = {}) {
  const now = new Date('2024-01-15T10:00:00.000Z')
  return {
    id: UUID_A,
    title: 'Meeting A',
    status: 'CREATED',
    language: 'RU',
    createdAt: now,
    updatedAt: now,
    recording: null,
    ...overrides,
  }
}

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('UC-001-BE — GET /api/meetings', () => {
  let app: FastifyInstance

  beforeEach(async () => {
    mockFindMany.mockReset()
    app = await buildApp({ logLevel: 'silent' })
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
  })

  // ─── T05: empty list ────────────────────────────────────────────────────────

  it('T05 — returns {items: []} when no meetings exist', async () => {
    mockFindMany.mockResolvedValue([])

    const res = await app.inject({ method: 'GET', url: '/api/meetings' })

    expect(res.statusCode).toBe(200)
    const body = res.json<{ items: unknown[] }>()
    expect(body.items).toEqual([])
  })

  // ─── T01: RQ-001 sort order ─────────────────────────────────────────────────

  it('T01 — RQ-001: Prisma is queried with orderBy updatedAt desc', async () => {
    mockFindMany.mockResolvedValue([])

    await app.inject({ method: 'GET', url: '/api/meetings' })

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { updatedAt: 'desc' },
      }),
    )
  })

  it('T01b — RQ-001: items in response preserve DB sort order (newest first)', async () => {
    const older = makeDbMeeting({
      id: UUID_A,
      title: 'Older',
      updatedAt: new Date('2024-01-10T10:00:00.000Z'),
    })
    const newer = makeDbMeeting({
      id: UUID_B,
      title: 'Newer',
      updatedAt: new Date('2024-01-15T10:00:00.000Z'),
    })
    // DB returns newest first (Prisma orderBy is enforced by the service)
    mockFindMany.mockResolvedValue([newer, older])

    const res = await app.inject({ method: 'GET', url: '/api/meetings' })

    expect(res.statusCode).toBe(200)
    const body = res.json<{ items: Array<{ id: string }> }>()
    expect(body.items[0]!.id).toBe(UUID_B)
    expect(body.items[1]!.id).toBe(UUID_A)
  })

  // ─── T02: RQ-002 transient statuses appear in list ──────────────────────────

  it('T02 — RQ-002: meetings with transient statuses appear in the list', async () => {
    const statuses = ['UPLOADING', 'TRANSCRIBING', 'GENERATING_PROTOCOL'] as const
    const uuids = [UUID_A, UUID_B, UUID_C]
    const dbRows = statuses.map((status, i) =>
      makeDbMeeting({ id: uuids[i]!, status }),
    )
    mockFindMany.mockResolvedValue(dbRows)

    const res = await app.inject({ method: 'GET', url: '/api/meetings' })

    expect(res.statusCode).toBe(200)
    const body = res.json<{ items: Array<{ status: string }> }>()
    expect(body.items).toHaveLength(3)
    const returnedStatuses = body.items.map((i) => i.status)
    expect(returnedStatuses).toContain('UPLOADING')
    expect(returnedStatuses).toContain('TRANSCRIBING')
    expect(returnedStatuses).toContain('GENERATING_PROTOCOL')
  })

  // ─── T03/T04: NFR-007 no auth required ─────────────────────────────────────

  it('T04 — NFR-007: endpoint returns 200 with no Authorization header (no auth at MVP)', async () => {
    mockFindMany.mockResolvedValue([])

    const res = await app.inject({
      method: 'GET',
      url: '/api/meetings',
      // Deliberately no Authorization header
    })

    expect(res.statusCode).toBe(200)
  })

  it('T03 — RQ-003/NFR-007: returns all meetings without ownership filtering at MVP', async () => {
    const rows = [
      makeDbMeeting({ id: UUID_A, title: 'A' }),
      makeDbMeeting({ id: UUID_B, title: 'B' }),
    ]
    mockFindMany.mockResolvedValue(rows)

    const res = await app.inject({ method: 'GET', url: '/api/meetings' })

    expect(res.statusCode).toBe(200)
    const body = res.json<{ items: unknown[] }>()
    // MVP: no filter applied; all rows returned
    expect(body.items).toHaveLength(2)
    // No 'where' clause with author filter should have been sent to Prisma
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.not.objectContaining({ where: expect.anything() }),
    )
  })

  // ─── T06: DB failure → 500 INTERNAL_ERROR ──────────────────────────────────

  it('T06 — DB failure maps to 500 INTERNAL_ERROR', async () => {
    mockFindMany.mockRejectedValue(new Error('Connection refused'))

    const res = await app.inject({ method: 'GET', url: '/api/meetings' })

    expect(res.statusCode).toBe(500)
    const body = res.json<{ code: string }>()
    expect(body.code).toBe('INTERNAL_ERROR')
  })

  // ─── T07: duration_sec null when no recording ───────────────────────────────

  it('T07 — duration_sec is null when meeting has no recording', async () => {
    mockFindMany.mockResolvedValue([
      makeDbMeeting({ recording: null }),
    ])

    const res = await app.inject({ method: 'GET', url: '/api/meetings' })

    expect(res.statusCode).toBe(200)
    const body = res.json<{ items: Array<{ duration_sec: number | null }> }>()
    expect(body.items[0]!.duration_sec).toBeNull()
  })

  // ─── T08: duration_sec truncated from Float ─────────────────────────────────

  it('T08 — duration_sec is truncated from Float to Int', async () => {
    mockFindMany.mockResolvedValue([
      makeDbMeeting({
        recording: { durationSec: 123.9, storageUri: 's3://bucket/vid.mp4' },
      }),
    ])

    const res = await app.inject({ method: 'GET', url: '/api/meetings' })

    expect(res.statusCode).toBe(200)
    const body = res.json<{ items: Array<{ duration_sec: number }> }>()
    expect(body.items[0]!.duration_sec).toBe(123)
  })

  // ─── Response shape: MeetingListItem fields ──────────────────────────────────

  it('returns correct MeetingListItem shape for a meeting with recording', async () => {
    const createdAt = new Date('2024-01-10T08:00:00.000Z')
    const updatedAt = new Date('2024-01-10T09:00:00.000Z')
    mockFindMany.mockResolvedValue([
      makeDbMeeting({
        id: UUID_A,
        title: 'My Meeting',
        status: 'UPLOADED',
        language: 'EN',
        createdAt,
        updatedAt,
        recording: { durationSec: 600.0, storageUri: 's3://bucket/my-meeting.mp4' },
      }),
    ])

    const res = await app.inject({ method: 'GET', url: '/api/meetings' })

    expect(res.statusCode).toBe(200)
    const body = res.json<{ items: unknown[] }>()
    expect(body.items[0]).toMatchObject({
      id: UUID_A,
      title: 'My Meeting',
      filename: 'my-meeting.mp4',
      status: 'UPLOADED',
      language: 'EN',
      uploaded_at: '2024-01-10T08:00:00.000Z',
      updated_at: '2024-01-10T09:00:00.000Z',
      duration_sec: 600,
    })
  })
})
