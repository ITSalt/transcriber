/**
 * FR-003 — login by PIN, sessions, and the access gate of every /api/* route
 * (WP-BACKEND-01; UC-400, UC-401, UC-402; RQ-040..RQ-044, RQ-058; D-8, D-20, A-3).
 *
 * Wrapped in fastify-plugin, so its hooks run at the ROOT scope — for the core routes and
 * for every other feature folder alike, whatever the registration order:
 *   onRequest     — gated by the matched ROUTE PATTERN (never the raw URL, which may be
 *                   percent-encoded: `/%61pi/...` routes to `/api/...`); unmatched URLs are
 *                   gated too. Resolves request.auth from the session cookie; without a
 *                   session: 401 when AUTH_REQUIRED=true, else the legacy principal (D-20).
 *                   Public (no session lookup at all): GET /api/health, POST /api/auth/login,
 *                   POST /api/auth/logout.
 *   preValidation — every route under `/api/meetings/:id` and `/api/projects/:projectId`:
 *                   foreign or nonexistent id → the same 404 NOT_FOUND, before body
 *                   validation and before the handler (also covers SSE, PDF, downloads).
 *                   A project route that also carries a meeting `:id` checks both.
 *   onRoute       — refuses at startup a route under `/api/meetings/:` or `/api/projects/:`
 *                   whose parameter is not exactly `:id` / `:projectId`, so no route can
 *                   silently fall outside the check above.
 * Feature folders load alphabetically; one sorting before `auth` that adds its own root
 * onRequest hook would run before request.auth is set — keep such hooks in preHandler.
 *
 *   POST /api/auth/login   {pin}  → 200 MeResponse + Set-Cookie | 400 | 401 | 423 | 503
 *   POST /api/auth/logout         → 204 (idempotent)
 *   GET  /api/auth/me             → 200 MeResponse | 401
 */
import fp from 'fastify-plugin'
import cookie from '@fastify/cookie'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type { ZodTypeProvider } from '@fastify/type-provider-zod'
import { z } from 'zod'
import {
  LEGACY_WORKSPACE_ID,
  LEGACY_WORKSPACE_NAME,
  LoginRequest,
  MeResponse,
  PROGRAM_ERRORS,
  PROGRAM_ERROR_MESSAGES,
  SESSION_COOKIE_NAME,
  SESSION_TTL_DAYS,
} from '@transcrib/shared'
import { config } from '../../config.js'
import { prisma } from '../../db.js'
import { AppError } from '../../plugins/errors.js'
import { assertMeetingAccess, assertProjectAccess } from './access.js'
import { burnPinCheck, hashToken, newSessionToken, pinLookup, verifyPin } from './crypto.js'
import { clientKey, isBlocked, reserveAttempt, settleFailure, settleSuccess } from './lockout.js'
import { LEGACY_AUTH, LEGACY_USER_ID, type AuthContext } from './types.js'

const SESSION_TTL_MS = SESSION_TTL_DAYS * 24 * 60 * 60 * 1000
/** last_seen_at is refreshed at most this often, so reads stay reads. */
const TOUCH_INTERVAL_MS = 60_000

const PUBLIC_ROUTES = new Set(['GET /api/health', 'HEAD /api/health', 'POST /api/auth/login', 'POST /api/auth/logout'])

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MEETING_SCOPE = '/api/meetings/:id'
const PROJECT_SCOPE = '/api/projects/:projectId'

const inScope = (url: string | undefined, scope: string): boolean =>
  url !== undefined && (url === scope || url.startsWith(`${scope}/`))

/** Startup guard: resource-scoped routes must use the parameter names the gate checks. */
function assertGatedShape(url: string): void {
  for (const [prefix, scope] of [['/api/meetings/:', MEETING_SCOPE], ['/api/projects/:', PROJECT_SCOPE]] as const) {
    if (url.startsWith(prefix) && !inScope(url, scope)) {
      throw new Error(`auth: route ${url} must use ${scope} (exact parameter name, no regex) so the access check covers it`)
    }
  }
  if (url.startsWith('/api/projects/') && url.includes('/meetings/:') && !url.includes('/meetings/:id')) {
    throw new Error(`auth: route ${url} must name its meeting parameter :id so the access check covers it`)
  }
}

function authError(code: 'UNAUTHENTICATED' | 'INVALID_PIN' | 'PIN_FORMAT' | 'LOGIN_BLOCKED'): AppError {
  return new AppError(code, PROGRAM_ERRORS[code], PROGRAM_ERROR_MESSAGES[code])
}

async function sessionAuth(request: FastifyRequest): Promise<AuthContext | null> {
  const token = request.cookies?.[SESSION_COOKIE_NAME]
  if (!token) return null
  const session = await prisma.authSession.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: { include: { memberships: { select: { workspaceId: true } } } } },
  })
  const now = Date.now()
  if (!session || session.expiresAt.getTime() <= now) return null
  if (now - session.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
    // updateMany: a concurrent logout may have deleted the row — not an error
    await prisma.authSession.updateMany({ where: { id: session.id }, data: { lastSeenAt: new Date(now) } })
  }
  return {
    kind: 'user',
    userId: session.userId,
    userName: session.user.name,
    workspaceIds: session.user.memberships.map((m) => m.workspaceId),
    sessionId: session.id,
  }
}

