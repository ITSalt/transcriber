/**
 * Worker-side Prisma client singleton.
 *
 * Mirrors api/src/db.ts — separate singleton per process.
 * Uses @prisma/adapter-pg (node-postgres) backed by a connection pool.
 * DATABASE_URL must be set in the environment.
 *
 * Lazy initialization: the client is created on first access,
 * not at module import time, to allow test files to mock this module
 * before the real client is constructed.
 */
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'

let _prisma: PrismaClient | undefined

function createPrismaClient(): PrismaClient {
  const databaseUrl = process.env['DATABASE_URL']
  if (!databaseUrl) {
    throw new Error('DATABASE_URL environment variable is required')
  }
  const pool = new Pool({ connectionString: databaseUrl })
  const adapter = new PrismaPg(pool)
  return new PrismaClient({ adapter })
}

export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    if (!_prisma) {
      _prisma = createPrismaClient()
    }
    const value = (_prisma as unknown as Record<string | symbol, unknown>)[prop]
    if (typeof value === 'function') {
      return value.bind(_prisma)
    }
    return value
  },
})
