/**
 * WP-BACKEND-06 (REVISE 1) — down.sql of 20261007120000_program_product_schema.
 *
 * Prisma runs migration.sql WITHOUT a transaction, so a failure midway leaves half the
 * schema and `migrate resolve --rolled-back` + retry fails. down.sql is the recovery path
 * (.tl/deploy-plan.md §5). On throw-away databases (helpers/db.ts) this proves:
 *   1. after a full apply (and rolling back every NEWER migration first, newest first, with
 *      their own down.sql), down.sql returns the EXACT pre-migration schema (catalog equal to
 *      a reference DB built from the earlier migrations) and keeps meetings/protocols;
 *   2. the migrations then re-apply (`migrate deploy`), with no drift against schema.prisma;
 *   3. from a PARTIALLY applied, failed migration `migrate deploy` is blocked, down.sql
 *      unblocks it, and the re-apply succeeds;
 *   4. down.sql refuses atomically while a meeting is in AWAITING_START.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import {
  DATABASE_URL,
  catalog,
  createDatabases,
  dropDatabases,
  migrationNames,
  migrationSql,
  noDrift,
  prismaCli,
  replayMigrations,
  runDown,
  withDb,
} from './helpers/db.js'

const NAME = '20261007120000_program_product_schema'
const LEGACY_WS = '00000000-0000-4000-8000-000000000001'

describe.skipIf(!DATABASE_URL)('down.sql of 20261007120000_program_product_schema', () => {
  const suffix = `${process.pid}_${Date.now()}`
  const workDb = `wp06_down_${suffix}`
  const refDb = `wp06_ref_${suffix}`
  const newer = migrationNames().filter((m) => m > NAME).reverse()

  /** Undo the newer migrations (newest first), then this one. */
  async function downToBefore(db: string): Promise<void> {
    for (const m of newer) await runDown(db, m)
    await runDown(db, NAME)
  }

  const oldRows = (db: string) =>
    withDb(db, async (c) => ({
      meetings: (await c.query(`SELECT id, title, status::text AS status FROM meetings WHERE title LIKE 'down-%' ORDER BY title`)).rows,
      protocols: (await c.query(`SELECT p.markdown_content, p.edit_count FROM protocols p
                                 JOIN meetings m ON m.id = p.meeting_id WHERE m.title LIKE 'down-%' ORDER BY m.title`)).rows,
    }))

  beforeAll(async () => {
    await createDatabases(workDb, refDb)
    // Reference = the schema BEFORE this migration
    expect(await replayMigrations(refDb, (m) => m < NAME)).toHaveLength(5)
  }, 120_000)

  afterAll(async () => {
    if (DATABASE_URL) await dropDatabases(workDb, refDb)
  })

  it('full apply → down.sql → exact old schema, old rows kept → re-apply without drift', async () => {
    const deploy = prismaCli(['migrate', 'deploy'], workDb)
    expect(deploy.status, deploy.out).toBe(0) // down.sql next to migration.sql does not bother Prisma

    await withDb(workDb, (c) =>
      c.query(`INSERT INTO meetings (id, title, status, language, updated_at, workspace_id) VALUES
                 ('a0000000-0000-4000-8000-000000000001', 'down-1 edited', 'EDITED', 'RU', now(), '${LEGACY_WS}'),
                 ('a0000000-0000-4000-8000-000000000002', 'down-2 failed', 'FAILED', 'AUTO', now(), '${LEGACY_WS}');
               INSERT INTO protocols (id, meeting_id, markdown_content, edit_count, updated_at) VALUES
                 (gen_random_uuid(), 'a0000000-0000-4000-8000-000000000001', '# kept', 2, now());`),
    )
    const before = await oldRows(workDb)

    await downToBefore(workDb)

    expect(await catalog(workDb)).toEqual(await catalog(refDb))
    expect(await oldRows(workDb)).toEqual(before)
    await withDb(workDb, async (c) => {
      const rows = (await c.query(`SELECT migration_name FROM _prisma_migrations ORDER BY 1`)).rows
      expect(rows.map((r: { migration_name: string }) => r.migration_name)).not.toContain(NAME)
      expect(rows).toHaveLength(5)
    })

    // idempotent: a second run on the old schema is a no-op
    await runDown(workDb, NAME)
    expect(await catalog(workDb)).toEqual(await catalog(refDb))

    const again = prismaCli(['migrate', 'deploy'], workDb)
    expect(again.status, again.out).toBe(0)
    const diff = noDrift(workDb)
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
      c.query(`INSERT INTO meetings (id, title, status, language, updated_at, workspace_id)
               VALUES ('a0000000-0000-4000-8000-000000000003', 'down-3 waiting', 'AWAITING_START', 'RU', now(), '${LEGACY_WS}')`),
    )
    for (const m of newer) await runDown(workDb, m)
    const snapshot = await catalog(workDb)
    await expect(runDown(workDb, NAME)).rejects.toThrow(/AWAITING_START/)
    expect(await catalog(workDb)).toEqual(snapshot) // nothing was dropped
    await withDb(workDb, (c) =>
      c.query(`UPDATE meetings SET status = 'UPLOADED' WHERE id = 'a0000000-0000-4000-8000-000000000003'`),
    )
  }, 60_000)

  it('partially applied + failed migration: deploy is blocked, down.sql unblocks it, re-apply succeeds', async () => {
    await runDown(workDb, NAME)
    // what a mid-file failure leaves: everything before the backfills, and a failed row
    const up = migrationSql(NAME)
    const partial = up.slice(0, up.indexOf('-- Backfill 1'))
    expect(partial).toContain('CREATE TYPE "ParticipantSide"')
    await withDb(workDb, async (c) => {
      await c.query(partial)
      await c.query(`INSERT INTO _prisma_migrations (id, checksum, migration_name, started_at, applied_steps_count)
                     VALUES (gen_random_uuid()::text, 'failed-midway', $1, now(), 0)`, [NAME])
    })
    const blocked = prismaCli(['migrate', 'deploy'], workDb)
    expect(blocked.status).not.toBe(0)

    await runDown(workDb, NAME)
    expect(await catalog(workDb)).toEqual(await catalog(refDb))

    const deploy = prismaCli(['migrate', 'deploy'], workDb)
    expect(deploy.status, deploy.out).toBe(0)
    const diff = noDrift(workDb)
    expect(diff.status, diff.out).toBe(0)
    expect((await oldRows(workDb)).meetings.map((m: { title: string }) => m.title)).toEqual([
      'down-1 edited',
      'down-2 failed',
      'down-3 waiting',
    ])
  }, 180_000)
})

