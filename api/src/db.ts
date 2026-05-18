/**
 * Prisma client singleton for the API process.
 *
 * Prisma 7 requires a driver adapter for direct database connections.
 * We use @prisma/adapter-pg (node-postgres) backed by a connection pool.
 *
 * DATABASE_URL must be set in the environment (or .env via prisma.config.ts).
 */
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'

const databaseUrl = process.env['DATABASE_URL']
if (!databaseUrl) {
  throw new Error('DATABASE_URL environment variable is required')
}

const pool = new Pool({ connectionString: databaseUrl })
const adapter = new PrismaPg(pool)

export const prisma = new PrismaClient({ adapter })
