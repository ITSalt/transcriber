/**
 * WP-BACKEND-07 — 20261009120000_awaiting_speakers and its down.sql (D-38).
 * ADD VALUE of an enum is irreversible in Postgres: down.sql recreates MeetingStatus and
 * must refuse (changing nothing) while a meeting is still in AWAITING_SPEAKERS.
 * Pattern: api/test/migrations.down.db.test.ts (throw-away databases, catalog comparison).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import {
  DATABASE_URL,
  catalog,
  createDatabases,
  dropDatabases,
  migrationSql,
  noDrift,
  prismaCli,
  replayMigrations,
  runDown,
  withDb,
} from './helpers/db.js'

const NAME = '20261009120000_awaiting_speakers'
const M = 'd0000000-0000-4000-8000-000000000001'
const LEGACY = '00000000-0000-4000-8000-000000000001'

describe.skipIf(!DATABASE_URL)('20261009120000_awaiting_speakers + down.sql', () => {
  const suffix = `${process.pid}_${Date.now()}`
  const workDb = `wp07_sp_${suffix}`
  const refDb = `wp07_ref_${suffix}`

  beforeAll(async () => {
    await createDatabases(workDb, refDb)
    // Reference = the schema before this migration
    await replayMigrations(refDb, (m) => m < NAME || m === '20261009130000_drop_speaker_count')
  }, 120_000)

  afterAll(async () => {
    if (DATABASE_URL) await dropDatabases(workDb, refDb)
  })

  it('applies: new status + two transcript columns, no drift', async () => {
    const deploy = prismaCli(['migrate', 'deploy'], workDb)
    expect(deploy.status, deploy.out).toBe(0)
    expect(noDrift(workDb).status).toBe(0)
    await withDb(workDb, async (c) => {
      await c.query(`INSERT INTO meetings (id, title, status, language, updated_at, workspace_id)
                     VALUES ('${M}', 'sp-1', 'AWAITING_SPEAKERS', 'RU', now(), '${LEGACY}');
                     INSERT INTO transcripts (id, meeting_id, speaker_map, speaker_mapping, speakers_confirmed_at, updated_at)
                     VALUES (gen_random_uuid(), '${M}', '{"SPEAKER_0":"A"}', '{"action":"skip","mapping":[]}', now(), now());`)
      const cols = (await c.query(`SELECT column_name, data_type, is_nullable FROM information_schema.columns
                                   WHERE table_name = 'transcripts' AND column_name IN ('speaker_mapping','speakers_confirmed_at') ORDER BY 1`)).rows
      expect(cols).toEqual([
        { column_name: 'speaker_mapping', data_type: 'jsonb', is_nullable: 'YES' },
        { column_name: 'speakers_confirmed_at', data_type: 'timestamp without time zone', is_nullable: 'YES' },
      ])
    })
  }, 180_000)

  it('down.sql refuses atomically while a meeting is in AWAITING_SPEAKERS', async () => {
    const snapshot = await catalog(workDb)
    await expect(runDown(workDb, NAME)).rejects.toThrow(/AWAITING_SPEAKERS/)
    expect(await catalog(workDb)).toEqual(snapshot)
  }, 60_000)

  it('down.sql → exact previous schema, meetings kept, idempotent → re-apply without drift', async () => {
    await withDb(workDb, (c) => c.query(`UPDATE meetings SET status = 'TRANSCRIBED' WHERE id = '${M}'`))
    await runDown(workDb, NAME)
    expect(await catalog(workDb)).toEqual(await catalog(refDb))
    await withDb(workDb, async (c) => {
      expect((await c.query(`SELECT status::text AS status FROM meetings WHERE id = '${M}'`)).rows).toEqual([{ status: 'TRANSCRIBED' }])
      const rows = (await c.query(`SELECT migration_name FROM _prisma_migrations`)).rows
      expect(rows.map((r: { migration_name: string }) => r.migration_name)).not.toContain(NAME)
    })
    await runDown(workDb, NAME)
    expect(await catalog(workDb)).toEqual(await catalog(refDb))

    const again = prismaCli(['migrate', 'deploy'], workDb)
    expect(again.status, again.out).toBe(0)
    expect(noDrift(workDb).status).toBe(0)
  }, 180_000)

  it('partially applied + failed: deploy blocked → down.sql → catalog = previous → re-apply succeeds', async () => {
    await runDown(workDb, NAME)
    // what a mid-file failure leaves: the enum value and the first column, then a failed row
    const up = migrationSql(NAME)
    const cut = up.indexOf('ALTER TABLE "transcripts" ADD COLUMN IF NOT EXISTS "speakers_confirmed_at"')
    expect(cut).toBeGreaterThan(0)
    const statements = up
      .slice(0, cut)
      .split('\n')
      .filter((l) => !l.startsWith('--'))
      .join('\n')
      .split(';')
      .map((s) => s.trim())
      .filter(Boolean)
    expect(statements).toHaveLength(2)
    await withDb(workDb, async (c) => {
      for (const stmt of statements) await c.query(stmt)
      await c.query(`INSERT INTO _prisma_migrations (id, checksum, migration_name, started_at, applied_steps_count)
                     VALUES (gen_random_uuid()::text, 'failed-midway', $1, now(), 0)`, [NAME])
    })
    expect(prismaCli(['migrate', 'deploy'], workDb).status).not.toBe(0)
    await runDown(workDb, NAME)
    expect(await catalog(workDb)).toEqual(await catalog(refDb))
    const deploy = prismaCli(['migrate', 'deploy'], workDb)
    expect(deploy.status, deploy.out).toBe(0)
    expect(noDrift(workDb).status).toBe(0)
  }, 180_000)
})
