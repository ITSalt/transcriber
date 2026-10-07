/**
 * FR-003 / D-8 / A-3 — failed-PIN lockout.
 *
 * A wrong PIN identifies nobody, so failures are counted per CLIENT, not per user. The
 * count is CUMULATIVE (D-8: "after 10 unsuccessful attempts → block"; a success does not
 * wipe earlier failures) and the 10th failure blocks the client indefinitely — even a
 * correct PIN then gets 423 — until the CLI (user:unblock) lifts it.
 *
 * Race-free: every attempt first RESERVES a failure atomically (one upsert … RETURNING)
 * before any scrypt work. Only attempts whose reservation stays within the limit get to
 * test a PIN; a burst of parallel requests cannot test more than the remaining allowance.
 * A successful attempt gives its reservation back. A global row (client_key '*') counts
 * failures per one-hour window and logs a warning once it passes the threshold.
 */
import { isIP, isIPv6 } from 'node:net'
import type { FastifyBaseLogger, FastifyRequest } from 'fastify'
import {
  LOGIN_GLOBAL_CLIENT_KEY,
  LOGIN_GLOBAL_FAILURES_WARN_PER_HOUR,
  LOGIN_MAX_FAILED_ATTEMPTS,
} from '@transcrib/shared'
import { prisma } from '../../db.js'

/** Prod: Caddy on 127.0.0.1 proxies /api/* to the api (.tl/scripts/transcrib-caddyblock.conf). */
const TRUSTED_PROXIES = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1'])

/** Expand an IPv6 address to 8 groups of 4 hex digits. */
function expandIPv6(addr: string): string[] {
  const [head, tail] = addr.split('::') as [string, string | undefined]
  const h = head ? head.split(':') : []
  const t = tail !== undefined && tail !== '' ? tail.split(':') : []
  const fill = tail === undefined ? [] : Array<string>(8 - h.length - t.length).fill('0')
  return [...h, ...fill, ...t].map((g) => g.padStart(4, '0').toLowerCase())
}

/**
 * The lockout key of an address: IPv4 as is (IPv4-mapped IPv6 unwrapped), IPv6 by its /64
 * — one host can rotate through a whole /64, so per-address counting would not limit it.
 */
export function addressKey(addr: string): string {
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(addr)
  if (mapped) return mapped[1]!
  if (isIPv6(addr)) return `${expandIPv6(addr.split('%')[0]!).slice(0, 4).join(':')}::/64`
  return addr
}

/**
 * Client key. X-Forwarded-For is trusted only when the TCP peer is the local proxy, and then
 * only its LAST entry — the address the proxy itself appended (entries before it come from
 * the client and can be forged) — and only if it is an IP address.
 */
export function clientKey(request: FastifyRequest): string {
  const peer = request.raw.socket.remoteAddress ?? 'unknown'
  if (TRUSTED_PROXIES.has(peer)) {
    const header = request.headers['x-forwarded-for']
    const value = Array.isArray(header) ? header.join(',') : header
    const last = value
      ?.split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .at(-1)
    if (last && isIP(last)) return addressKey(last)
  }
  return addressKey(peer)
}

export interface Reservation {
  key: string
  /** failures counted so far INCLUDING this attempt's reservation */
  count: number
  /** the client is (now) blocked — answer 423 without testing the PIN */
  blocked: boolean
}

/** Atomically count this attempt as a failure up front; block once past the limit. */
export async function reserveAttempt(key: string): Promise<Reservation> {
  const [row] = await prisma.$queryRaw<Array<{ failed_count: number; blocked_at: Date | null }>>`
    INSERT INTO "login_blocks" ("id", "client_key", "failed_count", "created_at", "updated_at")
    VALUES (gen_random_uuid(), ${key}, 1, now(), now())
    ON CONFLICT ("client_key") DO UPDATE
      SET "failed_count" = "login_blocks"."failed_count" + 1, "updated_at" = now()
    RETURNING "failed_count", "blocked_at"`
  const count = Number(row!.failed_count)
  if (row!.blocked_at) return { key, count, blocked: true }
  if (count > LOGIN_MAX_FAILED_ATTEMPTS) {
    // the allowance is used up by attempts still in flight or already failed
    await block(key)
    return { key, count, blocked: true }
  }
  return { key, count, blocked: false }
}

async function block(key: string): Promise<void> {
  await prisma.loginBlock.updateMany({ where: { clientKey: key, blockedAt: null }, data: { blockedAt: new Date() } })
}

/** The PIN was wrong: the reservation stays; the 10th failure blocks. */
export async function settleFailure(r: Reservation, log: FastifyBaseLogger): Promise<{ blocked: boolean }> {
  await countGlobalFailure(log)
  if (r.count >= LOGIN_MAX_FAILED_ATTEMPTS) {
    await block(r.key)
    log.warn({ clientKey: r.key, failedCount: r.count }, 'login: client blocked after repeated PIN failures')
    return { blocked: true }
  }
  return { blocked: false }
}

/**
 * The PIN was right: give the reservation back (earlier failures stay — no reset), then
 * re-check the block a parallel failure may have set meanwhile.
 */
export async function settleSuccess(r: Reservation): Promise<{ blocked: boolean }> {
  const [row] = await prisma.$queryRaw<Array<{ blocked_at: Date | null }>>`
    UPDATE "login_blocks" SET "failed_count" = GREATEST("failed_count" - 1, 0), "updated_at" = now()
    WHERE "client_key" = ${r.key}
    RETURNING "blocked_at"`
  return { blocked: row?.blocked_at != null }
}

async function countGlobalFailure(log: FastifyBaseLogger): Promise<void> {
  const [g] = await prisma.$queryRaw<Array<{ failed_count: number; created_at: Date }>>`
    INSERT INTO "login_blocks" ("id", "client_key", "failed_count", "created_at", "updated_at")
    VALUES (gen_random_uuid(), ${LOGIN_GLOBAL_CLIENT_KEY}, 1, now(), now())
    ON CONFLICT ("client_key") DO UPDATE SET
      "failed_count" = CASE WHEN "login_blocks"."created_at" < now() - interval '1 hour'
                            THEN 1 ELSE "login_blocks"."failed_count" + 1 END,
      "created_at"   = CASE WHEN "login_blocks"."created_at" < now() - interval '1 hour'
                            THEN now() ELSE "login_blocks"."created_at" END,
      "updated_at"   = now()
    RETURNING "failed_count", "created_at"`
  if (Number(g!.failed_count) === LOGIN_GLOBAL_FAILURES_WARN_PER_HOUR + 1) {
    log.warn({ failures: Number(g!.failed_count), since: g!.created_at.toISOString() }, 'login: more than 100 PIN failures within an hour')
  }
}

/** Read-only check, so a blocked client gets 423 before anything else (no reservation). */
export async function isBlocked(key: string): Promise<boolean> {
  const row = await prisma.loginBlock.findUnique({ where: { clientKey: key }, select: { blockedAt: true } })
  return row?.blockedAt != null
}