async function meResponse(auth: AuthContext): Promise<MeResponse> {
  if (auth.kind === 'legacy') {
    return {
      user: { id: LEGACY_USER_ID, name: LEGACY_WORKSPACE_NAME },
      workspaces: [{ id: LEGACY_WORKSPACE_ID, name: LEGACY_WORKSPACE_NAME, personal: true }],
    }
  }
  const workspaces = await prisma.workspace.findMany({
    where: { memberships: { some: { userId: auth.userId! } } },
    select: { id: true, name: true, personal: true },
    orderBy: [{ personal: 'desc' }, { name: 'asc' }],
  })
  return { user: { id: auth.userId!, name: auth.userName }, workspaces }
}

function setSessionCookie(reply: FastifyReply, token: string): void {
  reply.setCookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_TTL_MS / 1000,
  })
}

async function authPlugin(app: FastifyInstance): Promise<void> {
  if (!app.hasDecorator('parseCookie')) await app.register(cookie)
  app.decorateRequest('auth', null)
  app.decorateRequest('meetingAccess', null)
  app.decorateRequest('projectAccess', null)

  app.addHook('onRoute', (route) => assertGatedShape(route.url))

  app.addHook('onRequest', async (request) => {
    const pattern = request.routeOptions.url
    // decide on the matched route pattern; an unmatched URL (pattern undefined) is gated
    if (pattern !== undefined && !pattern.startsWith('/api/')) return
    if (PUBLIC_ROUTES.has(`${request.method} ${pattern}`)) return
    const auth = await sessionAuth(request)
    if (auth) {
      request.auth = auth
      return
    }
    if (config.AUTH_REQUIRED === true) throw authError('UNAUTHENTICATED')
    request.auth = { ...LEGACY_AUTH, workspaceIds: [...LEGACY_AUTH.workspaceIds] }
  })

  app.addHook('preValidation', async (request) => {
    const url = request.routeOptions.url
    const params = (request.params ?? {}) as Record<string, string | undefined>
    const meetingId = inScope(url, MEETING_SCOPE) || (inScope(url, PROJECT_SCOPE) && url!.includes('/meetings/:id')) ? params['id'] : undefined
    const projectId = inScope(url, PROJECT_SCOPE) ? params['projectId'] : undefined
    if (meetingId === undefined && projectId === undefined) return
    // a malformed id is a malformed request (400, as the route's params schema says) —
    // it reveals nothing about which ids exist
    for (const id of [meetingId, projectId]) {
      if (id !== undefined && !UUID.test(id)) throw new AppError('VALIDATION_ERROR', 400, 'Request validation failed')
    }
    if (projectId !== undefined) request.projectAccess = await assertProjectAccess(request, projectId)
    if (meetingId !== undefined) request.meetingAccess = await assertMeetingAccess(request, meetingId)
  })

  const r = app.withTypeProvider<ZodTypeProvider>()

  // ── POST /api/auth/login ─────────────────────────────────────────────────
  r.post(
    '/api/auth/login',
    // the PIN format is checked in the handler: a blocked client gets 423 before anything
    // else, and a malformed PIN must answer PIN_FORMAT, not a generic validation error
    { schema: { body: z.unknown(), response: { 200: MeResponse } } },
    async (request, reply) => {
      if (!config.PIN_PEPPER) {
        throw new AppError('AUTH_NOT_CONFIGURED', 503, 'Вход не настроен')
      }
      const key = clientKey(request)
      if (await isBlocked(key)) throw authError('LOGIN_BLOCKED')

      const parsed = LoginRequest.safeParse(request.body)
      if (!parsed.success) throw authError('PIN_FORMAT')
      const { pin } = parsed.data

      // count the attempt BEFORE any scrypt work: parallel requests cannot outrun the limit
      const reservation = await reserveAttempt(key)
      if (reservation.blocked) throw authError('LOGIN_BLOCKED')

      const user = await prisma.user.findUnique({ where: { pinLookup: pinLookup(pin, config.PIN_PEPPER) } })
      const ok = user ? await verifyPin(pin, user.pinHash) : (await burnPinCheck(pin), false)
      if (!user || !ok) {
        const { blocked } = await settleFailure(reservation, request.log)
        throw authError(blocked ? 'LOGIN_BLOCKED' : 'INVALID_PIN')
      }
      // a parallel failure may have blocked the client while this PIN was checked
      if ((await settleSuccess(reservation)).blocked) throw authError('LOGIN_BLOCKED')

      const token = newSessionToken()
      const session = await prisma.authSession.create({
        data: { userId: user.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + SESSION_TTL_MS) },
      })
      const memberships = await prisma.membership.findMany({ where: { userId: user.id }, select: { workspaceId: true } })
      setSessionCookie(reply, token)
      return reply.status(200).send(
        await meResponse({
          kind: 'user',
          userId: user.id,
          userName: user.name,
          workspaceIds: memberships.map((m) => m.workspaceId),
          sessionId: session.id,
        }),
      )
    },
  )

  // ── POST /api/auth/logout ────────────────────────────────────────────────
  r.post('/api/auth/logout', async (request, reply) => {
    const token = request.cookies?.[SESSION_COOKIE_NAME]
    if (token) await prisma.authSession.deleteMany({ where: { tokenHash: hashToken(token) } })
    reply.clearCookie(SESSION_COOKIE_NAME, { path: '/' })
    return reply.status(204).send()
  })

  // ── GET /api/auth/me ─────────────────────────────────────────────────────
  r.get('/api/auth/me', { schema: { response: { 200: MeResponse } } }, async (request, reply) => {
    if (!request.auth) throw authError('UNAUTHENTICATED')
    return reply.status(200).send(await meResponse(request.auth))
  })
}

export default fp(authPlugin, { name: 'transcrib-auth' })
