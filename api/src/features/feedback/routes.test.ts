/**
 * WP-API-FEEDBACK-01 — protocol versions + feedback routes (FR-005).
 * Fastify inject(), Prisma and S3 mocked in memory. Covers: the three feedback kinds,
 * rejection by size / type / signature, binding to the current version, the broken-docx
 * path, file download, and workspace isolation (foreign meeting → the same 404 as a
 * nonexistent one, for every new route).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { FEEDBACK_FILE_MAX_BYTES, SESSION_COOKIE_NAME } from '@transcrib/shared'
import { buildApp } from '../../server.js'
import { reviewDocx } from './docx.fixture.js'

vi.mock('../../plugins/sse.js', () => ({ ssePlugin: async () => {} }))

vi.mock('../../config.js', () => ({
  config: { PORT: 3000, HOST: '0.0.0.0', DATABASE_URL: 'postgresql://t:t@localhost:5432/t', REDIS_URL: 'redis://localhost:6379', LOG_LEVEL: 'silent', NODE_ENV: 'test' },
}))

const WS_A = '00000000-0000-4000-8000-00000000aaaa'
const WS_B = '00000000-0000-4000-8000-00000000bbbb'
const USER = { id: '00000000-0000-4000-8000-0000000000a1', name: 'Анна' }
const MEETING_A = '123e4567-e89b-42d3-a456-426614174001'
const MEETING_B = '123e4567-e89b-42d3-a456-426614174002' // another workspace
const MISSING = '123e4567-e89b-42d3-a456-426614174099'
const MEETING_LEGACY = '123e4567-e89b-42d3-a456-426614174003' // workspace «Роман» (D-20 principal)

const db = vi.hoisted(() => ({
  versions: [] as Array<Record<string, any>>,
  feedback: [] as Array<Record<string, any>>,
  objects: new Map<string, { body: Buffer; contentType: string }>(),
  failCreate: false,
}))

vi.mock('../../storage/s3-adapter.js', () => ({
  s3ConfigFromEnv: () => ({}),
  S3StorageProvider: class {
    async putObject(key: string, body: Uint8Array, contentType: string) {
      db.objects.set(key, { body: Buffer.from(body as Uint8Array), contentType })
    }
    async getObjectStream(key: string) {
      const o = db.objects.get(key)
      if (!o) {
        const { StorageNotFoundError } = await import('@transcrib/shared')
        throw new StorageNotFoundError(key)
      }
      return (async function* () { yield o.body })()
    }
    async deleteObject(key: string) { db.objects.delete(key) }
    keyToStorageUri(key: string) { return `s3://bucket/${key}` }
    storageUriToKey(uri: string) { return uri.replace('s3://bucket/', '') }
  },
}))

vi.mock('../../db.js', () => {
  const meetings: Record<string, string> = {
    '123e4567-e89b-42d3-a456-426614174001': '00000000-0000-4000-8000-00000000aaaa',
    '123e4567-e89b-42d3-a456-426614174002': '00000000-0000-4000-8000-00000000bbbb',
    '123e4567-e89b-42d3-a456-426614174003': '00000000-0000-4000-8000-000000000001',
  }
  const withAuthor = (v: any) => ({ ...v, author: v.authorUserId ? { id: v.authorUserId, name: 'Анна' } : null })
  return {
    prisma: {
      authSession: {
        findUnique: async () => ({
          id: 's1', userId: '00000000-0000-4000-8000-0000000000a1', lastSeenAt: new Date(), expiresAt: new Date(Date.now() + 1e9),
          user: { name: 'Анна', memberships: [{ workspaceId: '00000000-0000-4000-8000-00000000aaaa' }] },
        }),
        updateMany: async () => ({ count: 1 }),
      },
      meeting: {
        findFirst: async ({ where }: any) => {
          const ws = meetings[where.id]
          return ws && where.workspaceId.in.includes(ws) ? { id: where.id, workspaceId: ws, projectId: null } : null
        },
      },
      protocolVersion: {
        findMany: async ({ where }: any) => db.versions.filter((v) => v.meetingId === where.meetingId).sort((a, b) => a.n - b.n).map(withAuthor),
        findFirst: async ({ where, orderBy }: any) => {
          const list = db.versions.filter((v) => v.meetingId === where.meetingId && (where.n === undefined || v.n === where.n))
          list.sort((a, b) => (orderBy?.n === 'desc' ? b.n - a.n : a.n - b.n))
          return list[0] ? withAuthor(list[0]) : null
        },
      },
      protocolFeedback: {
        create: async ({ data }: any) => {
          if (db.failCreate) throw new Error('db down')
          const row = { ...data, createdAt: new Date('2026-05-02T09:00:00Z'), user: { id: data.userId, name: 'Анна' } }
          db.feedback.push(row)
          return row
        },
        findMany: async ({ where }: any) =>
          db.feedback.filter((f) => f.meetingId === where.meetingId && f.workspaceId === where.workspaceId).reverse(),
        findFirst: async ({ where }: any) =>
          db.feedback.find((f) => f.id === where.id && f.meetingId === where.meetingId && f.workspaceId === where.workspaceId) ?? null,
      },
    },
  }
})

// ─── helpers ──────────────────────────────────────────────────────────────────

const COOKIE = `${SESSION_COOKIE_NAME}=test-token`
const BOUNDARY = '----wpfeedbacktest'

interface Part { name: string; value?: string; file?: { name: string; type: string; data: Buffer } }

function multipartBody(parts: Part[]): Buffer {
  const chunks: Buffer[] = []
  for (const p of parts) {
    chunks.push(Buffer.from(`--${BOUNDARY}\r\n`))
    if (p.file) {
      chunks.push(Buffer.from(`Content-Disposition: form-data; name="${p.name}"; filename="${p.file.name}"\r\nContent-Type: ${p.file.type}\r\n\r\n`), p.file.data, Buffer.from('\r\n'))
    } else {
      chunks.push(Buffer.from(`Content-Disposition: form-data; name="${p.name}"\r\n\r\n${p.value ?? ''}\r\n`))
    }
  }
  chunks.push(Buffer.from(`--${BOUNDARY}--\r\n`))
  return Buffer.concat(chunks)
}

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

describe('WP-API-FEEDBACK-01 — versions and feedback', () => {
  let app: FastifyInstance

  const post = (meetingId: string, parts: Part[], cookie: string | null = COOKIE) =>
    app.inject({
      method: 'POST',
      url: `/api/meetings/${meetingId}/feedback`,
      headers: { 'content-type': `multipart/form-data; boundary=${BOUNDARY}`, ...(cookie ? { cookie } : {}) },
      payload: multipartBody(parts),
    })
  const get = (url: string) => app.inject({ method: 'GET', url, headers: { cookie: COOKIE } })

  beforeEach(async () => {
    db.versions = [
      { id: 'v1', meetingId: MEETING_A, n: 1, kind: 'GENERATED', markdown: '# v1', authorUserId: null, generationId: null, createdAt: new Date('2026-05-01T08:00:00Z') },
      { id: 'v2', meetingId: MEETING_A, n: 2, kind: 'USER_EDIT', markdown: '# v2', authorUserId: USER.id, generationId: null, createdAt: new Date('2026-05-01T09:00:00Z') },
      { id: 'v4', meetingId: MEETING_LEGACY, n: 1, kind: 'GENERATED', markdown: '# legacy', authorUserId: null, generationId: null, createdAt: new Date('2026-05-01T08:00:00Z') },
      { id: 'v3', meetingId: MEETING_B, n: 1, kind: 'GENERATED', markdown: '# secret', authorUserId: null, generationId: null, createdAt: new Date('2026-05-01T08:00:00Z') },
    ]
    db.feedback = []
    db.objects.clear()
    db.failCreate = false
    app = await buildApp({ logLevel: 'silent' })
    await app.ready()
  })
  afterEach(async () => { await app.close() })

  // ── versions ────────────────────────────────────────────────────────────────

  it('lists versions ascending with the current n', async () => {
    const res = await get(`/api/meetings/${MEETING_A}/protocol/versions`)
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.current_n).toBe(2)
    expect(body.items.map((i: any) => [i.n, i.kind])).toEqual([[1, 'GENERATED'], [2, 'USER_EDIT']])
    expect(body.items[0].author).toBeNull()
    expect(body.items[1].author).toEqual({ id: USER.id, name: 'Анна' })
  })

  it('returns the text of one version; unknown or malformed n → 404 PROTOCOL_VERSION_NOT_FOUND', async () => {
    const ok = await get(`/api/meetings/${MEETING_A}/protocol/versions/1`)
    expect(ok.statusCode).toBe(200)
    expect(ok.json()).toMatchObject({ n: 1, kind: 'GENERATED', markdown: '# v1' })
    for (const n of ['3', '0', '-1', 'abc', '99999999999']) {
      const res = await get(`/api/meetings/${MEETING_A}/protocol/versions/${n}`)
      expect(res.statusCode).toBe(404)
      expect(res.json().code).toBe('PROTOCOL_VERSION_NOT_FOUND')
    }
  })

  // ── intake of the three kinds ───────────────────────────────────────────────

  it('COMMENT: text + category, bound to the current version, no file', async () => {
    const res = await post(MEETING_A, [{ name: 'kind', value: 'COMMENT' }, { name: 'category', value: 'SPEAKER_ATTRIBUTION' }, { name: 'text', value: 'Спикер перепутан' }])
    expect(res.statusCode).toBe(201)
    const body = res.json()
    expect(body).toMatchObject({ meeting_id: MEETING_A, protocol_version_n: 2, kind: 'COMMENT', category: 'SPEAKER_ATTRIBUTION', text: 'Спикер перепутан', file: null, extracted: null, extracted_counts: null, author: { name: 'Анна' } })
    expect(db.objects.size).toBe(0)
  })

  it('COMMENT: text is required, a file is refused', async () => {
    const noText = await post(MEETING_A, [{ name: 'kind', value: 'COMMENT' }, { name: 'text', value: '   ' }])
    expect(noText.statusCode).toBe(400)
    expect(noText.json().code).toBe('FEEDBACK_TEXT_REQUIRED')
    const withFile = await post(MEETING_A, [{ name: 'kind', value: 'COMMENT' }, { name: 'text', value: 'x' }, { name: 'file', file: { name: 'a.md', type: 'text/markdown', data: Buffer.from('# a') } }])
    expect(withFile.statusCode).toBe(415)
    expect(db.feedback).toHaveLength(0)
  })

  it('CORRECTED_PROTOCOL as text', async () => {
    const res = await post(MEETING_A, [{ name: 'kind', value: 'CORRECTED_PROTOCOL' }, { name: 'text', value: '# Исправленный' }])
    expect(res.statusCode).toBe(201)
    expect(res.json()).toMatchObject({ kind: 'CORRECTED_PROTOCOL', text: '# Исправленный', file: null, protocol_version_n: 2 })
  })

  it('CORRECTED_PROTOCOL as .md is stored in S3 under ws/<workspace>/feedback/<id>/<name> with plain_text', async () => {
    const res = await post(MEETING_A, [{ name: 'kind', value: 'CORRECTED_PROTOCOL' }, { name: 'file', file: { name: 'протокол.md', type: 'text/markdown; charset=utf-8', data: Buffer.from('﻿# Итоги\nтекст') } }])
    expect(res.statusCode).toBe(201)
    const body = res.json()
    expect(body.extracted).toMatchObject({ plain_text: '# Итоги\nтекст', error: null })
    expect(body.file).toMatchObject({ name: 'протокол.md', mime: 'text/markdown', size_bytes: Buffer.byteLength('﻿# Итоги\nтекст') })
    expect(body.file.download_path).toBe(`/api/meetings/${MEETING_A}/feedback/${body.id}/file`)
    expect([...db.objects.keys()]).toEqual([`ws/${WS_A}/feedback/${body.id}/протокол.md`])
    expect(db.feedback[0].fileUri).toBe(`s3://bucket/ws/${WS_A}/feedback/${body.id}/протокол.md`)
  })

  it('CORRECTED_PROTOCOL as .docx → flat text', async () => {
    const res = await post(MEETING_A, [{ name: 'kind', value: 'CORRECTED_PROTOCOL' }, { name: 'file', file: { name: 'p.docx', type: DOCX, data: await reviewDocx() } }])
    expect(res.statusCode).toBe(201)
    expect(res.json().extracted).toMatchObject({ plain_text: 'Итоги: запускаем в июне\nИван подготовит бюджет', comments: [], error: null })
  })

  it('DOCX_REVIEW: comments, revisions and texts extracted; counts in the item', async () => {
    const res = await post(MEETING_A, [{ name: 'kind', value: 'DOCX_REVIEW' }, { name: 'file', file: { name: 'review.docx', type: DOCX, data: await reviewDocx() } }])
    expect(res.statusCode).toBe(201)
    const body = res.json()
    expect(body.extracted.comments.map((c: any) => c.anchored_text)).toEqual(['запускаем в июне', 'Иван подготовит бюджет'])
    expect(body.extracted.revisions.map((r: any) => r.type)).toEqual(['ins', 'del'])
    expect(body.extracted_counts).toEqual({ comments: 2, revisions: 2, error: false })
    expect(db.objects.size).toBe(1)
  })

  it('a broken .docx (valid signature, damaged zip) is still stored; extracted.error is set', async () => {
    const res = await post(MEETING_A, [{ name: 'kind', value: 'DOCX_REVIEW' }, { name: 'file', file: { name: 'broken.docx', type: DOCX, data: Buffer.from('PK\u0003\u0004 definitely not a zip') } }])
    expect(res.statusCode).toBe(201)
    const body = res.json()
    expect(body.extracted.error).toEqual(expect.any(String))
    expect(body.extracted_counts).toEqual({ comments: 0, revisions: 0, error: true })
    expect(db.objects.size).toBe(1)
    expect(db.feedback).toHaveLength(1)
  })

  // ── rejections ──────────────────────────────────────────────────────────────

  it('DOCX_REVIEW without a file → 400 FEEDBACK_FILE_REQUIRED', async () => {
    const res = await post(MEETING_A, [{ name: 'kind', value: 'DOCX_REVIEW' }, { name: 'text', value: 'x' }])
    expect(res.statusCode).toBe(400)
    expect(res.json().code).toBe('FEEDBACK_FILE_REQUIRED')
  })

  it('refuses by type: extension, mime, and a non-zip .docx', async () => {
    const cases: Array<[string, string, Buffer]> = [
      ['r.pdf', 'application/pdf', Buffer.from('%PDF')],
      ['r.doc', DOCX, Buffer.from('PK\u0003\u0004x')],
      ['r.docx', 'image/png', Buffer.from('PK\u0003\u0004x')],
      ['r.docx', DOCX, Buffer.from('just text pretending to be word')],
    ]
    for (const [name, type, data] of cases) {
      const res = await post(MEETING_A, [{ name: 'kind', value: 'DOCX_REVIEW' }, { name: 'file', file: { name, type, data } }])
      expect(res.statusCode, `${name} ${type}`).toBe(415)
      expect(res.json().code).toBe('FEEDBACK_FILE_TYPE')
    }
    expect(db.feedback).toHaveLength(0)
    expect(db.objects.size).toBe(0)
  })

  it('refuses a file over 20 MB → 413 FEEDBACK_FILE_TOO_LARGE, nothing stored', async () => {
    const big = Buffer.concat([Buffer.from('PK\u0003\u0004'), Buffer.alloc(FEEDBACK_FILE_MAX_BYTES)])
    const res = await post(MEETING_A, [{ name: 'kind', value: 'DOCX_REVIEW' }, { name: 'file', file: { name: 'big.docx', type: DOCX, data: big } }])
    expect(res.statusCode).toBe(413)
    expect(res.json().code).toBe('FEEDBACK_FILE_TOO_LARGE')
    expect(db.feedback).toHaveLength(0)
    expect(db.objects.size).toBe(0)
  })

  it('invalid kind / category → 400 VALIDATION_ERROR; not multipart → 400', async () => {
    const badKind = await post(MEETING_A, [{ name: 'kind', value: 'RATING' }, { name: 'text', value: 'x' }])
    expect(badKind.statusCode).toBe(400)
    expect(badKind.json().code).toBe('VALIDATION_ERROR')
    const badCategory = await post(MEETING_A, [{ name: 'kind', value: 'COMMENT' }, { name: 'category', value: 'TYPO' }, { name: 'text', value: 'x' }])
    expect(badCategory.statusCode).toBe(400)
    const json = await app.inject({ method: 'POST', url: `/api/meetings/${MEETING_A}/feedback`, headers: { cookie: COOKIE }, payload: { kind: 'COMMENT', text: 'x' } })
    expect(json.statusCode).toBe(400)
  })

  it('a meeting without any protocol version cannot take feedback', async () => {
    db.versions = db.versions.filter((v) => v.meetingId !== MEETING_A)
    const res = await post(MEETING_A, [{ name: 'kind', value: 'COMMENT' }, { name: 'text', value: 'x' }])
    expect(res.statusCode).toBe(404)
    expect(res.json().code).toBe('PROTOCOL_VERSION_NOT_FOUND')
  })

  it('the legacy principal (no session) cannot submit feedback → 401', async () => {
    const res = await post(MEETING_LEGACY, [{ name: 'kind', value: 'COMMENT' }, { name: 'text', value: 'x' }], null)
    expect(res.statusCode).toBe(401)
    expect(res.json().code).toBe('UNAUTHENTICATED')
  })

  it('removes the stored file when the row cannot be written', async () => {
    db.failCreate = true
    const res = await post(MEETING_A, [{ name: 'kind', value: 'CORRECTED_PROTOCOL' }, { name: 'file', file: { name: 'p.txt', type: 'text/plain', data: Buffer.from('x') } }])
    expect(res.statusCode).toBe(500)
    expect(db.objects.size).toBe(0)
  })

  it('sanitises the file name used in the object key', async () => {
    const res = await post(MEETING_A, [{ name: 'kind', value: 'CORRECTED_PROTOCOL' }, { name: 'file', file: { name: '..\\..\\etc/pa ss;wd.txt', type: 'text/plain', data: Buffer.from('x') } }])
    expect(res.statusCode).toBe(201)
    const [key] = [...db.objects.keys()]
    expect(key).toMatch(new RegExp(`^ws/${WS_A}/feedback/[0-9a-f-]{36}/[^/]+$`))
    expect(key).not.toContain('..')
  })

  // ── list + download ─────────────────────────────────────────────────────────

  it('lists feedback newest first and downloads the file as an attachment', async () => {
    await post(MEETING_A, [{ name: 'kind', value: 'COMMENT' }, { name: 'text', value: 'первый' }])
    const created = await post(MEETING_A, [{ name: 'kind', value: 'CORRECTED_PROTOCOL' }, { name: 'file', file: { name: 'поправки.txt', type: 'text/plain', data: Buffer.from('новый текст') } }])
    const list = await get(`/api/meetings/${MEETING_A}/feedback`)
    expect(list.statusCode).toBe(200)
    expect(list.json().items.map((i: any) => i.kind)).toEqual(['CORRECTED_PROTOCOL', 'COMMENT'])

    const file = await get(created.json().file.download_path)
    expect(file.statusCode).toBe(200)
    expect(file.body).toBe('новый текст')
    expect(file.headers['content-type']).toContain('text/plain')
    expect(file.headers['content-disposition']).toMatch(/^attachment; filename=".*"; filename\*=UTF-8''/)
    expect(file.headers['x-content-type-options']).toBe('nosniff')
  })

  it('download: feedback without a file, an unknown id, a lost object → 404 NOT_FOUND', async () => {
    const noFile = await post(MEETING_A, [{ name: 'kind', value: 'COMMENT' }, { name: 'text', value: 'x' }])
    const lost = await post(MEETING_A, [{ name: 'kind', value: 'CORRECTED_PROTOCOL' }, { name: 'file', file: { name: 'a.txt', type: 'text/plain', data: Buffer.from('x') } }])
    db.objects.clear()
    for (const id of [noFile.json().id, MISSING, lost.json().id]) {
      const res = await get(`/api/meetings/${MEETING_A}/feedback/${id}/file`)
      expect(res.statusCode).toBe(404)
      expect(res.json().code).toBe('NOT_FOUND')
    }
  })

  // ── isolation (FR-003 / RQ-044) ─────────────────────────────────────────────

  it('a foreign meeting answers exactly like a nonexistent one on every new route', async () => {
    const routes: Array<[string, string]> = [
      ['GET', 'protocol/versions'],
      ['GET', 'protocol/versions/1'],
      ['GET', 'feedback'],
      ['GET', `feedback/${MISSING}/file`],
      ['POST', 'feedback'],
    ]
    for (const [method, tail] of routes) {
      const hit = async (meetingId: string) =>
        app.inject({
          method: method as 'GET' | 'POST',
          url: `/api/meetings/${meetingId}/${tail}`,
          headers: method === 'POST' ? { 'content-type': `multipart/form-data; boundary=${BOUNDARY}`, cookie: COOKIE } : { cookie: COOKIE },
          ...(method === 'POST' ? { payload: multipartBody([{ name: 'kind', value: 'COMMENT' }, { name: 'text', value: 'x' }]) } : {}),
        })
      const foreign = await hit(MEETING_B)
      const missing = await hit(MISSING)
      expect(foreign.statusCode, `${method} ${tail}`).toBe(404)
      expect(foreign.json()).toEqual(missing.json())
      expect(foreign.json().code).toBe('NOT_FOUND')
    }
    expect(db.feedback).toHaveLength(0)
  })

  it("feedback of another workspace's meeting is never listed or downloadable via an own meeting", async () => {
    db.feedback.push({ id: '123e4567-e89b-42d3-a456-4266141740ff', meetingId: MEETING_B, workspaceId: WS_B, userId: USER.id, protocolVersionN: 1, kind: 'COMMENT', category: null, text: 'чужое', fileUri: `s3://bucket/ws/${WS_B}/feedback/x/a.txt`, fileName: 'a.txt', mime: 'text/plain', sizeBytes: 1n, extracted: null, createdAt: new Date() })
    db.objects.set(`ws/${WS_B}/feedback/x/a.txt`, { body: Buffer.from('x'), contentType: 'text/plain' })
    const list = await get(`/api/meetings/${MEETING_A}/feedback`)
    expect(list.json().items).toEqual([])
    const file = await get(`/api/meetings/${MEETING_A}/feedback/123e4567-e89b-42d3-a456-4266141740ff/file`)
    expect(file.statusCode).toBe(404)
  })
})
