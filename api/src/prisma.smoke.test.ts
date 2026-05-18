/**
 * TECH-003 — Integration smoke test
 * Verifies round-trip create+findFirst for each entity.
 * Requires a live DATABASE_URL to run; skipped automatically when env is absent.
 */
import { describe, it, expect, afterAll, beforeAll } from 'vitest'

const DATABASE_URL = process.env['DATABASE_URL']
const hasDb = Boolean(DATABASE_URL)

describe.skipIf(!hasDb)('Prisma smoke — round-trip per entity', () => {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  type PrismaClient = import('@prisma/client').PrismaClient

  let prisma: PrismaClient
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let pool: any

  beforeAll(async () => {
    const { PrismaClient } = await import('@prisma/client')
    const { PrismaPg } = await import('@prisma/adapter-pg')
    const { Pool } = await import('pg')
    pool = new Pool({ connectionString: DATABASE_URL })
    const adapter = new PrismaPg(pool)
    prisma = new PrismaClient({ adapter })
    await prisma.$connect()
  })

  afterAll(async () => {
    if (!prisma) return
    // Clean up all test rows to keep the DB tidy between runs
    await prisma.protocol.deleteMany()
    await prisma.protocolGenerationJob.deleteMany()
    await prisma.transcript.deleteMany()
    await prisma.transcriptionJob.deleteMany()
    await prisma.recording.deleteMany()
    await prisma.meeting.deleteMany()
    await prisma.$disconnect()
    await pool?.end()
  })

  it('Meeting — create + findFirst', async () => {
    const created = await prisma.meeting.create({
      data: { title: 'Smoke test meeting' },
    })
    const found = await prisma.meeting.findFirst({ where: { id: created.id } })
    expect(found?.title).toBe('Smoke test meeting')
    expect(found?.status).toBe('CREATED')
  })

  it('Recording — create + findFirst', async () => {
    const meeting = await prisma.meeting.create({
      data: { title: 'Meeting for recording smoke' },
    })
    const created = await prisma.recording.create({
      data: {
        meetingId: meeting.id,
        storageUri: 's3://transcrib/test.mp4',
        mimeType: 'VIDEO_MP4',
        sizeBytes: BigInt(1024 * 1024),
      },
    })
    const found = await prisma.recording.findFirst({ where: { id: created.id } })
    expect(found?.storageUri).toBe('s3://transcrib/test.mp4')
  })

  it('TranscriptionJob — create + findFirst', async () => {
    const meeting = await prisma.meeting.create({
      data: { title: 'Meeting for transcription job smoke' },
    })
    const created = await prisma.transcriptionJob.create({
      data: { meetingId: meeting.id },
    })
    const found = await prisma.transcriptionJob.findFirst({ where: { id: created.id } })
    expect(found?.status).toBe('PENDING')
  })

  it('Transcript — create + findFirst (JSONB fields)', async () => {
    const meeting = await prisma.meeting.create({
      data: { title: 'Meeting for transcript smoke' },
    })
    const speakerMap = { speaker_0: 'Alice', speaker_1: 'Bob' }
    const segments = [{ start: 0, end: 1.5, speaker: 'speaker_0', text: 'Hello' }]
    const created = await prisma.transcript.create({
      data: {
        meetingId: meeting.id,
        speakerMap,
        segmentsBlob: segments,
      },
    })
    const found = await prisma.transcript.findFirst({ where: { id: created.id } })
    expect(found?.speakerMap).toEqual(speakerMap)
    expect(found?.segmentsBlob).toEqual(segments)
  })

  it('ProtocolGenerationJob — create + findFirst', async () => {
    const meeting = await prisma.meeting.create({
      data: { title: 'Meeting for proto gen job smoke' },
    })
    const created = await prisma.protocolGenerationJob.create({
      data: { meetingId: meeting.id },
    })
    const found = await prisma.protocolGenerationJob.findFirst({ where: { id: created.id } })
    expect(found?.status).toBe('PENDING')
  })

  it('Protocol — create + findFirst', async () => {
    const meeting = await prisma.meeting.create({
      data: { title: 'Meeting for protocol smoke' },
    })
    const created = await prisma.protocol.create({
      data: {
        meetingId: meeting.id,
        markdownContent: '# Meeting Notes\n\n- Item 1',
      },
    })
    const found = await prisma.protocol.findFirst({ where: { id: created.id } })
    expect(found?.markdownContent).toContain('# Meeting Notes')
    expect(found?.version).toBe(1)
  })

  it('Cascade delete — deleting Meeting removes all children', async () => {
    const meeting = await prisma.meeting.create({
      data: { title: 'Meeting for cascade smoke' },
    })
    await prisma.recording.create({
      data: {
        meetingId: meeting.id,
        storageUri: 's3://transcrib/cascade.mp4',
        mimeType: 'VIDEO_MP4',
        sizeBytes: BigInt(512),
      },
    })
    await prisma.protocol.create({
      data: { meetingId: meeting.id, markdownContent: '# Cascade test' },
    })

    await prisma.meeting.delete({ where: { id: meeting.id } })

    const recording = await prisma.recording.findFirst({ where: { meetingId: meeting.id } })
    const protocol = await prisma.protocol.findFirst({ where: { meetingId: meeting.id } })
    expect(recording).toBeNull()
    expect(protocol).toBeNull()
  })
})
