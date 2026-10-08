/**
 * Throw-away PostgreSQL databases for migration tests (created next to the CI database,
 * never on it — dropping tables there would break the parallel test files).
 * Requires DATABASE_URL with CREATEDB rights (CI: the postgres service superuser).
 */
import { readFileSync, readdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

export const DATABASE_URL = process.env['DATABASE_URL']
export const API_DIR = fileURLToPath(new URL('../..', import.meta.url))
export const MIGRATIONS = join(API_DIR, 'prisma', 'migrations')
const PRISMA = join(API_DIR, 'node_modules', '.bin', 'prisma')

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type PgClient = any

export const migrationNames = (): string[] =>
  readdirSync(MIGRATIONS, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort()

export const migrationSql = (name: string): string => readFileSync(join(MIGRATIONS, name, 'migration.sql'), 'utf8')
export const downSql = (name: string): string => readFileSync(join(MIGRATIONS, name, 'down.sql'), 'utf8')

export function urlFor(db: string): string {
  const u = new URL(DATABASE_URL!)
  u.pathname = `/${db}`
  return u.toString()
}

let ClientCtor: (new (cfg: { connectionString: string }) => PgClient) | undefined
async function client(url: string): Promise<PgClient> {
  ClientCtor ??= (await import('pg')).Client
  const c = new ClientCtor!({ connectionString: url })
  await c.connect()
  return c
}

export async function withDb<T>(db: string, fn: (c: PgClient) => Promise<T>): Promise<T> {
  const c = await client(urlFor(db))
  try {
    return await fn(c)
  } finally {
    await c.end() // like `psql -f` exiting: an aborted explicit transaction is rolled back
  }
}

export async function createDatabases(...names: string[]): Promise<void> {
  const admin = await client(DATABASE_URL!)
  try {
    for (const n of names) await admin.query(`CREATE DATABASE "${n}"`)
  } finally {
    await admin.end()
  }
}

export async function dropDatabases(...names: string[]): Promise<void> {
  const admin = await client(DATABASE_URL!)
  try {
    for (const n of names) await admin.query(`DROP DATABASE IF EXISTS "${n}" WITH (FORCE)`)
  } finally {
    await admin.end()
  }
}

/** Build a reference DB by replaying every migration up to and including `last` as raw SQL. */
export async function replayMigrations(db: string, upToIncluding: (name: string) => boolean): Promise<string[]> {
  const names = migrationNames().filter(upToIncluding)
  await withDb(db, async (c) => {
    for (const m of names) await c.query(migrationSql(m))
  })
  return names
}

export const runDown = (db: string, name: string) => withDb(db, (c) => c.query(downSql(name)))

export function prismaCli(args: string[], db: string): { status: number | null; out: string } {
  const r = spawnSync(PRISMA, args, {
    cwd: API_DIR,
    env: { ...process.env, DATABASE_URL: urlFor(db) },
    encoding: 'utf8',
    timeout: 120_000,
  })
  return { status: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}` }
}

export const noDrift = (db: string) =>
  prismaCli(['migrate', 'diff', '--from-config-datasource', '--to-schema', 'prisma/schema.prisma', '--exit-code'], db)

/** Structural snapshot of the public schema (Prisma's bookkeeping table excluded). */
export async function catalog(db: string) {
  return withDb(db, async (c) => {
    const q = async (sql: string) => (await c.query(sql)).rows
    return {
      columns: await q(`SELECT table_name, column_name, data_type, udt_name, is_nullable, column_default
                        FROM information_schema.columns
                        WHERE table_schema = 'public' AND table_name <> '_prisma_migrations'
                        ORDER BY table_name, column_name`),
      enums: await q(`SELECT t.typname, array_agg(e.enumlabel ORDER BY e.enumsortorder) AS labels
                      FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
                      JOIN pg_namespace n ON n.oid = t.typnamespace AND n.nspname = 'public'
                      GROUP BY t.typname ORDER BY t.typname`),
      indexes: await q(`SELECT indexname, indexdef FROM pg_indexes
                        WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
                        ORDER BY indexname`),
      constraints: await q(`SELECT cl.relname, co.conname, pg_get_constraintdef(co.oid) AS def
                            FROM pg_constraint co JOIN pg_class cl ON cl.oid = co.conrelid
                            JOIN pg_namespace n ON n.oid = cl.relnamespace AND n.nspname = 'public'
                            WHERE cl.relname <> '_prisma_migrations'
                            ORDER BY cl.relname, co.conname`),
    }
  })
}
