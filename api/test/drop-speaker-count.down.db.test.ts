/**
 * WP-BACKEND-08 — 20261009130000_drop_speaker_count and its down.sql (D-43).
 * Pattern: api/test/awaiting-speakers.down.db.test.ts (throw-away databases, catalog comparison).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import {
  DATABASE_URL,
  catalog,
  createDatabases,
  dropDatabases,
  noDrift,
  prismaCli,
  replayMigrations,
  runDown,
  withDb,
} from './helpers/db.js'

const NAME = '20261009130000_drop_speaker_count'

const hasColumn = (db: string) =>
  withDb(db, async (c) =>
    (await c.query(`SELECT 1 FROM information_schema.columns WHERE table_name = 'transcription_jobs' AND column_name = 'speaker_count'`)).rows.length === 1,
  )

describe.skipIf(!DATABASE_URL)('20261009130000_drop_speaker_count + down.sql', () => {
  const suffix = `${process.pid}_${Date.now()}`
  const workDb = `wp08_sc_${suffix}`
  const refDb = `wp08_ref_${suffix}`

  beforeAll(async () => {
    await createDatabases(workDb, refDb)
    await replayMigrations(refDb, (m) => m < NAME)
  }, 120_000)

  afterAll(async () => {
    if (DATABASE_URL) await dropDatabases(workDb, refDb)
  })

  it('applies: column gone, no drift', async () => {
    const deploy = prismaCli(['migrate', 'deploy'], workDb)
    expect(deploy.status, deploy.out).toBe(0)
    expect(noDrift(workDb).status).toBe(0)
    expect(await hasColumn(workDb)).toBe(false)
  }, 180_000)

  it('down.sql → exact previous schema, idempotent → re-apply without drift', async () => {
    await runDown(workDb, NAME)
    expect(await hasColumn(workDb)).toBe(true)
    expect(await catalog(workDb)).toEqual(await catalog(refDb))
    await runDown(workDb, NAME)
    expect(await catalog(workDb)).toEqual(await catalog(refDb))

    const again = prismaCli(['migrate', 'deploy'], workDb)
    expect(again.status, again.out).toBe(0)
    expect(noDrift(workDb).status).toBe(0)
    expect(await hasColumn(workDb)).toBe(false)
  }, 180_000)
})
