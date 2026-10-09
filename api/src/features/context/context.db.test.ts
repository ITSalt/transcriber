/**
 * WP-API-PROJECTS-01 — projects CRUD, meeting context (draft), start with a frozen snapshot.
 * Real Prisma on a throw-away database; only the queue and pub/sub are stubbed.
 * Isolation of the new routes is ALSO covered by api/test/auth-isolation.db.test.ts (it walks
 * every route Fastify registers); here we check the project/meeting specifics.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { DATABASE_URL, createDatabases, dropDatabases, prismaCli, urlFor } from '../../../test/helpers/db.js'

const h = vi.hoisted(() => ({
  config: {
    NODE_ENV: 'test',
    PORT: 3000,
    HOST: '0.0.0.0',
    LOG_LEVEL: 'silent',
    DATABASE_URL: '',
    REDIS_URL: 'redis://127.0.0.1:6399',
    AUTH_REQUIRED: false as boolean, // legacy principal = workspace «Роман» (D-20)
    PIN_PEPPER: undefined as string | undefined,
  },
  queueAdd: vi.fn(async (_payload: unknown) => undefined),
}))

vi.mock('../../config.js', () => ({ config: h.config }))
vi.mock('../../queue.js', () => ({ addTranscriptionJob: h.queueAdd, enqueueProtocolGenerationJob: vi.fn() }))
vi.mock('../../sse/pubsub.js', () => ({
  publishMeetingEvent: vi.fn(async () => undefined),
  subscribeMeetingEvents: vi.fn(() => () => undefined),
}))

const LEGACY_WS = '00000000-0000-4000-8000-000000000001'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

describe.skipIf(!DATABASE_URL)('FR-004 — projects, context, start', () => {
  const dbName = `wp_projects_${process.pid}_${Date.now()}`
  let app: FastifyInstance
  let db: Db
  let foreignWs = ''
  let foreignProject = ''
  let foreignMeeting = ''

  const call = (method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', url: string, payload?: unknown) =>
    app.inject({ method, url, ...(payload !== undefined ? { payload: payload as object } : {}) })

  async function makeProject(name = 'Проект') {
    const res = await call('POST', '/api/projects', { workspace_id: LEGACY_WS, name })
    expect(res.statusCode, res.body).toBe(201)
    return res.json().project.id as string
  }

  async function awaitingMeeting() {
    return db.meeting.create({
      data: {
        workspaceId: LEGACY_WS,
        title: 'Встреча',
        status: 'AWAITING_START',
        recording: { create: { storageUri: 's3://b/ws/x/a.mp4', mimeType: 'VIDEO_MP4', sizeBytes: BigInt(10) } },
        transcriptionJob: { create: {} },
      },
    }) as Promise<{ id: string }>
  }

  beforeAll(async () => {
    await createDatabases(dbName)
    const deploy = prismaCli(['migrate', 'deploy'], dbName)
    expect(deploy.status, deploy.out).toBe(0)
    process.env['DATABASE_URL'] = urlFor(dbName)
    h.config.DATABASE_URL = urlFor(dbName)
    db = (await import('../../db.js')).prisma
    const { buildApp } = await import('../../server.js')
    app = await buildApp({ logLevel: 'silent' })
    await app.ready()

    const ws = await db.workspace.create({ data: { name: 'Чужое', personal: false } })
    foreignWs = ws.id
    foreignProject = (await db.project.create({ data: { workspaceId: foreignWs, name: 'Чужой' } })).id
    foreignMeeting = (
      await db.meeting.create({
        data: {
          workspaceId: foreignWs,
          title: 'Чужая',
          status: 'AWAITING_START',
          recording: { create: { storageUri: 's3://b/ws/y/a.mp4', mimeType: 'VIDEO_MP4', sizeBytes: BigInt(10) } },
          transcriptionJob: { create: {} },
        },
      })
    ).id
  }, 180_000)

  afterAll(async () => {
    await app?.close()
    // close the pg pool too: DROP DATABASE … WITH (FORCE) would kill its idle connections
    if (db) await (await import('../../db.js')).closeDb()
    if (DATABASE_URL) await dropDatabases(dbName)
  })

  beforeEach(() => h.queueAdd.mockClear())

  // ── projects ───────────────────────────────────────────────────────────────
  it('CRUD of a project with participants and glossary', async () => {
    const id = await makeProject('Альфа')
    expect((await call('GET', `/api/projects?workspace_id=${LEGACY_WS}`)).json().items.map((p: { id: string }) => p.id)).toContain(id)

    const pr = await call('POST', `/api/projects/${id}/participants`, { name: 'Иван', aliases: ['Ваня'], side: 'CLIENT' })
    expect(pr.statusCode).toBe(201)
    expect(pr.json()).toMatchObject({ name: 'Иван', aliases: ['Ваня'], role: null, side: 'CLIENT' })
    const pid = pr.json().id
    const upd = await call('PATCH', `/api/projects/${id}/participants/${pid}`, { role: 'CTO' })
    expect(upd.json()).toMatchObject({ role: 'CTO', side: 'CLIENT', aliases: ['Ваня'] }) // omitted fields untouched

    const tr = await call('POST', `/api/projects/${id}/glossary`, { term: 'ТЗ', asr_keyterm: true })
    expect(tr.statusCode).toBe(201)
    expect(tr.json()).toMatchObject({ term: 'ТЗ', variants: [], definition: null, asr_keyterm: true })
    const tid = tr.json().id
    expect((await call('PATCH', `/api/projects/${id}/glossary/${tid}`, { definition: 'техзадание' })).json()).toMatchObject({
      definition: 'техзадание',
      asr_keyterm: true,
    })

    const patched = await call('PATCH', `/api/projects/${id}`, { name: 'Бета', description: 'описание' })
    expect(patched.json().project).toMatchObject({ name: 'Бета', description: 'описание' })
    const det = (await call('GET', `/api/projects/${id}`)).json()
    expect(det.participants).toHaveLength(1)
    expect(det.glossary).toHaveLength(1)

    expect((await call('DELETE', `/api/projects/${id}/participants/${pid}`)).statusCode).toBe(204)
    expect((await call('DELETE', `/api/projects/${id}/participants/${pid}`)).statusCode).toBe(404)
    expect((await call('DELETE', `/api/projects/${id}/glossary/${tid}`)).statusCode).toBe(204)
    expect((await call('PATCH', `/api/projects/${id}`, {})).statusCode).toBe(400)
    expect((await call('DELETE', `/api/projects/${id}`)).statusCode).toBe(204)
    expect((await call('GET', `/api/projects/${id}`)).statusCode).toBe(404)
  })

  it('deleting a project keeps its meetings (projectId → NULL)', async () => {
    const id = await makeProject()
    const m = await awaitingMeeting()
    await db.meeting.update({ where: { id: m.id }, data: { projectId: id } })
    expect((await call('DELETE', `/api/projects/${id}`)).statusCode).toBe(204)
    expect((await db.meeting.findUnique({ where: { id: m.id } })).projectId).toBeNull()
  })

  it("someone else's workspace, project and children answer 404", async () => {
    expect((await call('GET', `/api/projects?workspace_id=${foreignWs}`)).statusCode).toBe(404)
    expect((await call('POST', '/api/projects', { workspace_id: foreignWs, name: 'x' })).statusCode).toBe(404)
    for (const [method, url, body] of [
      ['GET', `/api/projects/${foreignProject}`, undefined],
      ['PATCH', `/api/projects/${foreignProject}`, { name: 'x' }],
      ['DELETE', `/api/projects/${foreignProject}`, undefined],
      ['POST', `/api/projects/${foreignProject}/participants`, { name: 'x' }],
      ['POST', `/api/projects/${foreignProject}/glossary`, { term: 'x' }],
      ['GET', `/api/projects/${foreignProject}/last-protocol`, undefined],
    ] as const) {
      expect((await call(method, url, body)).statusCode, `${method} ${url}`).toBe(404)
    }
    // a child id of ANOTHER project of my own workspace is not reachable through mine
    const mine = await makeProject()
    const other = await makeProject()
    const p = (await call('POST', `/api/projects/${other}/participants`, { name: 'Z' })).json().id
    expect((await call('PATCH', `/api/projects/${mine}/participants/${p}`, { name: 'Q' })).statusCode).toBe(404)
    expect((await call('DELETE', `/api/projects/${mine}/participants/${p}`)).statusCode).toBe(404)
  })

  it('last-protocol: 422 without a protocol, then the newest protocol text', async () => {
    const id = await makeProject()
    const none = await call('GET', `/api/projects/${id}/last-protocol`)
    expect(none.statusCode).toBe(422)
    expect(none.json().code).toBe('PREVIOUS_PROTOCOL_UNAVAILABLE')

    const m = await db.meeting.create({
      data: {
        workspaceId: LEGACY_WS,
        projectId: id,
        title: 'Прошлая',
        status: 'PROTOCOL_READY',
        protocol: { create: { markdownContent: '# Протокол v1' } },
      },
    })
    const ok = await call('GET', `/api/projects/${id}/last-protocol`)
    expect(ok.statusCode).toBe(200)
    expect(ok.json()).toMatchObject({ meeting_id: m.id, meeting_title: 'Прошлая', markdown: '# Протокол v1', version_n: 1 })
  })

  // ── context ────────────────────────────────────────────────────────────────
  it('context is a draft only in AWAITING_START; GET 404 before the first PUT', async () => {
    const m = await awaitingMeeting()
    expect((await call('GET', `/api/meetings/${m.id}/context`)).statusCode).toBe(404)
    const put = await call('PUT', `/api/meetings/${m.id}/context`, {
      meeting_type: 'STATUS',
      goal: 'Синк',
      participants: [{ name: 'Гость' }],
      glossary: [{ term: 'SLA' }],
    })
    expect(put.statusCode, put.body).toBe(200)
    expect(put.json()).toMatchObject({ meeting_type: 'STATUS', goal: 'Синк', frozen: false, snapshot_hash: null })
    expect((await call('GET', `/api/meetings/${m.id}/context`)).json().participants[0]).toMatchObject({ name: 'Гость', source: 'meeting' })

    await db.meeting.update({ where: { id: m.id }, data: { status: 'TRANSCRIBING' } })
    const frozen = await call('PUT', `/api/meetings/${m.id}/context`, { goal: 'поздно' })
    expect(frozen.statusCode).toBe(409)
    expect(frozen.json().code).toBe('CONTEXT_FROZEN')
  })

  it('rejects a previous protocol of 50 001 characters, accepts 50 000 (D-25)', async () => {
    const m = await awaitingMeeting()
    const put = (n: number) =>
      call('PUT', `/api/meetings/${m.id}/context`, { previous_protocol: { source: 'upload', text: 'x'.repeat(n) } })
    const tooLong = await put(50_001)
    expect(tooLong.statusCode).toBe(400)
    expect(tooLong.json().code).toBe('VALIDATION_ERROR')
    expect((await put(50_000)).statusCode).toBe(200)
  })

  it("a foreign project cannot be attached to my meeting; foreign meeting → 404", async () => {
    const m = await awaitingMeeting()
    expect((await call('PUT', `/api/meetings/${m.id}/context`, { project_id: foreignProject })).statusCode).toBe(404)
    expect((await call('PUT', `/api/meetings/${foreignMeeting}/context`, {})).statusCode).toBe(404)
    expect((await call('GET', `/api/meetings/${foreignMeeting}/context`)).statusCode).toBe(404)
    expect((await call('POST', `/api/meetings/${foreignMeeting}/start`)).statusCode).toBe(404)
    expect(h.queueAdd).not.toHaveBeenCalled()
  })

  // ── start ──────────────────────────────────────────────────────────────────
  it('start freezes project card + additions, enqueues the existing job, repeat → 409, snapshot immune to project edits', async () => {
    const pid = await makeProject()
    const part = (await call('POST', `/api/projects/${pid}/participants`, { name: 'Из проекта', side: 'OURS' })).json().id
    await call('POST', `/api/projects/${pid}/glossary`, { term: 'Термин проекта', asr_keyterm: true })
    const m = await awaitingMeeting()
    const job = await db.transcriptionJob.findUnique({ where: { meetingId: m.id } })
    await call('PUT', `/api/meetings/${m.id}/context`, {
      project_id: pid,
      goal: 'Цель',
      participants: [{ name: 'Добавлен' }],
      glossary: [{ term: 'Свой' }],
      previous_protocol: { source: 'upload', text: 'предыдущий текст' },
    })

    const start = await call('POST', `/api/meetings/${m.id}/start`)
    expect(start.statusCode, start.body).toBe(200)
    expect(start.json()).toMatchObject({ meeting_id: m.id, status: 'TRANSCRIBING' })
    const hash = start.json().snapshot_hash as string
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
    expect(h.queueAdd).toHaveBeenCalledTimes(1)
    expect(h.queueAdd).toHaveBeenCalledWith({ transcription_job_id: job.id })
    expect(await db.transcriptionJob.count({ where: { meetingId: m.id } })).toBe(1) // no second job
    const row = await db.meeting.findUnique({ where: { id: m.id } })
    expect(row).toMatchObject({ status: 'TRANSCRIBING', projectId: pid })

    const ctx = (await call('GET', `/api/meetings/${m.id}/context`)).json()
    expect(ctx).toMatchObject({ frozen: true, snapshot_hash: hash, project_id: pid, goal: 'Цель' })
    expect(ctx.participants.map((p: { name: string; source: string }) => [p.name, p.source])).toEqual([
      ['Из проекта', 'project'],
      ['Добавлен', 'meeting'],
    ])
    expect(ctx.participants[0].participant_id).toBe(part)
    expect(ctx.glossary.map((t: { term: string; source: string }) => [t.term, t.source])).toEqual([
      ['Термин проекта', 'project'],
      ['Свой', 'meeting'],
    ])
    expect(ctx.previous_protocol).toEqual({ source: 'upload', text: 'предыдущий текст' })

    // repeat: 409, nothing enqueued again
    const again = await call('POST', `/api/meetings/${m.id}/start`)
    expect(again.statusCode).toBe(409)
    expect(again.json().code).toBe('MEETING_NOT_AWAITING_START')
    expect(h.queueAdd).toHaveBeenCalledTimes(1)

    // later edits of the project do not touch the snapshot
    await call('PATCH', `/api/projects/${pid}/participants/${part}`, { name: 'Переименован' })
    await call('POST', `/api/projects/${pid}/glossary`, { term: 'Новый' })
    const after = (await call('GET', `/api/meetings/${m.id}/context`)).json()
    expect(after.snapshot_hash).toBe(hash)
    expect(after.participants[0].name).toBe('Из проекта')
    expect(after.glossary).toHaveLength(2)
  })

  it('two parallel starts: one winner, one job enqueued', async () => {
    const m = await awaitingMeeting()
    const [a, b] = await Promise.all([call('POST', `/api/meetings/${m.id}/start`), call('POST', `/api/meetings/${m.id}/start`)])
    expect([a.statusCode, b.statusCode].sort()).toEqual([200, 409])
    expect(h.queueAdd).toHaveBeenCalledTimes(1)
  })

  it('start without any context is valid (empty snapshot)', async () => {
    const m = await awaitingMeeting()
    const start = await call('POST', `/api/meetings/${m.id}/start`)
    expect(start.statusCode).toBe(200)
    const job = await db.transcriptionJob.findUnique({ where: { meetingId: m.id } })
    expect(h.queueAdd).toHaveBeenCalledWith({ transcription_job_id: job.id })
  })

  it("previous protocol 'project': text resolved at start; none → 422 and the meeting stays AWAITING_START", async () => {
    const pid = await makeProject()
    const m = await awaitingMeeting()
    await call('PUT', `/api/meetings/${m.id}/context`, { project_id: pid, previous_protocol: { source: 'project' } })

    const fail = await call('POST', `/api/meetings/${m.id}/start`)
    expect(fail.statusCode).toBe(422)
    expect(fail.json().code).toBe('PREVIOUS_PROTOCOL_UNAVAILABLE')
    expect((await db.meeting.findUnique({ where: { id: m.id } })).status).toBe('AWAITING_START')
    expect(h.queueAdd).not.toHaveBeenCalled()

    const prev = await db.meeting.create({
      data: { workspaceId: LEGACY_WS, projectId: pid, title: 'Прошлая', status: 'PROTOCOL_READY', protocol: { create: { markdownContent: '# Прошлый' } } },
    })
    const ok = await call('POST', `/api/meetings/${m.id}/start`)
    expect(ok.statusCode, ok.body).toBe(200)
    const ctx = (await call('GET', `/api/meetings/${m.id}/context`)).json()
    expect(ctx.previous_protocol).toEqual({ source: 'project', meeting_id: prev.id, text: '# Прошлый' })
  })

  it("previous protocol 'project' longer than 50 000 → 422 TOO_LONG, rolled back; exactly 50 000 is accepted (D-25)", async () => {
    const pid = await makeProject()
    const m = await awaitingMeeting()
    await call('PUT', `/api/meetings/${m.id}/context`, { project_id: pid, previous_protocol: { source: 'project' } })
    const prev = await db.meeting.create({
      data: { workspaceId: LEGACY_WS, projectId: pid, title: 'Длинная', status: 'PROTOCOL_READY', protocol: { create: { markdownContent: 'x'.repeat(50_001) } } },
    })

    const fail = await call('POST', `/api/meetings/${m.id}/start`)
    expect(fail.statusCode, fail.body).toBe(422)
    expect(fail.json().code).toBe('PREVIOUS_PROTOCOL_TOO_LONG')
    expect((await db.meeting.findUnique({ where: { id: m.id } })).status).toBe('AWAITING_START')
    expect(h.queueAdd).not.toHaveBeenCalled()

    await db.protocol.update({ where: { meetingId: prev.id }, data: { markdownContent: 'x'.repeat(50_000) } })
    const ok = await call('POST', `/api/meetings/${m.id}/start`)
    expect(ok.statusCode, ok.body).toBe(200)
    expect(h.queueAdd).toHaveBeenCalledTimes(1)
  })

  it('start from a meeting not in AWAITING_START → 409', async () => {
    const m = await awaitingMeeting()
    await db.meeting.update({ where: { id: m.id }, data: { status: 'TRANSCRIBING' } })
    const res = await call('POST', `/api/meetings/${m.id}/start`)
    expect(res.statusCode).toBe(409)
    expect(res.json().code).toBe('MEETING_NOT_AWAITING_START')
    expect(h.queueAdd).not.toHaveBeenCalled()
  })
})
