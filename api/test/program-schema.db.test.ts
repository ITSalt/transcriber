/**
 * WP-BACKEND-06 AC-1 — program schema v1 on a migrated database.
 * Requires DATABASE_URL (CI applies `migrate deploy` first); skipped otherwise.
 *
 * Everything runs inside ONE interactive transaction that is rolled back at the end, so
 * the rows are invisible to (and safe from) prisma.smoke.test.ts running in parallel.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { LEGACY_WORKSPACE_ID, LEGACY_WORKSPACE_NAME } from '@transcrib/shared'

const DATABASE_URL = process.env['DATABASE_URL']
const MIGRATION = new URL('../prisma/migrations/20261007120000_program_product_schema/migration.sql', import.meta.url)

class Rollback extends Error {}

describe.skipIf(!DATABASE_URL)('program schema v1 (migration 20261007120000)', () => {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  let prisma: import('@prisma/client').PrismaClient
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let pool: any

  beforeAll(async () => {
    const { PrismaClient } = await import('@prisma/client')
    const { PrismaPg } = await import('@prisma/adapter-pg')
    const { Pool } = await import('pg')
    pool = new Pool({ connectionString: DATABASE_URL })
    prisma = new PrismaClient({ adapter: new PrismaPg(pool) })
  })

  afterAll(async () => {
    await prisma?.$disconnect()
    await pool?.end()
  })

  /** Run fn in a transaction that is always rolled back. */
  async function inRollback(fn: (tx: typeof prisma) => Promise<void>): Promise<void> {
    await expect(
      prisma.$transaction(async (tx) => {
        await fn(tx as unknown as typeof prisma)
        throw new Rollback()
      }, { timeout: 20_000 }),
    ).rejects.toBeInstanceOf(Rollback)
  }

  it('the legacy workspace «Роман» exists with the fixed id (D-7)', async () => {
    const ws = await prisma.workspace.findUnique({ where: { id: LEGACY_WORKSPACE_ID } })
    expect(ws).toMatchObject({ name: LEGACY_WORKSPACE_NAME, personal: true })
  })

  it('a meeting inserted the pre-program way (no workspaceId) lands in «Роман»', async () => {
    await inRollback(async (tx) => {
      const m = await tx.meeting.create({ data: { title: 'pre-program insert' } })
      expect(m.workspaceId).toBe(LEGACY_WORKSPACE_ID)
      expect(m.projectId).toBeNull()
    })
  })

  it('backfill SQL is idempotent and maps editCount → LEGACY / GENERATED', async () => {
    const sql = readFileSync(MIGRATION, 'utf8')
    const backfill = sql.slice(sql.indexOf('INSERT INTO "protocol_versions"'))
    const wsUpdate = sql.slice(sql.indexOf('UPDATE "meetings"'), sql.indexOf('-- AddForeignKey'))
    await inRollback(async (tx) => {
      const a = await tx.meeting.create({ data: { title: 'never edited' } })
      const b = await tx.meeting.create({ data: { title: 'edited' } })
      await tx.$executeRawUnsafe(`UPDATE meetings SET workspace_id = NULL WHERE id = $1::uuid`, b.id)
      await tx.protocol.create({ data: { meetingId: a.id, markdownContent: '# A' } })
      await tx.protocol.create({ data: { meetingId: b.id, markdownContent: '# B edited', editCount: 2, lastEditedAt: new Date('2026-09-03T10:00:00Z') } })
      await tx.$executeRawUnsafe(wsUpdate)
      await tx.$executeRawUnsafe(backfill)
      await tx.$executeRawUnsafe(backfill) // second run must not duplicate or fail
      const versions = await tx.protocolVersion.findMany({ where: { meetingId: { in: [a.id, b.id] } }, orderBy: { kind: 'asc' } })
      expect(versions.map((v) => [v.meetingId, v.n, v.kind, v.markdown])).toEqual(
        expect.arrayContaining([
          [a.id, 1, 'GENERATED', '# A'],
          [b.id, 1, 'LEGACY', '# B edited'],
        ]),
      )
      expect(versions).toHaveLength(2)
      expect(versions.find((v) => v.meetingId === b.id)!.createdAt.toISOString()).toBe('2026-09-03T10:00:00.000Z')
      expect((await tx.meeting.findUnique({ where: { id: b.id } }))!.workspaceId).toBe(LEGACY_WORKSPACE_ID)
    })
  })

  it('deleting a meeting cascades through every new meeting-scoped table (old UC-003 keeps working)', async () => {
    await inRollback(async (tx) => {
      const user = await tx.user.create({ data: { name: 'U', pinLookup: `lookup2-${Date.now()}`, pinHash: 'scrypt$x' } })
      const m = await tx.meeting.create({ data: { title: 'cascade' } })
      const gen = await tx.protocolGeneration.create({ data: { meetingId: m.id, kind: 'MEMORY_EXTRACT', model: 'm', promptVersion: 'v' } })
      await tx.meetingContext.create({ data: { meetingId: m.id } })
      await tx.protocolVersion.create({ data: { meetingId: m.id, n: 1, kind: 'GENERATED', markdown: '#', generationId: gen.id } })
      await tx.protocolFeedback.create({ data: { meetingId: m.id, workspaceId: LEGACY_WORKSPACE_ID, userId: user.id, protocolVersionN: 1, kind: 'COMMENT', category: 'STYLE', text: 't' } })
      await tx.meeting.delete({ where: { id: m.id } })
      expect(await tx.meetingContext.count({ where: { meetingId: m.id } })).toBe(0)
      expect(await tx.protocolGeneration.count({ where: { meetingId: m.id } })).toBe(0)
      expect(await tx.protocolVersion.count({ where: { meetingId: m.id } })).toBe(0)
      expect(await tx.protocolFeedback.count({ where: { meetingId: m.id } })).toBe(0)
    })
  })

  it('unique constraints: pinLookup, tokenHash, membership, (meetingId, n), loginBlock.clientKey', async () => {
    await inRollback(async (tx) => {
      const u = await tx.user.create({ data: { name: 'A', pinLookup: 'same', pinHash: 'h' } })
      await expect(tx.$executeRawUnsafe(
        `INSERT INTO users (id, name, pin_lookup, pin_hash) VALUES (gen_random_uuid(), 'B', 'same', 'h') ON CONFLICT (pin_lookup) DO NOTHING`,
      )).resolves.toBe(0)
      await tx.membership.create({ data: { userId: u.id, workspaceId: LEGACY_WORKSPACE_ID } })
      await expect(tx.$executeRawUnsafe(
        `INSERT INTO memberships (id, user_id, workspace_id) VALUES (gen_random_uuid(), $1::uuid, $2::uuid) ON CONFLICT (user_id, workspace_id) DO NOTHING`,
        u.id, LEGACY_WORKSPACE_ID,
      )).resolves.toBe(0)
      await tx.authSession.create({ data: { userId: u.id, tokenHash: 't1', expiresAt: new Date(Date.now() + 86_400_000) } })
      await expect(tx.$executeRawUnsafe(
        `INSERT INTO auth_sessions (id, user_id, token_hash, expires_at) VALUES (gen_random_uuid(), $1::uuid, 't1', now()) ON CONFLICT (token_hash) DO NOTHING`,
        u.id,
      )).resolves.toBe(0)
      await tx.loginBlock.create({ data: { clientKey: '*' } })
      await expect(tx.$executeRawUnsafe(
        `INSERT INTO login_blocks (id, client_key, updated_at) VALUES (gen_random_uuid(), '*', now()) ON CONFLICT (client_key) DO NOTHING`,
      )).resolves.toBe(0)
      const m = await tx.meeting.create({ data: { title: 'versions', status: 'AWAITING_START' } })
      await tx.protocolVersion.create({ data: { meetingId: m.id, n: 1, kind: 'GENERATED', markdown: '#' } })
      await expect(tx.$executeRawUnsafe(
        `INSERT INTO protocol_versions (id, meeting_id, n, kind, markdown) VALUES (gen_random_uuid(), $1::uuid, 1, 'USER_EDIT', 'dup') ON CONFLICT (meeting_id, n) DO NOTHING`,
        m.id,
      )).resolves.toBe(0)
      const out = await tx.graphOutbox.create({ data: { op: 'DELETE_MEETING', payload: { meeting_id: 'x' } } })
      expect(out).toMatchObject({ attempts: 0, doneAt: null, lastError: null })
    })
  })
})
