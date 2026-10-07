/**
 * WP-BACKEND-01 — login by PIN, workspace isolation of EVERY /api route, core hooks.
 * AC-1 (isolation over the route list taken from Fastify itself — routes of feature folders
 * merged later are covered automatically), AC-2 (login/lockout/CLI), AC-3 (hooks),
 * AC-4 (user:create --workspace Роман sees the old meetings), D-20 (AUTH_REQUIRED=false).
 *
 * Real Prisma on a throw-away database (helpers/db.ts) — the shared CI database is wiped by
 * prisma.smoke.test.ts in parallel. Only external systems are stubbed: S3, BullMQ, Redis
 * pub/sub, ffprobe.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import type * as FastifyModule from 'fastify'
import type { FastifyInstance, InjectOptions } from 'fastify'
import { DATABASE_URL, createDatabases, dropDatabases, prismaCli, urlFor } from './helpers/db.js'

const h = vi.hoisted(() => ({
  config: {
    NODE_ENV: 'test',
    PORT: 3000,
    HOST: '0.0.0.0',
    LOG_LEVEL: 'silent',
    DATABASE_URL: '',
    REDIS_URL: 'redis://127.0.0.1:6399',
    AUTH_REQUIRED: true as boolean,
    PIN_PEPPER: 'pepper-for-tests-0123456789' as string | undefined,
  },
  routes: [] as Array<{ method: string; url: string }>,
  queueAdd: vi.fn(async () => undefined),
}))

vi.mock('../src/config.js', () => ({ config: h.config }))
// every route Fastify registers, from its own onRoute hook
vi.mock('fastify', async (importOriginal) => {
  const real = await importOriginal<typeof FastifyModule>()
  const wrapped = ((opts?: Parameters<typeof real.default>[0]) => {
    const app = real.default(opts)
    app.addHook('onRoute', (r) => {
      for (const m of [r.method].flat()) h.routes.push({ method: String(m), url: r.url })
    })
    return app
  }) as unknown as typeof real.default
  return { ...real, default: wrapped }
})
vi.mock('../src/queue.js', () => ({ addTranscriptionJob: h.queueAdd, enqueueProtocolGenerationJob: h.queueAdd }))
vi.mock('../src/sse/pubsub.js', () => ({
  publishMeetingEvent: vi.fn(async () => undefined),
  subscribeMeetingEvents: vi.fn(() => () => undefined),
}))
vi.mock('../src/storage/s3-adapter.js', () => ({
  s3ConfigFromEnv: vi.fn(() => ({ bucket: 'test-bucket' })),
  S3StorageProvider: vi.fn().mockImplementation(() => ({
    createMultipartUpload: vi.fn(async () => 'upload-id'),
    presignUploadPart: vi.fn(async () => 'https://s3.test/presigned'),
    completeMultipartUpload: vi.fn(async () => undefined),
    abortMultipartUpload: vi.fn(async () => undefined),
    getPresignedDownloadUrl: vi.fn(async () => 'https://s3.test/get'),
    storageUriToKey: (u: string) => u.replace(/^s3:\/\/[^/]+\//, ''),
    deleteObject: vi.fn(async () => undefined),
  })),
}))
vi.mock('fluent-ffmpeg', () => ({
  default: { ffprobe: (_p: string, cb: (e: Error | null, d?: unknown) => void) => cb(null, { format: { duration: 60 } }) },
}))

const LEGACY_WS = '00000000-0000-4000-8000-000000000001'
const BLOCK_TEXT = 'Больше нельзя, пиши Максу для разблокировки'
const PIN = { a: '111111', b: '222222', roman: '333333' }
const PUBLIC = new Set(['GET /api/health', 'POST /api/auth/login', 'POST /api/auth/logout'])

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

describe.skipIf(!DATABASE_URL)('FR-003 — login, isolation of every /api route, core hooks', () => {
  const dbName = `wp01_auth_${process.pid}_${Date.now()}`
  let app: FastifyInstance
  let db: Db
  let runCli: (argv: string[], deps: { db: Db; pepper: string | undefined; out: (l: string) => void }) => Promise<void>
  const ids = { wsA: '', wsB: '', meetingA: '', projectA: '', meetingL: '', userA: '' }
  let ipSeq = 0
  const nextIp = () => `10.77.${process.pid % 250}.${++ipSeq}`

  const cli = (argv: string[]) => runCli(argv, { db, pepper: h.config.PIN_PEPPER, out: () => {} })

  async function login(pin: string, ip = nextIp()) {
    return app.inject({ method: 'POST', url: '/api/auth/login', payload: { pin }, headers: { 'x-forwarded-for': ip } })
  }
  async function cookieOf(pin: string): Promise<string> {
    const res = await login(pin)
    expect(res.statusCode, res.body).toBe(200)
    const c = res.cookies.find((x) => x.name === 'transcrib_session')!
    return `transcrib_session=${c.value}`
  }

  beforeAll(async () => {
    await createDatabases(dbName)
    const deploy = prismaCli(['migrate', 'deploy'], dbName)
    expect(deploy.status, deploy.out).toBe(0)
    process.env['DATABASE_URL'] = urlFor(dbName) // db.ts reads it at import
    h.config.DATABASE_URL = urlFor(dbName)
    db = (await import('../src/db.js')).prisma
    runCli = (await import('../src/features/auth/cli.js')).runCli
    const { buildApp } = await import('../src/server.js')
    app = await buildApp({ logLevel: 'silent' })
    await app.ready()

    await cli(['create', '--name', 'Alice', '--pin', PIN.a]) // personal workspace «Alice»
    await cli(['create', '--name', 'Bob', '--pin', PIN.b])
    const a = await db.user.findFirst({ where: { name: 'Alice' }, include: { memberships: true } })
    const b = await db.user.findFirst({ where: { name: 'Bob' }, include: { memberships: true } })
    ids.userA = a.id
    ids.wsA = a.memberships[0].workspaceId
    ids.wsB = b.memberships[0].workspaceId
    const project = await db.project.create({ data: { workspaceId: ids.wsA, name: 'P-A' } })
    ids.projectA = project.id
    const m = await db.meeting.create({
      data: {
        workspaceId: ids.wsA,
        projectId: project.id,
        title: 'A secret meeting',
        status: 'PROTOCOL_READY',
        language: 'RU',
        recording: { create: { storageUri: `s3://test-bucket/ws/${ids.wsA}/a.mp4`, mimeType: 'VIDEO_MP4', sizeBytes: BigInt(10) } },
        transcriptionJob: { create: { status: 'DONE' } },
        transcript: { create: { rawText: 'hello', segmentsBlob: [] } },
        protocolGenJob: { create: { status: 'DONE' } },
        protocol: { create: { markdownContent: '# generated A' } },
      },
    })
    ids.meetingA = m.id
    const l = await db.meeting.create({
      data: {
        workspaceId: LEGACY_WS,
        title: 'old meeting of Роман',
        status: 'TRANSCRIBING',
        recording: { create: { storageUri: 's3://test-bucket/pending/old.mp4', mimeType: 'VIDEO_MP4', sizeBytes: BigInt(10) } },
      },
    })
    ids.meetingL = l.id
  }, 180_000)

  afterAll(async () => {
    await app?.close()
    await db?.$disconnect()
    if (DATABASE_URL) await dropDatabases(dbName)
  })

  // ── AC-2: login ─────────────────────────────────────────────────────────────
  describe('AC-2 login by PIN', () => {
    it('correct PIN → 200 + httpOnly/Secure/SameSite=Lax cookie for 30 days, then /me', async () => {
      const res = await login(PIN.a)
      expect(res.statusCode).toBe(200)
      expect(res.json()).toMatchObject({ user: { id: ids.userA, name: 'Alice' }, workspaces: [{ id: ids.wsA, personal: true }] })
      const c = res.cookies.find((x) => x.name === 'transcrib_session')!
      expect(c).toMatchObject({ httpOnly: true, secure: true, sameSite: 'Lax', path: '/', maxAge: 30 * 24 * 3600 })
      const me = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie: `transcrib_session=${c.value}` } })
      expect(me.statusCode).toBe(200)
      expect(me.json().user.name).toBe('Alice')
    })

    it('wrong PIN → 401 «Неверный PIN»; not 6 digits → 400 PIN_FORMAT', async () => {
      const wrong = await login('999999')
      expect(wrong.statusCode).toBe(401)
      expect(wrong.json()).toMatchObject({ code: 'INVALID_PIN', message: 'Неверный PIN' })
      for (const pin of ['12345', '1234567', 'abcdef', 123456]) {
        const bad = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { pin } })
        expect(bad.statusCode).toBe(400)
        expect(bad.json().code).toBe('PIN_FORMAT')
      }
    })

    it('10th failure from one client → 423 with the exact text; then even the right PIN → 423 until user:unblock', async () => {
      const ip = nextIp()
      for (let i = 1; i <= 9; i++) expect((await login('999998', ip)).statusCode).toBe(401)
      const tenth = await login('999998', ip)
      expect(tenth.statusCode).toBe(423)
      expect(tenth.json()).toMatchObject({ code: 'LOGIN_BLOCKED', message: BLOCK_TEXT })
      const right = await login(PIN.a, ip)
      expect(right.statusCode).toBe(423)
      expect(right.json().message).toBe(BLOCK_TEXT)
      // another client is not affected; a forged earlier X-Forwarded-For entry changes nothing
      expect((await login(PIN.a, nextIp())).statusCode).toBe(200)
      expect((await login(PIN.a, `1.2.3.4, ${ip}`)).statusCode).toBe(423)
      await cli(['unblock', '--client', ip])
      expect((await login(PIN.a, ip)).statusCode).toBe(200)
    })

    it('B1: a burst of parallel attempts cannot test more PINs than the allowance', async () => {
      const ip = nextIp()
      const burst = await Promise.all(Array.from({ length: 30 }, (_, i) => login(String(500000 + i), ip)))
      const tested = burst.filter((r) => r.statusCode === 401).length
      const refused = burst.filter((r) => r.statusCode === 423).length
      expect(tested).toBeLessThanOrEqual(9)
      expect(tested + refused).toBe(30)
      expect((await login(PIN.a, ip)).statusCode).toBe(423)
      await cli(['unblock', '--client', ip])
    })

    it('M2: failures are cumulative — a successful login does not wipe them', async () => {
      const ip = nextIp()
      for (let i = 0; i < 9; i++) expect((await login('999997', ip)).statusCode).toBe(401)
      expect((await login(PIN.a, ip)).statusCode).toBe(200)
      expect((await login('999997', ip)).statusCode).toBe(423) // the 10th failure, not the 1st
      await cli(['unblock', '--client', ip])
    })

    it('two users cannot share a PIN; no PIN is stored in clear', async () => {
      await expect(cli(['create', '--name', 'Copycat', '--pin', PIN.a])).rejects.toThrow(/already taken/)
      const rows = await db.$queryRawUnsafe(`SELECT row_to_json(u)::text AS j FROM users u`)
      for (const r of rows as Array<{ j: string }>) {
        for (const pin of Object.values(PIN)) expect(r.j).not.toContain(pin)
      }
    })

    it('logout → 204, the cookie no longer opens anything', async () => {
      const cookie = await cookieOf(PIN.b)
      const out = await app.inject({ method: 'POST', url: '/api/auth/logout', headers: { cookie } })
      expect(out.statusCode).toBe(204)
      expect((await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } })).statusCode).toBe(401)
    })
  })

  // ── AC-1: every route ───────────────────────────────────────────────────────
  describe('AC-1 isolation over every registered /api route', () => {
    const apiRoutes = () => {
      const seen = new Set<string>()
      return h.routes
        .filter((r) => r.url.startsWith('/api/') && r.method !== 'HEAD' && r.method !== 'OPTIONS')
        .filter((r) => {
          const k = `${r.method} ${r.url}`
          return seen.has(k) ? false : (seen.add(k), true)
        })
    }
    // Every path parameter must be one the isolation rules know; a new name fails the test,
    // so the package that adds it has to decide (and document) how it is isolated.
    const KNOWN_PARAMS: Record<string, () => string> = {
      id: () => ids.meetingA,
      projectId: () => ids.projectA,
      workspaceId: () => ids.wsA,
      // children of an already-checked meeting/project, or graph ids (task events): any value
      n: () => '1',
      feedbackId: () => '00000000-0000-4000-8000-00000000abcd',
      participantId: () => '00000000-0000-4000-8000-00000000abcd',
      termId: () => '00000000-0000-4000-8000-00000000abcd',
      eventId: () => '00000000-0000-4000-8000-00000000abcd',
      code: () => 'T-1',
    }
    const fill = (url: string) =>
      url.replace(/:([A-Za-z]+)/g, (_m, name: string) => {
        const value = KNOWN_PARAMS[name]
        if (!value) throw new Error(`route ${url}: unknown path parameter :${name} — add it to the isolation test`)
        return value()
      })
    // A route that wrongly lets the request through may never answer (an SSE stream stays
    // open): fail fast instead of hanging the suite.
    const req = (method: string, url: string, cookie?: string, extra: Partial<InjectOptions> = {}) =>
      Promise.race([
        app.inject({
          method: method as InjectOptions['method'],
          url,
          headers: cookie ? { cookie } : {},
          ...(method === 'GET' || method === 'DELETE' ? {} : { payload: { workspace_id: ids.wsA } }),
          ...extra,
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`${method} ${url}: no response within 10 s (access check missing?)`)), 10_000),
        ),
      ])

    it('the route list really comes from Fastify (core + feature routes)', () => {
      const keys = apiRoutes().map((r) => `${r.method} ${r.url}`)
      expect(keys).toEqual(expect.arrayContaining([
        'GET /api/meetings', 'GET /api/meetings/:id', 'GET /api/meetings/:id/events',
        'GET /api/meetings/:id/protocol/pdf', 'GET /api/meetings/:id/transcript/download',
        'POST /api/uploads/init', 'POST /api/auth/login', 'GET /api/auth/me',
      ]))
    })

    it('a percent-encoded path cannot slip past the gate (/%61pi/… routes to /api/…)', async () => {
      for (const url of ['/%61pi/meetings', `/%61pi/meetings/${ids.meetingA}`, '/api/%6deetings', '/%61pi/auth/me']) {
        const res = await app.inject({ method: 'GET', url })
        expect([401, 404], `${url} → ${res.statusCode}`).toContain(res.statusCode)
        if (res.statusCode === 404) expect(res.json().code).not.toBe('MEETING_NOT_FOUND')
      }
      const cookieB = await cookieOf(PIN.b)
      const viaEncoded = await app.inject({ method: 'GET', url: `/%61pi/meetings/${ids.meetingA}`, headers: { cookie: cookieB } })
      expect(viaEncoded.statusCode).toBe(404)
    })

    it('without a session (AUTH_REQUIRED=true): 401 everywhere except health/login/logout', async () => {
      for (const r of apiRoutes()) {
        const res = await req(r.method, fill(r.url))
        if (PUBLIC.has(`${r.method} ${r.url}`)) expect(res.statusCode, `${r.method} ${r.url}`).not.toBe(401)
        else {
          expect(res.statusCode, `${r.method} ${r.url}`).toBe(401)
          expect(res.json().code).toBe('UNAUTHENTICATED')
        }
      }
    })

    it("user B on user A's meeting / project: the same 404 on every method (incl. SSE, PDF, download)", async () => {
      const cookieB = await cookieOf(PIN.b)
      const scoped = apiRoutes().filter((r) => r.url.startsWith('/api/meetings/:id') || r.url.startsWith('/api/projects/:projectId'))
      expect(scoped.length).toBeGreaterThanOrEqual(9)
      const nonexistent = '00000000-0000-4000-8000-0000000000ee'
      for (const r of scoped) {
        const foreign = await req(r.method, fill(r.url), cookieB)
        expect(foreign.statusCode, `${r.method} ${r.url}`).toBe(404)
        expect(foreign.json(), `${r.method} ${r.url}`).toEqual({ code: 'NOT_FOUND', message: 'Не найдено' })
        const missing = await req(r.method, fill(r.url).replace(ids.meetingA, nonexistent).replace(ids.projectA, nonexistent), cookieB)
        expect(missing.json(), `${r.method} ${r.url} (nonexistent)`).toEqual(foreign.json())
      }
      // nothing of A changed
      const m = await db.meeting.findUnique({ where: { id: ids.meetingA }, include: { protocol: true } })
      expect(m).toMatchObject({ status: 'PROTOCOL_READY', protocol: { markdownContent: '# generated A' } })
    })

    it('user B with A\'s workspace on every other route never gets a 2xx; list and uploads answer 404', async () => {
      const cookieB = await cookieOf(PIN.b)
      const rest = apiRoutes().filter(
        (r) => !r.url.startsWith('/api/meetings/:id') && !r.url.startsWith('/api/projects/:projectId') && !r.url.startsWith('/api/auth/') && r.url !== '/api/health',
      )
      // never a 2xx, never a crash: a membership refusal (404 NOT_FOUND), a missing/invalid
      // workspace (400 WORKSPACE_REQUIRED) or a body the route rejects (400 VALIDATION_ERROR)
      for (const r of rest) {
        const res = await req(r.method, `${fill(r.url)}?workspace_id=${ids.wsA}`, cookieB)
        expect([400, 404], `${r.method} ${r.url} → ${res.statusCode} ${res.body}`).toContain(res.statusCode)
        expect(['NOT_FOUND', 'WORKSPACE_REQUIRED', 'VALIDATION_ERROR'], `${r.method} ${r.url}`).toContain(res.json().code)
      }
      expect((await req('GET', `/api/meetings?workspace_id=${ids.wsA}`, cookieB)).statusCode).toBe(404)
      const init = await req('POST', '/api/uploads/init', cookieB, {
        payload: { workspace_id: ids.wsA, filename: 'x.mp4', size_bytes: 10, filetype: 'video/mp4', title: 'x', language: null },
      })
      expect(init.statusCode).toBe(404)
      const complete = await req('POST', '/api/uploads/complete', cookieB, {
        payload: {
          workspace_id: ids.wsA, s3_key: `ws/${ids.wsA}/x.mp4`, s3_upload_id: 'u', filename: 'x.mp4', size_bytes: 10,
          filetype: 'video/mp4', title: 'x', language: null, parts: [{ part_number: 1, etag: 'e' }],
        },
      })
      expect(complete.statusCode).toBe(404)
      // own workspace, but a key of another workspace → 400
      const crossKey = await req('POST', '/api/uploads/complete', cookieB, {
        payload: {
          workspace_id: ids.wsB, s3_key: `ws/${ids.wsA}/x.mp4`, s3_upload_id: 'u', filename: 'x.mp4', size_bytes: 10,
          filetype: 'video/mp4', title: 'x', language: null, parts: [{ part_number: 1, etag: 'e' }],
        },
      })
      expect(crossKey.statusCode).toBe(400)
    })

    it('control: the owner A does reach the same routes (the 404s above are not trivial)', async () => {
      const cookieA = await cookieOf(PIN.a)
      expect((await req('GET', `/api/meetings/${ids.meetingA}`, cookieA)).statusCode).toBe(200)
      expect((await req('GET', `/api/meetings/${ids.meetingA}/protocol`, cookieA)).statusCode).toBe(200)
      expect((await req('GET', `/api/meetings/${ids.meetingA}/transcript/download`, cookieA)).statusCode).not.toBe(404)
      const list = await req('GET', `/api/meetings?workspace_id=${ids.wsA}`, cookieA)
      expect(list.statusCode).toBe(200)
      expect(list.json().items.map((i: { id: string }) => i.id)).toEqual([ids.meetingA])
      // a signed-in user must name the workspace
      expect((await req('GET', '/api/meetings', cookieA)).json().code).toBe('WORKSPACE_REQUIRED')
    })
  })

  // ── D-20: AUTH_REQUIRED=false ───────────────────────────────────────────────
  describe('D-20 AUTH_REQUIRED=false (legacy principal)', () => {
    it('/me without a session → synthetic «Роман»; with true → 401', async () => {
      h.config.AUTH_REQUIRED = false
      try {
        const me = await app.inject({ method: 'GET', url: '/api/auth/me' })
        expect(me.statusCode).toBe(200)
        expect(me.json()).toEqual({
          user: { id: '00000000-0000-4000-8000-000000000002', name: 'Роман' },
          workspaces: [{ id: LEGACY_WS, name: 'Роман', personal: true }],
        })
      } finally {
        h.config.AUTH_REQUIRED = true
      }
      expect((await app.inject({ method: 'GET', url: '/api/auth/me' })).statusCode).toBe(401)
    })

    it('without a session the API serves «Роман» only, as before the program; login still works', async () => {
      h.config.AUTH_REQUIRED = false
      try {
        const list = await app.inject({ method: 'GET', url: '/api/meetings' })
        expect(list.statusCode).toBe(200)
        const listed = list.json().items.map((i: { id: string }) => i.id)
        expect(listed).toContain(ids.meetingL)
        expect(listed).not.toContain(ids.meetingA)
        expect((await app.inject({ method: 'GET', url: `/api/meetings/${ids.meetingL}` })).statusCode).not.toBe(404)
        expect((await app.inject({ method: 'GET', url: `/api/meetings/${ids.meetingA}` })).statusCode).toBe(404)
        expect((await app.inject({ method: 'GET', url: `/api/meetings?workspace_id=${ids.wsA}` })).statusCode).toBe(404)
        // a session still means full isolation, also in this mode
        const cookieA = await cookieOf(PIN.a)
        expect((await app.inject({ method: 'GET', url: `/api/meetings/${ids.meetingA}`, headers: { cookie: cookieA } })).statusCode).toBe(200)
        expect((await app.inject({ method: 'GET', url: `/api/meetings/${ids.meetingL}`, headers: { cookie: cookieA } })).statusCode).toBe(404)
      } finally {
        h.config.AUTH_REQUIRED = true
      }
    })

    it('without PIN_PEPPER login answers 503 and the CLI refuses', async () => {
      const pepper = h.config.PIN_PEPPER
      h.config.PIN_PEPPER = undefined
      try {
        const res = await login(PIN.a)
        expect(res.statusCode).toBe(503)
        expect(res.json().code).toBe('AUTH_NOT_CONFIGURED')
        await expect(cli(['create', '--name', 'X', '--pin', '444444'])).rejects.toThrow(/PIN_PEPPER/)
      } finally {
        h.config.PIN_PEPPER = pepper
      }
    })
  })

  // ── AC-4 ─────────────────────────────────────────────────────────────────────
  it('AC-4: user:create --name Роман --workspace Роман sees every old meeting', async () => {
    await cli(['create', '--name', 'Роман', '--pin', PIN.roman, '--workspace', 'Роман'])
    const cookie = await cookieOf(PIN.roman)
    const me = (await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } })).json()
    expect(me.workspaces).toEqual([{ id: LEGACY_WS, name: 'Роман', personal: true }])
    const list = await app.inject({ method: 'GET', url: `/api/meetings?workspace_id=${LEGACY_WS}`, headers: { cookie } })
    expect(list.json().items.map((i: { id: string }) => i.id)).toContain(ids.meetingL)
    expect((await app.inject({ method: 'GET', url: `/api/meetings/${ids.meetingL}`, headers: { cookie } })).statusCode).not.toBe(404)
  })

  // ── AC-3: hooks for the parallel streams ─────────────────────────────────────
  describe('AC-3 core hooks', () => {
    const completeBody = (ws: string, extra: Record<string, unknown>) => ({
      workspace_id: ws, s3_key: `ws/${ws}/${Math.random().toString(36).slice(2)}.mp4`, s3_upload_id: 'u',
      filename: 'call.mp4', size_bytes: 10, filetype: 'video/mp4', title: 'call', language: 'RU',
      parts: [{ part_number: 1, etag: 'e' }], ...extra,
    })

    it('defer_start=true → AWAITING_START, PENDING job with speaker_count, nothing enqueued', async () => {
      const cookie = await cookieOf(PIN.a)
      h.queueAdd.mockClear()
      const res = await app.inject({ method: 'POST', url: '/api/uploads/complete', headers: { cookie }, payload: completeBody(ids.wsA, { defer_start: true, speaker_count: 3 }) })
      expect(res.statusCode, res.body).toBe(200)
      expect(res.json().status).toBe('AWAITING_START')
      const m = await db.meeting.findUnique({ where: { id: res.json().meeting_id }, include: { transcriptionJob: true } })
      expect(m).toMatchObject({ status: 'AWAITING_START', workspaceId: ids.wsA, transcriptionJob: { status: 'PENDING', speakerCount: 3 } })
      expect(h.queueAdd).not.toHaveBeenCalled()

      const now = await app.inject({ method: 'POST', url: '/api/uploads/complete', headers: { cookie }, payload: completeBody(ids.wsA, { speaker_count: 2 }) })
      expect(now.json().status).toBe('TRANSCRIBING')
      expect(h.queueAdd).toHaveBeenCalledWith(expect.objectContaining({ speaker_count: 2 }))
    })

    it('PUT protocol appends an immutable USER_EDIT version by the author (v1 recorded first)', async () => {
      const cookie = await cookieOf(PIN.a)
      const put = (md: string) =>
        app.inject({ method: 'PUT', url: `/api/meetings/${ids.meetingA}/protocol`, headers: { cookie }, payload: { markdown_content: md } })
      expect((await put('# edit one')).statusCode).toBe(200)
      expect((await put('# edit two')).statusCode).toBe(200)
      const versions = await db.protocolVersion.findMany({ where: { meetingId: ids.meetingA }, orderBy: { n: 'asc' } })
      expect(versions.map((v: { n: number; kind: string; markdown: string; authorUserId: string | null }) => [v.n, v.kind, v.markdown, v.authorUserId])).toEqual([
        [1, 'GENERATED', '# generated A', null],
        [2, 'USER_EDIT', '# edit one', ids.userA],
        [3, 'USER_EDIT', '# edit two', ids.userA],
      ])
    })

    it('deleting a meeting of a project writes a GraphOutbox row in the same transaction', async () => {
      const cookie = await cookieOf(PIN.a)
      const res = await app.inject({ method: 'DELETE', url: `/api/meetings/${ids.meetingA}`, headers: { cookie } })
      expect(res.statusCode, res.body).toBe(200)
      const out = await db.graphOutbox.findMany({ where: { op: 'DELETE_MEETING' } })
      expect(out.map((o: { payload: unknown }) => o.payload)).toContainEqual({
        meeting_id: ids.meetingA, project_id: ids.projectA, workspace_id: ids.wsA,
      })
      expect(await db.meeting.findUnique({ where: { id: ids.meetingA } })).toBeNull()
    })
  })
}, 600_000)
