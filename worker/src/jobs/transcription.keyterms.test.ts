/**
 * UC-200 / FR-004 — keyterms from the frozen meeting context reach IAsrProvider
 * (RQ-048, RQ-059). Flag off, no context or a draft context → the ASR input is the
 * pre-FR-004 one, with no `keyterms` key at all.
 */
import { describe, it, expect, vi, beforeEach, afterEach, type MockedFunction } from 'vitest'
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
import { createQueues } from '../queues.js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockPrisma = prisma as any

const MEETING_ID = '11111111-1111-4111-8111-111111111111'
const JOB_ID = '33333333-3333-4333-8333-333333333333'

const FROZEN_CONTEXT = {
  id: 'ctx-1',
  meetingId: MEETING_ID,
  meetingType: 'NEGOTIATION',
  goal: 'Подписать договор',
  agenda: null,
  participants: [
    { name: 'Мария Котова', aliases: ['Маша'], role: 'юрист', organization: 'ООО Ромашка', side: 'CLIENT', source: 'project', participant_id: null },
  ],
  glossary: [
    { term: 'NDA', variants: [], definition: null, asr_keyterm: true, source: 'meeting', term_id: null },
    { term: 'синергия', variants: [], definition: null, asr_keyterm: false, source: 'meeting', term_id: null },
  ],
  previousProtocol: { source: 'none' },
  notes: null,
  snapshotHash: 'f'.repeat(64),
}

function txJob(context: unknown) {
  return {
    id: JOB_ID,
    meetingId: MEETING_ID,
    status: 'PENDING',
    meeting: {
      id: MEETING_ID,
      language: 'RU',
      recording: { id: 'rec-1', storageUri: 's3://b/recordings/x.mp4' },
      context,
    },
  }
}

function setup(context: unknown) {
  mockPrisma.transcriptionJob.findUnique.mockResolvedValue(txJob(context))
  mockPrisma.transcriptionJob.updateMany.mockResolvedValue({ count: 1 })
  ;(createStorage as MockedFunction<typeof createStorage>).mockReturnValue({
    storageUriToKey: vi.fn().mockReturnValue('recordings/x.mp4'),
    getPresignedDownloadUrl: vi.fn().mockResolvedValue('https://s3/presigned'),
  } as never)
  ;(extractAudio as MockedFunction<typeof extractAudio>).mockReturnValue(Readable.from([Buffer.from('wav')]))
  mockPrisma.$transaction.mockImplementation(async (cb: (tx: unknown) => unknown) =>
    cb({
      transcript: { create: vi.fn().mockResolvedValue({ id: 'tr-1' }) },
      recording: { update: vi.fn() },
      meeting: { update: vi.fn() },
      transcriptionJob: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    }),
  )
  mockPrisma.protocolGenerationJob.create.mockResolvedValue({ id: 'pg-1' })
  ;(createQueues as MockedFunction<typeof createQueues>).mockReturnValue({
    protocolGenerationJob: { add: vi.fn(), close: vi.fn() },
  } as never)
  const asr = {
    transcribe: vi.fn().mockResolvedValue({ segments: [], detectedLanguage: 'ru', speakers: [], durationSec: 0 }),
  }
  return asr
}

function log() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as never
}

const job = { id: 'b-1', data: { transcription_job_id: JOB_ID, speaker_count: 2 } } as unknown as Job<{
  transcription_job_id: string
  speaker_count: number
}>

beforeEach(() => {
  vi.clearAllMocks()
})
afterEach(() => {
  vi.unstubAllEnvs()
})

describe('UC-200 keyterms (RQ-048 / RQ-059)', () => {
  it('flag on + frozen context → keyterms in priority order are passed to the ASR provider', async () => {
    vi.stubEnv('ASR_KEYTERMS_ENABLED', 'true')
    const asr = setup(FROZEN_CONTEXT)

    await processTranscriptionJob(job as never, log(), { asr, redisUrl: 'redis://x' })

    expect(asr.transcribe).toHaveBeenCalledOnce()
    expect(asr.transcribe.mock.calls[0]![0].keyterms).toEqual(['Мария Котова', 'Маша', 'ООО Ромашка', 'NDA'])
  })

  it('loads the meeting context together with the recording', async () => {
    vi.stubEnv('ASR_KEYTERMS_ENABLED', 'true')
    const asr = setup(FROZEN_CONTEXT)

    await processTranscriptionJob(job as never, log(), { asr, redisUrl: 'redis://x' })

    expect(mockPrisma.transcriptionJob.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ include: { meeting: { include: { recording: true, context: true } } } }),
    )
  })

  const NO_KEYTERMS: Array<[string, string | undefined, unknown]> = [
    ['flag unset (default off)', undefined, FROZEN_CONTEXT],
    ['flag false', 'false', FROZEN_CONTEXT],
    ['flag on, no context', 'true', null],
    ['flag on, draft context (snapshot_hash NULL)', 'true', { ...FROZEN_CONTEXT, snapshotHash: null }],
    ['flag on, frozen context without names or keyterm terms', 'true', { ...FROZEN_CONTEXT, participants: [], glossary: [] }],
  ]

  it.each(NO_KEYTERMS)('%s → ASR input identical to the pre-FR-004 one', async (_name, flag, context) => {
    if (flag !== undefined) vi.stubEnv('ASR_KEYTERMS_ENABLED', flag)
    else vi.stubEnv('ASR_KEYTERMS_ENABLED', undefined as unknown as string)
    const asr = setup(context)

    await processTranscriptionJob(job as never, log(), { asr, redisUrl: 'redis://x' })

    const input = asr.transcribe.mock.calls[0]![0]
    expect(Object.keys(input).sort()).toEqual(['audio', 'languageHint', 'speakerCount'])
    expect(input.languageHint).toBe('RU')
    expect(input.speakerCount).toBe(2)
  })

  it('a frozen context that fails the schema is ignored with a warning, the job still succeeds', async () => {
    vi.stubEnv('ASR_KEYTERMS_ENABLED', 'true')
    const asr = setup({ ...FROZEN_CONTEXT, participants: 'broken' })
    const logger = log() as unknown as { warn: ReturnType<typeof vi.fn> }

    await processTranscriptionJob(job as never, logger as never, { asr, redisUrl: 'redis://x' })

    expect('keyterms' in asr.transcribe.mock.calls[0]![0]).toBe(false)
    expect(logger.warn).toHaveBeenCalled()
    expect(mockPrisma.$transaction).toHaveBeenCalledOnce()
  })
})