/**
 * WP-BACKEND-01 — 20261008120000_meeting_workspace_not_null (AC-4) and its down.sql.
 * Seeds the state the previous release leaves behind (a meeting without workspace_id,
 * protocols without / with a stale latest version), applies the migration through Prisma,
 * then proves down.sql returns the exact post-WP-BACKEND-06 schema, also from a partially
 * applied, failed run. Same file as the WP-BACKEND-06 case on purpose: the two heavy
 * migration suites run one after the other, not in parallel.
 */
describe.skipIf(!DATABASE_URL)('20261008120000_meeting_workspace_not_null + down.sql', () => {
  const NAME7 = '20261008120000_meeting_workspace_not_null'
  const suffix = `${process.pid}_${Date.now()}`
  const workDb = `wp01_nn_${suffix}`
  const refDb = `wp01_ref_${suffix}`
  const M = {
    noWs: 'c0000000-0000-4000-8000-000000000001',
    stale: 'c0000000-0000-4000-8000-000000000002',
    noVersion: 'c0000000-0000-4000-8000-000000000003',
  }

  beforeAll(async () => {
    await createDatabases(workDb, refDb)
    // Reference = the schema after WP-BACKEND-06, before this migration
    expect(await replayMigrations(refDb, (m) => m < NAME7)).toHaveLength(6)
  }, 120_000)

  afterAll(async () => {
    if (DATABASE_URL) await dropDatabases(workDb, refDb)
  })

  it('AC-4: applies on a DB with a meeting without workspace — backfill, NOT NULL, no default, versions reconciled', async () => {
    expect(prismaCli(['migrate', 'deploy'], workDb).status).toBe(0)
    await runDown(workDb, NAME7) // → the previous release's schema, with its _prisma_migrations rows

    await withDb(workDb, (c) =>
      c.query(`INSERT INTO meetings (id, title, status, language, updated_at, workspace_id) VALUES
                 ('${M.noWs}', 'nn-1 no workspace', 'PROTOCOL_READY', 'RU', now(), NULL),
                 ('${M.stale}', 'nn-2 edited by old ui', 'EDITED', 'RU', now(), DEFAULT),
                 ('${M.noVersion}', 'nn-3 new by old worker', 'PROTOCOL_READY', 'EN', now(), DEFAULT);
               INSERT INTO protocols (id, meeting_id, markdown_content, edit_count, last_edited_at, updated_at) VALUES
                 (gen_random_uuid(), '${M.noWs}', '# one', 0, NULL, now()),
                 (gen_random_uuid(), '${M.stale}', '# edited later', 1, now(), now()),
                 (gen_random_uuid(), '${M.noVersion}', '# three', 0, NULL, now());
               INSERT INTO protocol_versions (id, meeting_id, n, kind, markdown) VALUES
                 (gen_random_uuid(), '${M.stale}', 1, 'GENERATED', '# generated');`),
    )

    const deploy = prismaCli(['migrate', 'deploy'], workDb)
    expect(deploy.status, deploy.out).toBe(0)
    const diff = noDrift(workDb)
    expect(diff.status, diff.out).toBe(0)

    await withDb(workDb, async (c) => {
      const ws = (await c.query(`SELECT DISTINCT workspace_id::text AS ws FROM meetings WHERE title LIKE 'nn-%'`)).rows
      expect(ws).toEqual([{ ws: LEGACY_WS }])
      const col = (await c.query(`SELECT is_nullable, column_default FROM information_schema.columns
                                  WHERE table_name = 'meetings' AND column_name = 'workspace_id'`)).rows
      expect(col).toEqual([{ is_nullable: 'NO', column_default: null }])
      const versions = (await c.query(`SELECT m.title, v.n, v.kind::text AS kind, v.markdown FROM protocol_versions v
                                       JOIN meetings m ON m.id = v.meeting_id WHERE m.title LIKE 'nn-%' ORDER BY 1, 2`)).rows
      expect(versions).toEqual([
        { title: 'nn-1 no workspace', n: 1, kind: 'GENERATED', markdown: '# one' },
        { title: 'nn-2 edited by old ui', n: 1, kind: 'GENERATED', markdown: '# generated' },
        { title: 'nn-2 edited by old ui', n: 2, kind: 'LEGACY', markdown: '# edited later' },
        { title: 'nn-3 new by old worker', n: 1, kind: 'GENERATED', markdown: '# three' },
      ])
      // the pre-program INSERT shape now fails loudly
      await expect(c.query(`INSERT INTO meetings (id, title, updated_at) VALUES (gen_random_uuid(), 'x', now())`)).rejects.toThrow()
    })
  }, 180_000)

  it('down.sql → exact post-WP-BACKEND-06 schema, rows kept, idempotent → re-apply without drift', async () => {
    const count = () =>
      withDb(workDb, async (c) => (await c.query(`SELECT count(*)::int AS n FROM meetings WHERE title LIKE 'nn-%'`)).rows[0].n)
    expect(await count()).toBe(3)
    await runDown(workDb, NAME7)
    expect(await catalog(workDb)).toEqual(await catalog(refDb))
    expect(await count()).toBe(3)
    await runDown(workDb, NAME7)
    expect(await catalog(workDb)).toEqual(await catalog(refDb))
    const deploy = prismaCli(['migrate', 'deploy'], workDb)
    expect(deploy.status, deploy.out).toBe(0)
    expect(noDrift(workDb).status).toBe(0)
  }, 180_000)

  it('partially applied + failed: deploy blocked → down.sql → catalog = previous → re-apply succeeds', async () => {
    await runDown(workDb, NAME7)
    const up = migrationSql(NAME7)
    // stop right before step 3: backfill and NOT NULL done, speaker_count missing
    const partial = up.slice(0, up.indexOf('-- AlterTable\nALTER TABLE "transcription_jobs"'))
    expect(partial).toContain('SET NOT NULL')
    expect(partial).toContain('UPDATE "meetings"')
    expect(partial).not.toContain('speaker_count" INTEGER')
    await withDb(workDb, async (c) => {
      await c.query(partial)
      await c.query(`INSERT INTO _prisma_migrations (id, checksum, migration_name, started_at, applied_steps_count)
                     VALUES (gen_random_uuid()::text, 'failed-midway', $1, now(), 0)`, [NAME7])
    })
    expect(prismaCli(['migrate', 'deploy'], workDb).status).not.toBe(0)
    await runDown(workDb, NAME7)
    expect(await catalog(workDb)).toEqual(await catalog(refDb))
    const deploy = prismaCli(['migrate', 'deploy'], workDb)
    expect(deploy.status, deploy.out).toBe(0)
    expect(noDrift(workDb).status).toBe(0)
  }, 180_000)
})
