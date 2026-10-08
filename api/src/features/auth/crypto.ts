/**
 * FR-003 / D-8 / A-1 / A-3 — PIN and session-token crypto. The PIN itself is never stored
 * or logged:
 *   pin_lookup = HMAC-SHA256(PIN, PIN_PEPPER)            — unique index, finds the user
 *   pin_hash   = scrypt$N$r$p$<salt b64>$<hash b64>       — verified after the lookup
 *   token_hash = SHA-256(random 32-byte cookie token)     — the DB never sees the token
 */
import { createHash, createHmac, randomBytes, scrypt, timingSafeEqual } from 'node:crypto'

const N = 16_384
const R = 8
const P = 1
const KEYLEN = 32

function scryptAsync(pin: string, salt: Buffer, n: number, r: number, p: number, keylen: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(pin, salt, keylen, { N: n, r, p, maxmem: 64 * 1024 * 1024 }, (err, key) => (err ? reject(err) : resolve(key)))
  })
}

export function pinLookup(pin: string, pepper: string): string {
  return createHmac('sha256', pepper).update(pin, 'utf8').digest('hex')
}

export async function hashPin(pin: string): Promise<string> {
  const salt = randomBytes(16)
  const key = await scryptAsync(pin, salt, N, R, P, KEYLEN)
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${key.toString('base64')}`
}

/** Constant-time check of a PIN against a stored pin_hash; malformed hashes never match. */
export async function verifyPin(pin: string, stored: string): Promise<boolean> {
  const parts = stored.split('$')
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false
  const [n, r, p] = parts.slice(1, 4).map((x) => Number(x))
  const salt = Buffer.from(parts[4]!, 'base64')
  const expected = Buffer.from(parts[5]!, 'base64')
  if (!n || !r || !p || expected.length === 0) return false
  const actual = await scryptAsync(pin, salt, n, r, p, expected.length)
  return timingSafeEqual(actual, expected)
}

let dummyHash: Promise<string> | null = null
/**
 * Run the same scrypt work when no user matched, so a wrong PIN and an unknown PIN take the
 * same time (no timing oracle on pin_lookup hits).
 */
export async function burnPinCheck(pin: string): Promise<void> {
  dummyHash ??= hashPin('000000')
  await verifyPin(pin, await dummyHash)
}

export function newSessionToken(): string {
  return randomBytes(32).toString('base64url')
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}
