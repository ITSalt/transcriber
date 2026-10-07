/**
 * WP-BACKEND-06 (REVISE 1) — down.sql of 20261007120000_program_product_schema.
 *
 * Prisma runs migration.sql WITHOUT a transaction, so a failure midway leaves half the
 * schema and `migrate resolve --rolled-back` + retry fails. down.sql is the recovery path
 * (.tl/deploy-plan.md §5). This test proves, on throw-away databases created next to the
 * CI database (never on it — dropping tables there would break parallel test files):
 *   1. after a full apply, down.sql returns the EXACT pre-migration schema (catalog equal to
 *      a reference DB built from the 5 earlier migrations) and keeps meetings/protocols;
 *   2. the migration then re-applies (`migrate deploy`), with no drift against schema.prisma;
 *   3. from a PARTIALLY applied, failed migration (the case the runbook is for) `migrate
 *      deploy` is blocked, down.sql unblocks it, and the re-apply succeeds;
 *   4. down.sql refuses atomically while a meeting is in AWAITING_START.
 * Requires DATABASE_URL with CREATEDB rights (CI: the postgres service superuser).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const DATABASE_URL = process.env['DATABASE_URL']
const API_DIR = fileURLToPath(new URL('..', import.meta.url))
const MIGRATIONS = join(API_DIR, 'prisma', 'migrations')
const NAME = '20261007120000_program_product_schema'
const UP_SQL = readFileSync(join(MIGRATIONS, NAME, 'migration.sql'), 'utf8')
const DOWN_SQL = readFileSync(join(MIGRATIONS, NAME, 'down.sql'), 'utf8')
const PRISMA = join(API_DIR, 'node_modules', '.bin', 'prisma')
const LEGACY_WS = '00000000-0000-4000-8000-000000000001'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PgClient = any

describe.skipIf(!DATABASE_URL)('down.sql of 20261007120000_program_product_schema', () => {
  const suffix = `${process.pid}_${Date.now()}`
  const workDb = `wp06_down_${suffix}`
  const refDb = `wp06_ref_${suffix}`
  const urlFor = (db: string) => {
    const u = new URL(DATABASE_URL!)
    u.pathname = `/${db}`
    return u.toString()
  }
  let Client: new (cfg: { connectionString: string }) => PgClient
  let admin: PgClient

  async function withDb<T>(db: string, fn: (c: PgClient) => Promise<T>): Promise<T> {
    const c = new Client({ connectionString: urlFor(db) })
    await c.connect()
    try {
      return await fn(c)
    } finally {
      await c.end() // like `psql -f` exiting: an aborted explicit transaction is rolled back
    }
  }

  const runDown = (db: string) => withDb(db, (c) => c.query(DOWN_SQL))

  function prisma(args: string[], db: string) {
    const r = spawnSync(PRISMA, args, {
      cwd: API_DIR,
      env: { ...process.env, DATABASE_URL: urlFor(db) },
      encoding: 'utf8',
      timeout: 120_000,
    })
    return { status: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}` }
  }

  /** Structural snapshot of the public schema (Prisma's bookkeeping table excluded). */
  async function catalog(db: string) {
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

  const oldRows = (db: string) =>
    withDb(db, async (c) => ({
      meetings: (await c.query(`SELECT id, title, status::text AS status FROM meetings WHERE title LIKE 'down-%' ORDER BY title`)).rows,
      protocols: (await c.query(`SELECT p.markdown_content, p.edit_count FROM protocols p
                                 JOIN meetings m ON m.id = p.meeting_id WHERE m.title LIKE 'down-%' ORDER BY m.title`)).rows,
    }))

  beforeAll(async () => {
    Client = (await import('pg')).Client
    admin = new Client({ connectionString: DATABASE_URL! })
    await admin.connect()
    await admin.query(`CREATE DATABASE "${workDb}"`)
    await admin.query(`CREATE DATABASE "${refDb}"`)
    // Reference = the schema BEFORE this migration: replay the earlier migration files.
    const earlier = readdirSync(MIGRATIONS, { withFileTypes: true })
      .filter((e) => e.isDirectory() && e.name < NAME)
      .map((e) => e.name)
      .sort()
    expect(earlier).toHaveLength(5)
    await withDb(refDb, async (c) => {
      for (const m of earlier) await c.query(readFileSync(join(MIGRATIONS, m, 'migration.sql'), 'utf8'))
    })
  }, 120_000)

  afterAll(async () => {
    if (!admin) return
    await admin.query(`DROP DATABASE IF EXISTS "${workDb}" WITH (FORCE)`)
    await admin.query(`DROP DATABASE IF EXISTS "${refDb}" WITH (FORCE)`)
    await admin.end()
  })

  it('full apply → down.sql → exact old schema, old rows kept → re-apply without drift', async () => {
    const deploy = prisma(['migrate', 'deploy'], workDb)
    expect(deploy.status, deploy.out).toBe(0) // down.sql next to migration.sql does not bother Prisma

    // rows as the pre-program code writes them (no workspace_id; DB default fills it)
    await withDb(workDb, (c) =>
      c.query(`INSERT INTO meetings (id, title, status, language, updated_at) VALUES
                 ('a0000000-0000-4000-8000-000000000001', 'down-1 edited', 'EDITED', 'RU', now()),
                 ('a0000000-0000-4000-8000-000000000002', 'down-2 failed', 'FAILED', 'AUTO', now());
               INSERT INTO protocols (id, meeting_id, markdown_content, edit_count, updated_at) VALUES
                 (gen_random_uuid(), 'a0000000-0000-4000-8000-000000000001', '# kept', 2, now());`),
    )
    const before = await oldRows(workDb)

    await runDown(workDb)

    expect(await catalog(workDb)).toEqual(await catalog(refDb))
    expect(await oldRows(workDb)).toEqual(before)
    await withDb(workDb, async (c) => {
      const rows = (await c.query(`SELECT migration_name FROM _prisma_migrations ORDER BY 1`)).rows
      expect(rows.map((r: { migration_name: string }) => r.migration_name)).not.toContain(NAME)
      expect(rows).toHaveLength(5)
    })

    // idempotent: a second run on the old schema is a no-op
    await runDown(workDb)
    expect(await catalog(workDb)).toEqual(await catalog(refDb))

    const again = prisma(['migrate', 'deploy'], workDb)
    expect(again.status, again.out).toBe(0)
    const diff = prisma(['migrate', 'diff', '--from-config-datasource', '--to-schema', 'prisma/schema.prisma', '--exit-code'], workDb)
    expect(diff.status, diff.out).toBe(0)
    await withDb(workDb, async (c) => {
      const ws = (await c.query(`SELECT DISTINCT workspace_id::text AS ws FROM meetings WHERE title LIKE 'down-%'`)).rows
      expect(ws).toEqual([{ ws: LEGACY_WS }])
      const v = (await c.query(`SELECT n, kind::text AS kind, markdown FROM protocol_versions
                                WHERE meeting_id = 'a0000000-0000-4000-8000-000000000001'`)).rows
      expect(v).toEqual([{ n: 1, kind: 'LEGACY', markdown: '# kept' }])
    })
  }, 180_000)

  it('refuses atomically while a meeting is in AWAITING_START', async () => {
    await withDb(workDb, (c) =>
      c.query(`INSERT INTO meetings (id, title, status, language, updated_at)
               VALUES ('a0000000-0000-4000-8000-000000000003', 'down-3 waiting', 'AWAITING_START', 'RU', now())`),
    )
    const snapshot = await catalog(workDb)
    await expect(runDown(workDb)).rejects.toThrow(/AWAITING_START/)
    expect(await catalog(workDb)).toEqual(snapshot) // nothing was dropped
    await withDb(workDb, (c) =>
      c.query(`UPDATE meetings SET status = 'UPLOADED' WHERE id = 'a0000000-0000-4000-8000-000000000003'`),
    )
  }, 60_000)

  it('partially applied + failed migration: deploy is blocked, down.sql unblocks it, re-apply succeeds', async () => {
    await runDown(workDb)
    // what a mid-file failure leaves: everything before the backfills, and a failed row
    const partial = UP_SQL.slice(0, UP_SQL.indexOf('-- Backfill 1'))
    expect(partial).toContain('CREATE TYPE "ParticipantSide"')
    await withDb(workDb, async (c) => {
      await c.query(partial)
      await c.query(`INSERT INTO _prisma_migrations (id, checksum, migration_name, started_at, applied_steps_count)
                     VALUES (gen_random_uuid()::text, 'failed-midway', $1, now(), 0)`, [NAME])
    })
    const blocked = prisma(['migrate', 'deploy'], workDb)
    expect(blocked.status).not.toBe(0)

    await runDown(workDb)
    expect(await catalog(workDb)).toEqual(await catalog(refDb))

    const deploy = prisma(['migrate', 'deploy'], workDb)
    expect(deploy.status, deploy.out).toBe(0)
    const diff = prisma(['migrate', 'diff', '--from-config-datasource', '--to-schema', 'prisma/schema.prisma', '--exit-code'], workDb)
    expect(diff.status, diff.out).toBe(0)
    expect((await oldRows(workDb)).meetings.map((m: { title: string }) => m.title)).toEqual([
      'down-1 edited',
      'down-2 failed',
      'down-3 waiting',
    ])
  }, 180_000)
})
