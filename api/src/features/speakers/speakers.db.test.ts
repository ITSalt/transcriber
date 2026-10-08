/**
 * WP-BACKEND-07 — GET/PUT /api/meetings/:id/speakers (FR-004, D-38).
 * Real Prisma on a throw-away database; only the queue and pub/sub are stubbed.
 * Isolation of the routes is ALSO covered by api/test/auth-isolation.db.test.ts.
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
    AUTH_REQUIRED: false as boolean,
    PIN_PEPPER: undefined as string | undefined,
  },
  enqueue: vi.fn(async (_payload: unknown) => undefined),
  publish: vi.fn(async (..._args: unknown[]) => undefined),
}))

vi.mock('../../config.js', () => ({ config: h.config }))
vi.mock('../../queue.js', () => ({ addTranscriptionJob: vi.fn(), enqueueProtocolGenerationJob: h.enqueue }))
vi.mock('../../sse/pubsub.js', () => ({
  publishMeetingEvent: h.publish,
  subscribeMeetingEvents: vi.fn(() => () => undefined),
}))

const LEGACY_WS = '00000000-0000-4000-8000-000000000001'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

const long = 'я'.repeat(300)
const SEGMENTS = [
  { start: 0, end: 10, text: 'Начнём встречу', speaker: 'SPEAKER_0' },
  { start: 10, end: 40, text: long, speaker: 'SPEAKER_1' },
  { start: 40, end: 45, text: 'Да', speaker: 'SPEAKER_2' },
  { start: 45, end: 70, text: 'Вторая реплика первого', speaker: 'SPEAKER_0' },
  { start: 70, end: 71, text: 'Короткая', speaker: 'SPEAKER_0' },
  { start: 71, end: 95, text: 'Третья по длине', speaker: 'SPEAKER_0' },
  { start: 95, end: 100, text: 'Пятая', speaker: 'SPEAKER_0' },
  { start: 100, end: 110, text: 'Ещё одна', speaker: 'SPEAKER_2' },
]

describe.skipIf(!DATABASE_URL)('FR-004 / D-38 — speakers', () => {
  const dbName = `wp_speakers_${process.pid}_${Date.now()}`
  let app: FastifyInstance
  let db: Db
  let projectId = ''
  let partA = ''
  let foreignParticipant = ''

  const call = (method: 'GET' | 'PUT', url: string, payload?: unknown) =>
    app.inject({ method, url, ...(payload !== undefined ? { payload: payload as object } : {}) })

  async function meeting(status: string, opts: { withProject?: boolean; transcript?: boolean } = {}) {
    return (await db.meeting.create({
      data: {
        workspaceId: LEGACY_WS,
        title: 'Встреча',
        status,
        projectId: opts.withProject === false ? null : projectId,
        recording: { create: { storageUri: 's3://b/ws/x/a.mp4', mimeType: 'VIDEO_MP4', sizeBytes: BigInt(10) } },
        ...(opts.transcript === false
          ? {}
          : {
              transcript: {
                create: {
                  segmentsBlob: SEGMENTS,
                  speakerMap: { SPEAKER_0: 'Предзаполнено', SPEAKER_1: null, SPEAKER_2: null },
                  rawText: 'raw',
                },
              },
            }),
      },
    })).id as string
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

    projectId = (await db.project.create({ data: { workspaceId: LEGACY_WS, name: 'Проект' } })).id
    partA = (await db.projectParticipant.create({ data: { projectId, name: 'Анна', role: 'PM', organization: 'ACME' } })).id
    await db.projectParticipant.create({ data: { projectId, name: 'Борис' } })
    const other = await db.project.create({ data: { workspaceId: LEGACY_WS, name: 'Другой проект' } })
    foreignParticipant = (await db.projectParticipant.create({ data: { projectId: other.id, name: 'Чужой' } })).id
  }, 180_000)

  afterAll(async () => {
    await app?.close()
    if (db) await (await import('../../db.js')).closeDb()
    if (DATABASE_URL) await dropDatabases(dbName)
  })

  beforeEach(() => {
    h.enqueue.mockClear()
    h.publish.mockClear()
  })

  it('GET: 3 labels with samples (≤ 200 chars, 3 longest) and 2 project participants', async () => {
    const id = await meeting('AWAITING_SPEAKERS')
    const res = await call('GET', `/api/meetings/${id}/speakers`)
    expect(res.statusCode, res.body).toBe(200)
    const body = res.json()
    expect(body).toMatchObject({ meeting_id: id, status: 'AWAITING_SPEAKERS', project_id: projectId, confirmed_at: null })
    expect(body.participants).toHaveLength(2)
    expect(body.participants.find((p: { id: string }) => p.id === partA)).toMatchObject({ name: 'Анна', role: 'PM', organization: 'ACME' })
    expect(body.labels.map((l: { label: string }) => l.label)).toEqual(['SPEAKER_0', 'SPEAKER_1', 'SPEAKER_2'])

    const [l0, l1, l2] = body.labels
    expect(l0).toMatchObject({ display: 'Speaker 1', duration_sec: 65, segment_count: 5, name: 'Предзаполнено', participant_id: null })
    // the 3 longest of five, in time order: 45–70, 71–95, 0–10
    expect(l0.samples.map((s: { text: string }) => s.text)).toEqual(['Начнём встречу', 'Вторая реплика первого', 'Третья по длине'])
    expect(l0.samples.map((s: { start_ms: number }) => s.start_ms)).toEqual([0, 45000, 71000])
    expect(l1).toMatchObject({ display: 'Speaker 2', segment_count: 1, name: null })
    expect(l1.samples[0].text.length).toBeLessThanOrEqual(200)
    expect(l2).toMatchObject({ display: 'Speaker 3', segment_count: 2 })
  })

  it('GET: without a project → empty participants; before recognition / without transcript → 409', async () => {
    const noProject = await meeting('AWAITING_SPEAKERS', { withProject: false })
    expect((await call('GET', `/api/meetings/${noProject}/speakers`)).json()).toMatchObject({ project_id: null, participants: [] })

    for (const status of ['AWAITING_START', 'TRANSCRIBING']) {
      const id = await meeting(status, { transcript: false })
      const res = await call('GET', `/api/meetings/${id}/speakers`)
      expect(res.statusCode).toBe(409)
      expect(res.json().code).toBe('MEETING_NOT_AWAITING_SPEAKERS')
    }
    expect((await call('GET', `/api/meetings/${await meeting('FAILED', { transcript: false })}/speakers`)).statusCode).toBe(409)
  })

  it('PUT confirm with a merge: speaker_map, status, one generation job, SSE', async () => {
    const id = await meeting('AWAITING_SPEAKERS')
    const res = await call('PUT', `/api/meetings/${id}/speakers`, {
      action: 'confirm',
      mapping: [
        { label: 'SPEAKER_0', participant_id: partA },
        { label: 'SPEAKER_2', participant_id: partA },
        { label: 'SPEAKER_1', name: '  Гость ' },
      ],
    })
    expect(res.statusCode, res.body).toBe(200)
    expect(res.json()).toEqual({ meeting_id: id, status: 'GENERATING_PROTOCOL' })

    const m = await db.meeting.findUnique({ where: { id }, include: { transcript: true, protocolGenJob: true } })
    expect(m.status).toBe('GENERATING_PROTOCOL')
    expect(m.transcript.speakerMap).toEqual({ SPEAKER_0: 'Анна', SPEAKER_1: 'Гость', SPEAKER_2: 'Анна' })
    expect(m.transcript.speakersConfirmedAt).toBeInstanceOf(Date)
    expect(m.transcript.speakerMapping).toEqual({
      action: 'confirm',
      mapping: [
        { label: 'SPEAKER_0', participant_id: partA, name: null },
        { label: 'SPEAKER_2', participant_id: partA, name: null },
        { label: 'SPEAKER_1', participant_id: null, name: 'Гость' },
      ],
    })
    expect(m.protocolGenJob).toMatchObject({ status: 'PENDING' })
    expect(await db.protocolGenerationJob.count({ where: { meetingId: id } })).toBe(1)
    expect(h.enqueue).toHaveBeenCalledTimes(1)
    expect(h.enqueue).toHaveBeenCalledWith({ protocol_generation_job_id: m.protocolGenJob.id })
    expect(h.publish).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ type: 'meeting.status', status: 'GENERATING_PROTOCOL' }), id)

    // the card now shows the confirmation (status GENERATING_PROTOCOL is "later")
    const after = (await call('GET', `/api/meetings/${id}/speakers`)).json()
    expect(after.confirmed_at).not.toBeNull()
    expect(after.labels.map((l: { name: string | null; participant_id: string | null }) => [l.name, l.participant_id])).toEqual([
      ['Анна', partA],
      ['Гость', null],
      ['Анна', partA],
    ])

    // a repeat is a conflict and enqueues nothing
    const again = await call('PUT', `/api/meetings/${id}/speakers`, { action: 'confirm', mapping: [] })
    expect(again.statusCode).toBe(409)
    expect(again.json().code).toBe('MEETING_NOT_AWAITING_SPEAKERS')
    expect(h.enqueue).toHaveBeenCalledTimes(1)
  })

  it('PUT confirm: an empty entry resets to «Speaker N», unlisted labels keep their name', async () => {
    const id = await meeting('AWAITING_SPEAKERS')
    const res = await call('PUT', `/api/meetings/${id}/speakers`, { action: 'confirm', mapping: [{ label: 'SPEAKER_1', name: '' }, { label: 'SPEAKER_2', participant_id: null }] })
    expect(res.statusCode, res.body).toBe(200)
    const t = await db.transcript.findUnique({ where: { meetingId: id } })
    expect(t.speakerMap).toEqual({ SPEAKER_0: 'Предзаполнено', SPEAKER_1: null, SPEAKER_2: null })
  })

  it('PUT skip: names unchanged, no mapping, still starts generation', async () => {
    const id = await meeting('AWAITING_SPEAKERS')
    const res = await call('PUT', `/api/meetings/${id}/speakers`, { action: 'skip', mapping: [{ label: 'SPEAKER_0', name: 'Игнор' }] })
    expect(res.statusCode, res.body).toBe(200)
    const m = await db.meeting.findUnique({ where: { id }, include: { transcript: true } })
    expect(m.status).toBe('GENERATING_PROTOCOL')
    expect(m.transcript.speakerMap).toEqual({ SPEAKER_0: 'Предзаполнено', SPEAKER_1: null, SPEAKER_2: null })
    expect(m.transcript.speakerMapping).toEqual({ action: 'skip', mapping: [] })
    expect(m.transcript.speakersConfirmedAt).toBeInstanceOf(Date)
    expect(h.enqueue).toHaveBeenCalledTimes(1)
  })

  it("PUT: another project's participant → 404 and nothing changes", async () => {
    const id = await meeting('AWAITING_SPEAKERS')
    const res = await call('PUT', `/api/meetings/${id}/speakers`, { action: 'confirm', mapping: [{ label: 'SPEAKER_0', participant_id: foreignParticipant }] })
    expect(res.statusCode).toBe(404)
    expect(res.json().code).toBe('NOT_FOUND')
    const m = await db.meeting.findUnique({ where: { id }, include: { transcript: true, protocolGenJob: true } })
    expect(m.status).toBe('AWAITING_SPEAKERS')
    expect(m.protocolGenJob).toBeNull()
    expect(m.transcript.speakersConfirmedAt).toBeNull()
    expect(h.enqueue).not.toHaveBeenCalled()

    // a meeting without a project cannot name participants at all
    const noProject = await meeting('AWAITING_SPEAKERS', { withProject: false })
    expect((await call('PUT', `/api/meetings/${noProject}/speakers`, { action: 'confirm', mapping: [{ label: 'SPEAKER_0', participant_id: partA }] })).statusCode).toBe(404)
  })

  it('PUT: unknown / duplicate label → 400; bad body → 400', async () => {
    const id = await meeting('AWAITING_SPEAKERS')
    const unknown = await call('PUT', `/api/meetings/${id}/speakers`, { action: 'confirm', mapping: [{ label: 'SPEAKER_9', name: 'X' }] })
    expect(unknown.statusCode).toBe(400)
    expect(unknown.json().code).toBe('UNKNOWN_SPEAKER_LABEL')
    const dup = await call('PUT', `/api/meetings/${id}/speakers`, { action: 'confirm', mapping: [{ label: 'SPEAKER_0', name: 'X' }, { label: 'SPEAKER_0', name: 'Y' }] })
    expect(dup.statusCode).toBe(400)
    expect((await call('PUT', `/api/meetings/${id}/speakers`, { action: 'maybe' })).statusCode).toBe(400)
    expect((await db.meeting.findUnique({ where: { id } })).status).toBe('AWAITING_SPEAKERS')
  })

  it.each(['TRANSCRIBED', 'TRANSCRIBING', 'AWAITING_START', 'GENERATING_PROTOCOL', 'PROTOCOL_READY', 'FAILED'])(
    'PUT in %s → 409 MEETING_NOT_AWAITING_SPEAKERS',
    async (status) => {
      const id = await meeting(status)
      const res = await call('PUT', `/api/meetings/${id}/speakers`, { action: 'skip' })
      expect(res.statusCode).toBe(409)
      expect(res.json().code).toBe('MEETING_NOT_AWAITING_SPEAKERS')
      expect(h.enqueue).not.toHaveBeenCalled()
    },
  )

  it('two concurrent PUTs: exactly one wins, one job', async () => {
    const id = await meeting('AWAITING_SPEAKERS')
    const results = await Promise.all([
      call('PUT', `/api/meetings/${id}/speakers`, { action: 'skip' }),
      call('PUT', `/api/meetings/${id}/speakers`, { action: 'skip' }),
    ])
    expect(results.map((r) => r.statusCode).sort()).toEqual([200, 409])
    expect(await db.protocolGenerationJob.count({ where: { meetingId: id } })).toBe(1)
    expect(h.enqueue).toHaveBeenCalledTimes(1)
  })

  it('uc-004 retry after a failed generation keeps the confirmed map', async () => {
    const id = await meeting('AWAITING_SPEAKERS')
    expect((await call('PUT', `/api/meetings/${id}/speakers`, { action: 'confirm', mapping: [{ label: 'SPEAKER_1', name: 'Гость' }] })).statusCode).toBe(200)
    await db.protocolGenerationJob.update({ where: { meetingId: id }, data: { status: 'FAILED', errorMsg: 'llm' } })
    await db.meeting.update({ where: { id }, data: { status: 'FAILED' } })
    const retry = await app.inject({ method: 'POST', url: `/api/meetings/${id}/retry` })
    expect(retry.statusCode, retry.body).toBe(200)
    expect(retry.json().status).toBe('GENERATING_PROTOCOL')
    expect((await db.transcript.findUnique({ where: { meetingId: id } })).speakerMap.SPEAKER_1).toBe('Гость')
  })

  it('GET/PUT of a missing meeting → 404', async () => {
    const missing = '00000000-0000-4000-8000-0000000000aa'
    expect((await call('GET', `/api/meetings/${missing}/speakers`)).statusCode).toBe(404)
    expect((await call('PUT', `/api/meetings/${missing}/speakers`, { action: 'skip' })).statusCode).toBe(404)
  })
})
