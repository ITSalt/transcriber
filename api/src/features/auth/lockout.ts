/**
 * FR-003 / D-8 / A-3 — failed-PIN lockout.
 *
 * A wrong PIN identifies nobody, so failures are counted per CLIENT (its IP), not per user:
 * the 10th failure blocks the client indefinitely — even a correct PIN then gets 423 — and
 * only the CLI (user:unblock) lifts it. A global row (client_key '*') counts failures per
 * hour window and logs a warning once it passes LOGIN_GLOBAL_FAILURES_WARN_PER_HOUR.
 */
import type { FastifyBaseLogger, FastifyRequest } from 'fastify'
import {
  LOGIN_GLOBAL_CLIENT_KEY,
  LOGIN_GLOBAL_FAILURES_WARN_PER_HOUR,
  LOGIN_MAX_FAILED_ATTEMPTS,
} from '@transcrib/shared'
import { prisma } from '../../db.js'

/** Prod: Caddy on 127.0.0.1 proxies /api/* to the api (.tl/scripts/transcrib-caddyblock.conf). */
const TRUSTED_PROXIES = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1'])
const HOUR_MS = 3_600_000

/**
 * Client key = the client IP. X-Forwarded-For is trusted only when the TCP peer is the
 * local proxy, and then only its LAST entry — the address the proxy itself appended; any
 * entries before it come from the client and can be forged.
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
    if (last) return last
  }
  return peer
}

export async function isBlocked(key: string): Promise<boolean> {
  const row = await prisma.loginBlock.findUnique({ where: { clientKey: key }, select: { blockedAt: true } })
  return row?.blockedAt != null
}

/** Count one failure; returns whether the client is blocked now. */
export async function recordFailure(key: string, log: FastifyBaseLogger): Promise<{ blocked: boolean; failedCount: number }> {
  return prisma.$transaction(async (tx) => {
    const row = await tx.loginBlock.upsert({
      where: { clientKey: key },
      create: { clientKey: key, failedCount: 1 },
      update: { failedCount: { increment: 1 } },
    })
    let blocked = row.blockedAt != null
    if (!blocked && row.failedCount >= LOGIN_MAX_FAILED_ATTEMPTS) {
      await tx.loginBlock.update({ where: { clientKey: key }, data: { blockedAt: new Date() } })
      blocked = true
      log.warn({ clientKey: key, failedCount: row.failedCount }, 'login: client blocked after repeated PIN failures')
    }

    // global counter, one-hour window starting at the row's createdAt
    const now = new Date()
    const global = await tx.loginBlock.findUnique({ where: { clientKey: LOGIN_GLOBAL_CLIENT_KEY } })
    if (!global) {
      await tx.loginBlock.create({ data: { clientKey: LOGIN_GLOBAL_CLIENT_KEY, failedCount: 1 } })
    } else if (now.getTime() - global.createdAt.getTime() > HOUR_MS) {
      await tx.loginBlock.update({ where: { clientKey: LOGIN_GLOBAL_CLIENT_KEY }, data: { failedCount: 1, createdAt: now } })
    } else {
      const g = await tx.loginBlock.update({
        where: { clientKey: LOGIN_GLOBAL_CLIENT_KEY },
        data: { failedCount: { increment: 1 } },
      })
      if (g.failedCount === LOGIN_GLOBAL_FAILURES_WARN_PER_HOUR + 1) {
        log.warn({ failures: g.failedCount, since: g.createdAt.toISOString() }, 'login: more than 100 PIN failures within an hour')
      }
    }
    return { blocked, failedCount: row.failedCount }
  })
}

/** A successful login resets the client's counter (never lifts a block — only the CLI does). */
export async function clearFailures(key: string): Promise<void> {
  await prisma.loginBlock.updateMany({ where: { clientKey: key, blockedAt: null }, data: { failedCount: 0 } })
}
