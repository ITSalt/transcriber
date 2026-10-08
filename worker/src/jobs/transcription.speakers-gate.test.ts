/**
 * UC-200 / WP-WORKER-06 (D-38) — a meeting with a frozen context stops at AWAITING_SPEAKERS:
 * no ProtocolGenerationJob is created or enqueued, the SSE event carries the new status.
 * Without a frozen context the pre-program flow (TRANSCRIBED → job) is unchanged.
 */
import { describe, it, expect, vi, beforeEach, type MockedFunction } from 'vitest'
import type { Job } from 'bullmq'
import { Readable } from 'node:stream'

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    transcriptionJob: { findUnique: vi.fn(), updateMany: vi.fn() },
    protocolGenerationJob: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}))
vi.mock('../lib/storage.js', () => ({ createStorage: vi.fn() }))
vi.mock('../lib/ffmpeg.js', () => ({ extractAudio: vi.fn() }))
vi.mock('../lib/publisher.js', () => ({ publishMeetingEvent: vi.fn() }))
vi.mock('../queues.js', () => ({
  QueueName: { Transcription: 'transcriptionJob', Protocol: 'protocolGenerationJob' },
  createQueues: vi.fn(),
}))

import { processTranscriptionJob } from './transcription.js'
import { prisma } from '../lib/prisma.js'
import { createStorage } from '../lib/storage.js'
import { extractAudio } from '../lib/ffmpeg.js'
import { publishMeetingEvent } from '../lib/publisher.js'
import { createQueues } from '../queues.js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockPrisma = prisma as any

const MEETING_ID = '11111111-1111-4111-8111-111111111111'
const JOB_ID = '33333333-3333-4333-8333-333333333333'

const job = { id: 'b-1', data: { transcription_job_id: JOB_ID } } as unknown as Job<{ transcription_job_id: string }>

function setup(context: unknown) {
  mockPrisma.transcriptionJob.findUnique.mockResolvedValue({
    id: JOB_ID,
    meetingId: MEETING_ID,
    status: 'PENDING',
    meeting: { id: MEETING_ID, language: 'RU', recording: { id: 'rec-1', storageUri: 's3://b/x.mp4' }, context },
  })
  mockPrisma.transcriptionJob.updateMany.mockResolvedValue({ count: 1 })
  ;(createStorage as MockedFunction<typeof createStorage>).mockReturnValue({
    storageUriToKey: vi.fn().mockReturnValue('x.mp4'),
    getPresignedDownloadUrl: vi.fn().mockResolvedValue('https://s3/p'),
  } as never)
  ;(extractAudio as MockedFunction<typeof extractAudio>).mockReturnValue(Readable.from([Buffer.from('wav')]))
  const meetingUpdate = vi.fn()
  mockPrisma.$transaction.mockImplementation(async (cb: (tx: unknown) => unknown) =>
    cb({
      transcript: { create: vi.fn().mockResolvedValue({ id: 'tr-1' }) },
      recording: { update: vi.fn() },
      meeting: { update: meetingUpdate },
      transcriptionJob: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    }),
  )
  mockPrisma.protocolGenerationJob.create.mockResolvedValue({ id: 'pg-1' })
  const add = vi.fn()
  ;(createQueues as MockedFunction<typeof createQueues>).mockReturnValue({
    protocolGenerationJob: { add, close: vi.fn() },
  } as never)
  const asr = {
    transcribe: vi.fn().mockResolvedValue({
      segments: [{ start: 0, end: 2, text: 'Привет', speaker: 'SPEAKER_0' }],
      detectedLanguage: 'ru',
      speakers: ['SPEAKER_0'],
      durationSec: 2,
    }),
  }
  return { asr, meetingUpdate, add }
}

const log = () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }) as never

beforeEach(() => vi.clearAllMocks())

describe('UC-200 speakers gate (WP-WORKER-06)', () => {
  it('frozen context → AWAITING_SPEAKERS, no generation job, no enqueue, SSE with the new status', async () => {
    const { asr, meetingUpdate, add } = setup({ snapshotHash: 'f'.repeat(64) })

    await processTranscriptionJob(job as never, log(), { asr, redisUrl: 'redis://x' })

    expect(meetingUpdate).toHaveBeenCalledWith({ where: { id: MEETING_ID }, data: { status: 'AWAITING_SPEAKERS' } })
    expect(mockPrisma.protocolGenerationJob.create).not.toHaveBeenCalled()
    expect(add).not.toHaveBeenCalled()
    expect(publishMeetingEvent).toHaveBeenCalledWith(
      'redis://x',
      { type: 'meeting.status', meeting_id: MEETING_ID, status: 'AWAITING_SPEAKERS', error_reason: null },
      MEETING_ID,
    )
  })

  it.each([
    ['no context row', null],
    ['draft context (snapshot_hash NULL)', { snapshotHash: null }],
  ])('%s → the old flow: TRANSCRIBED, job created and enqueued', async (_name, context) => {
    const { asr, meetingUpdate, add } = setup(context)

    await processTranscriptionJob(job as never, log(), { asr, redisUrl: 'redis://x' })

    expect(meetingUpdate).toHaveBeenCalledWith({ where: { id: MEETING_ID }, data: { status: 'TRANSCRIBED' } })
    expect(mockPrisma.protocolGenerationJob.create).toHaveBeenCalledOnce()
    expect(add).toHaveBeenCalledWith('generateProtocol', { protocol_generation_job_id: 'pg-1' })
    expect(publishMeetingEvent).toHaveBeenCalledWith(
      'redis://x',
      expect.objectContaining({ status: 'TRANSCRIBED' }),
      MEETING_ID,
    )
  })
})
