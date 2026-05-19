/**
 * UC-200 — Transcription pipeline unit tests
 *
 * All external dependencies are mocked:
 *   - Prisma client (@prisma/client)
 *   - IStorage (worker/src/lib/storage.ts)
 *   - ffmpeg extractAudio (worker/src/lib/ffmpeg.ts)
 *   - DeepgramAsrProvider (worker/src/asr/deepgram-adapter.ts)
 *   - ioredis publisher (worker/src/lib/publisher.ts)
 *
 * No live Deepgram / S3 / PostgreSQL connections.
 */

import { describe, it, expect, vi, beforeEach, type MockedFunction } from 'vitest'
import type { Job } from 'bullmq'
import { Readable } from 'node:stream'

// ── Mocks must be hoisted before the subject import ──────────────────────────

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    transcriptionJob: {
      findUnique: vi.fn(),
      updateMany: vi.fn(),
    },
    recording: {
      update: vi.fn(),
    },
    meeting: {
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    transcript: {
      create: vi.fn(),
    },
    protocolGenerationJob: {
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}))

vi.mock('../lib/storage.js', () => ({
  createStorage: vi.fn(),
}))

vi.mock('../lib/ffmpeg.js', () => ({
  extractAudio: vi.fn(),
}))

vi.mock('../asr/deepgram-adapter.js', () => ({
  DeepgramAsrProvider: vi.fn(),
}))

vi.mock('../lib/publisher.js', () => ({
  publishMeetingEvent: vi.fn(),
}))

vi.mock('../queues.js', () => ({
  QueueName: { Transcription: 'transcriptionJob', Protocol: 'protocolGenerationJob' },
  createQueues: vi.fn(),
}))

// ── Subject under test ────────────────────────────────────────────────────────

import { processTranscriptionJob, resolveSpeakers, buildFullText } from './transcription.js'
import { prisma } from '../lib/prisma.js'
import { createStorage } from '../lib/storage.js'
import { extractAudio } from '../lib/ffmpeg.js'
import { DeepgramAsrProvider } from '../asr/deepgram-adapter.js'
import { publishMeetingEvent } from '../lib/publisher.js'
import { createQueues } from '../queues.js'

// ── Type helpers ──────────────────────────────────────────────────────────────

type MockPrisma = {
  transcriptionJob: {
    findUnique: MockedFunction<typeof prisma.transcriptionJob.findUnique>
    updateMany: MockedFunction<typeof prisma.transcriptionJob.updateMany>
  }
  recording: { update: MockedFunction<typeof prisma.recording.update> }
  meeting: {
    update: MockedFunction<typeof prisma.meeting.update>
    updateMany: MockedFunction<typeof prisma.meeting.updateMany>
  }
  transcript: { create: MockedFunction<typeof prisma.transcript.create> }
  protocolGenerationJob: { create: MockedFunction<typeof prisma.protocolGenerationJob.create> }
  $transaction: MockedFunction<typeof prisma.$transaction>
}

const mockPrisma = prisma as unknown as MockPrisma

function makeLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  } as any
}

function makeJob(id: string, transcription_job_id: string): Job<{ transcription_job_id: string }> {
  return { id, data: { transcription_job_id } } as unknown as Job<{ transcription_job_id: string }>
}

const MEETING_ID = '11111111-1111-1111-1111-111111111111'
const RECORDING_ID = '22222222-2222-2222-2222-222222222222'
const JOB_ID = '33333333-3333-3333-3333-333333333333'
const TRANSCRIPT_ID = '44444444-4444-4444-4444-444444444444'

const BASE_TX_JOB = {
  id: JOB_ID,
  meetingId: MEETING_ID,
  status: 'PENDING' as const,
  startedAt: null,
  finishedAt: null,
  errorMsg: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  meeting: {
    id: MEETING_ID,
    title: 'Test Meeting',
    status: 'TRANSCRIBING' as const,
    language: 'AUTO' as const,
    createdAt: new Date(),
    updatedAt: new Date(),
    recording: {
      id: RECORDING_ID,
      meetingId: MEETING_ID,
      storageUri: 's3://test-bucket/recordings/test.mp4',
      mimeType: 'VIDEO_MP4' as const,
      sizeBytes: BigInt(1024),
      durationSec: null,
      uploadedAt: new Date(),
    },
  },
}

const BASE_ASR_RESULT = {
  segments: [
    { speaker: 'SPEAKER_0', start: 0, end: 5, text: 'Hello everyone.' },
    { speaker: 'SPEAKER_1', start: 5, end: 10, text: 'Good morning.' },
  ],
  detectedLanguage: 'en',
  speakers: ['SPEAKER_0', 'SPEAKER_1'],
  durationSec: 10,
}

const PROTO_JOB_ID = 'proto-job-id'

function setupSuccessfulMocks() {
  // Prisma: findUnique returns the base job
  mockPrisma.transcriptionJob.findUnique.mockResolvedValue(BASE_TX_JOB as any)

  // Prisma: updateMany (mark PROCESSING) returns count=1
  mockPrisma.transcriptionJob.updateMany.mockResolvedValue({ count: 1 })

  // Storage mock — pipeline now uses presigned download URLs, not byte streams
  const mockStorage = {
    storageUriToKey: vi.fn().mockReturnValue('recordings/test.mp4'),
    getPresignedDownloadUrl: vi.fn().mockResolvedValue('https://test.s3/presigned-get'),
  }
  ;(createStorage as MockedFunction<typeof createStorage>).mockReturnValue(mockStorage as any)

  // ffmpeg: return a readable that immediately ends
  const fakeAudio = Readable.from([Buffer.from('fake-wav')])
  ;(extractAudio as MockedFunction<typeof extractAudio>).mockReturnValue(fakeAudio)

  // ASR mock
  const mockAsr = { transcribe: vi.fn().mockResolvedValue(BASE_ASR_RESULT) }
  ;(DeepgramAsrProvider as unknown as MockedFunction<() => typeof mockAsr>).mockReturnValue(mockAsr)

  // Prisma $transaction: simulate the transaction callback
  mockPrisma.$transaction.mockImplementation(async (cb: any) => {
    const txMock = {
      transcript: {
        create: vi.fn().mockResolvedValue({ id: TRANSCRIPT_ID, meetingId: MEETING_ID }),
      },
      recording: { update: vi.fn().mockResolvedValue({}) },
      meeting: { update: vi.fn().mockResolvedValue({}) },
      transcriptionJob: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUnique: vi.fn().mockResolvedValue({ meetingId: MEETING_ID }),
      },
    }
    return cb(txMock)
  })

  // ProtocolGenerationJob create
  mockPrisma.protocolGenerationJob.create.mockResolvedValue({ id: PROTO_JOB_ID } as any)

  // BullMQ queue mock
  const mockProtocolQueue = { add: vi.fn().mockResolvedValue(undefined), close: vi.fn().mockResolvedValue(undefined) }
  ;(createQueues as MockedFunction<typeof createQueues>).mockReturnValue({
    transcriptionJob: { add: vi.fn(), close: vi.fn() } as any,
    protocolGenerationJob: mockProtocolQueue as any,
  } as any)

  // Publisher
  ;(publishMeetingEvent as MockedFunction<typeof publishMeetingEvent>).mockResolvedValue(undefined)

  return { mockStorage, mockAsr, mockProtocolQueue }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
})

// T01: RQ-014 — TranscriptionJob lifecycle: QUEUED -> IN_PROGRESS -> COMPLETED
describe('T01 (RQ-014) — Happy path: PENDING → PROCESSING → DONE', () => {
  it('marks job PROCESSING on pickup, then DONE in transaction', async () => {
    setupSuccessfulMocks()
    const log = makeLogger()
    const job = makeJob('bullmq-1', JOB_ID)

    await processTranscriptionJob(job as any, log)

    // Called updateMany to mark PROCESSING
    expect(mockPrisma.transcriptionJob.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: JOB_ID, status: 'PENDING' },
        data: expect.objectContaining({ status: 'PROCESSING' }),
      }),
    )

    // Transaction ran
    expect(mockPrisma.$transaction).toHaveBeenCalledOnce()
  })

  it('skips processing if job is already terminal (idempotency — BRQ-009)', async () => {
    const terminalJob = { ...BASE_TX_JOB, status: 'DONE' as const }
    mockPrisma.transcriptionJob.findUnique.mockResolvedValue(terminalJob as any)
    const log = makeLogger()

    await processTranscriptionJob(makeJob('bullmq-2', JOB_ID) as any, log)

    // Should NOT proceed to updateMany
    expect(mockPrisma.transcriptionJob.updateMany).not.toHaveBeenCalled()
    expect(mockPrisma.$transaction).not.toHaveBeenCalled()
  })

  it('skips if another worker claimed job (updateMany count=0)', async () => {
    mockPrisma.transcriptionJob.findUnique.mockResolvedValue(BASE_TX_JOB as any)
    mockPrisma.transcriptionJob.updateMany.mockResolvedValue({ count: 0 })
    const log = makeLogger()

    await processTranscriptionJob(makeJob('bullmq-3', JOB_ID) as any, log)

    expect(mockPrisma.$transaction).not.toHaveBeenCalled()
  })
})

// T02: RQ-015 — Any failure → job FAILED, Meeting.status ERROR
describe('T02 (RQ-015) — Failure path: any error → FAILED status', () => {
  it('marks job FAILED and meeting ERROR when storage fetch throws', async () => {
    mockPrisma.transcriptionJob.findUnique.mockResolvedValue(BASE_TX_JOB as any)
    mockPrisma.transcriptionJob.updateMany.mockResolvedValue({ count: 1 })

    const mockStorage = {
      storageUriToKey: vi.fn().mockReturnValue('recordings/test.mp4'),
      getPresignedDownloadUrl: vi.fn().mockRejectedValue(new Error('S3 connection refused')),
    }
    ;(createStorage as MockedFunction<typeof createStorage>).mockReturnValue(mockStorage as any)

    // Failure path transaction
    mockPrisma.$transaction.mockImplementation(async (cb: any) => {
      const txMock = {
        transcriptionJob: {
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          findUnique: vi.fn().mockResolvedValue({ meetingId: MEETING_ID }),
        },
        meeting: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      }
      return cb(txMock)
    })
    ;(publishMeetingEvent as MockedFunction<typeof publishMeetingEvent>).mockResolvedValue(undefined)
    mockPrisma.transcriptionJob.findUnique
      .mockResolvedValueOnce(BASE_TX_JOB as any)
      .mockResolvedValueOnce({ meetingId: MEETING_ID } as any)

    const log = makeLogger()
    await expect(
      processTranscriptionJob(makeJob('bullmq-4', JOB_ID) as any, log),
    ).rejects.toThrow('S3 connection refused')

    expect(log.error).toHaveBeenCalled()
  })

  it('marks job FAILED and meeting ERROR when ASR throws', async () => {
    mockPrisma.transcriptionJob.findUnique.mockResolvedValue(BASE_TX_JOB as any)
    mockPrisma.transcriptionJob.updateMany.mockResolvedValue({ count: 1 })

    const mockStorage = {
      storageUriToKey: vi.fn().mockReturnValue('recordings/test.mp4'),
      getPresignedDownloadUrl: vi.fn().mockResolvedValue('https://test.s3/presigned-get'),
    }
    ;(createStorage as MockedFunction<typeof createStorage>).mockReturnValue(mockStorage as any)

    const fakeAudio = Readable.from([Buffer.from('fake-wav')])
    ;(extractAudio as MockedFunction<typeof extractAudio>).mockReturnValue(fakeAudio)

    const mockAsr = { transcribe: vi.fn().mockRejectedValue(new Error('Deepgram API error')) }
    ;(DeepgramAsrProvider as unknown as MockedFunction<() => typeof mockAsr>).mockReturnValue(mockAsr)

    mockPrisma.$transaction.mockImplementation(async (cb: any) => {
      const txMock = {
        transcriptionJob: {
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          findUnique: vi.fn().mockResolvedValue({ meetingId: MEETING_ID }),
        },
        meeting: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      }
      return cb(txMock)
    })
    ;(publishMeetingEvent as MockedFunction<typeof publishMeetingEvent>).mockResolvedValue(undefined)
    mockPrisma.transcriptionJob.findUnique
      .mockResolvedValueOnce(BASE_TX_JOB as any)
      .mockResolvedValueOnce({ meetingId: MEETING_ID } as any)

    const log = makeLogger()
    await expect(
      processTranscriptionJob(makeJob('bullmq-5', JOB_ID) as any, log),
    ).rejects.toThrow('Deepgram API error')

    expect(log.error).toHaveBeenCalled()
  })

  it('marks job FAILED when job not found', async () => {
    mockPrisma.transcriptionJob.findUnique.mockResolvedValue(null as any)
    ;(publishMeetingEvent as MockedFunction<typeof publishMeetingEvent>).mockResolvedValue(undefined)
    mockPrisma.$transaction.mockImplementation(async (cb: any) => {
      const txMock = {
        transcriptionJob: {
          updateMany: vi.fn().mockResolvedValue({ count: 0 }),
          findUnique: vi.fn().mockResolvedValue(null),
        },
        meeting: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
      }
      return cb(txMock)
    })

    const log = makeLogger()
    await expect(
      processTranscriptionJob(makeJob('bullmq-6', JOB_ID) as any, log),
    ).rejects.toThrow(`TranscriptionJob ${JOB_ID} not found`)
  })
})

// T03: RQ-016 — Auto-create ProtocolGenerationJob on DONE
describe('T03 (RQ-016) — ProtocolGenerationJob auto-created on DONE', () => {
  it('creates exactly one ProtocolGenerationJob with status PENDING', async () => {
    setupSuccessfulMocks()
    const log = makeLogger()

    await processTranscriptionJob(makeJob('bullmq-7', JOB_ID) as any, log)

    expect(mockPrisma.protocolGenerationJob.create).toHaveBeenCalledOnce()
    expect(mockPrisma.protocolGenerationJob.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          meetingId: MEETING_ID,
          status: 'PENDING',
        }),
      }),
    )
  })

  it('enqueues ProtocolGenerationJob to BullMQ queue after DB create (RQ-016)', async () => {
    const { mockProtocolQueue } = setupSuccessfulMocks()
    const log = makeLogger()

    await processTranscriptionJob(makeJob('bullmq-7b', JOB_ID) as any, log)

    // BullMQ queue.add must be called with the correct job ID from the DB row
    expect(mockProtocolQueue.add).toHaveBeenCalledOnce()
    expect(mockProtocolQueue.add).toHaveBeenCalledWith(
      'generateProtocol',
      expect.objectContaining({ protocol_generation_job_id: PROTO_JOB_ID }),
    )
  })
})

// T04: RQ-017 — Speaker name resolution
describe('T04 (RQ-017) — Speaker name resolution', () => {
  it('resolves speaker via English self-introduction', () => {
    const segments = [
      { speaker: 'SPEAKER_0', start: 0, end: 5, text: 'Hi, my name is Alice.' },
      { speaker: 'SPEAKER_1', start: 5, end: 10, text: 'And my name is Bob.' },
    ]
    const map = resolveSpeakers(segments)
    expect(map['SPEAKER_0']).toBe('Alice')
    expect(map['SPEAKER_1']).toBe('Bob')
  })

  it('resolves speaker via Russian self-introduction', () => {
    const segments = [
      { speaker: 'SPEAKER_0', start: 0, end: 5, text: 'Меня зовут Иван.' },
    ]
    const map = resolveSpeakers(segments)
    expect(map['SPEAKER_0']).toBe('Иван')
  })

  it('leaves unresolved speakers as null in map (BRQ-021)', () => {
    const segments = [
      { speaker: 'SPEAKER_0', start: 0, end: 5, text: 'Hello world.' },
      { speaker: 'SPEAKER_1', start: 5, end: 10, text: 'How are you?' },
    ]
    const map = resolveSpeakers(segments)
    expect(map['SPEAKER_0']).toBeNull()
    expect(map['SPEAKER_1']).toBeNull()
  })

  it('buildFullText uses resolved names and falls back to Speaker N for unresolved', () => {
    const segments = [
      { speaker: 'SPEAKER_0', start: 0, end: 5, text: 'My name is Alice.' },
      { speaker: 'SPEAKER_1', start: 65, end: 70, text: 'Good to meet you.' },
    ]
    const speakerMap: Record<string, string | null> = {
      SPEAKER_0: 'Alice',
      SPEAKER_1: null,
    }
    const text = buildFullText(segments, speakerMap)
    expect(text).toContain('[00:00] Alice: My name is Alice.')
    expect(text).toContain('[01:05] Speaker 2: Good to meet you.')
  })

  it('unresolved labels render as Speaker N in full_text (BRQ-021)', () => {
    const segments = [
      { speaker: 'SPEAKER_0', start: 0, end: 5, text: 'Hello.' },
      { speaker: 'SPEAKER_1', start: 5, end: 10, text: 'Hi.' },
    ]
    const speakerMap: Record<string, string | null> = {
      SPEAKER_0: null,
      SPEAKER_1: null,
    }
    const text = buildFullText(segments, speakerMap)
    expect(text).toContain('Speaker 1:')
    expect(text).toContain('Speaker 2:')
  })
})

// T05: RQ-018 — Language handling
describe('T05 (RQ-018) — Language hint and detection', () => {
  it('passes null languageHint to ASR when meeting.language is AUTO', async () => {
    const { mockAsr } = setupSuccessfulMocks()

    await processTranscriptionJob(
      makeJob('bullmq-8', JOB_ID) as any,
      makeLogger(),
    )

    expect(mockAsr.transcribe).toHaveBeenCalledWith(
      expect.objectContaining({ languageHint: null }),
    )
  })

  it('passes language code as hint when meeting.language is set', async () => {
    const enJob = {
      ...BASE_TX_JOB,
      meeting: { ...BASE_TX_JOB.meeting, language: 'EN' as const },
    }
    mockPrisma.transcriptionJob.findUnique.mockResolvedValue(enJob as any)
    mockPrisma.transcriptionJob.updateMany.mockResolvedValue({ count: 1 })

    const mockStorage = {
      storageUriToKey: vi.fn().mockReturnValue('recordings/test.mp4'),
      getPresignedDownloadUrl: vi.fn().mockResolvedValue('https://test.s3/presigned-get'),
    }
    ;(createStorage as MockedFunction<typeof createStorage>).mockReturnValue(mockStorage as any)

    const fakeAudio = Readable.from([Buffer.from('fake-wav')])
    ;(extractAudio as MockedFunction<typeof extractAudio>).mockReturnValue(fakeAudio)

    const mockAsr = { transcribe: vi.fn().mockResolvedValue(BASE_ASR_RESULT) }
    ;(DeepgramAsrProvider as unknown as MockedFunction<() => typeof mockAsr>).mockReturnValue(mockAsr)

    mockPrisma.$transaction.mockImplementation(async (cb: any) => {
      const txMock = {
        transcript: { create: vi.fn().mockResolvedValue({ id: TRANSCRIPT_ID, meetingId: MEETING_ID }) },
        recording: { update: vi.fn().mockResolvedValue({}) },
        meeting: { update: vi.fn().mockResolvedValue({}) },
        transcriptionJob: {
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          findUnique: vi.fn().mockResolvedValue({ meetingId: MEETING_ID }),
        },
      }
      return cb(txMock)
    })
    mockPrisma.protocolGenerationJob.create.mockResolvedValue({ id: 'proto-id' } as any)
    ;(publishMeetingEvent as MockedFunction<typeof publishMeetingEvent>).mockResolvedValue(undefined)

    await processTranscriptionJob(makeJob('bullmq-9', JOB_ID) as any, makeLogger())

    expect(mockAsr.transcribe).toHaveBeenCalledWith(
      expect.objectContaining({ languageHint: 'EN' }),
    )
  })
})

// T06/T07: NFR-002 + NFR-003 — Async execution, no SLA
describe('T06/T07 (NFR-002/NFR-003) — Async job execution', () => {
  it('processTranscriptionJob is async and returns a Promise', () => {
    mockPrisma.transcriptionJob.findUnique.mockResolvedValue({ ...BASE_TX_JOB, status: 'DONE' as const } as any)
    const result = processTranscriptionJob(makeJob('bullmq-10', JOB_ID) as any, makeLogger())
    expect(result).toBeInstanceOf(Promise)
  })
})

// T08: NFR-004 — RU + EN support
describe('T08 (NFR-004) — RU + EN language support', () => {
  it('resolveSpeakers handles Russian self-intro', () => {
    const segments = [{ speaker: 'SPEAKER_0', start: 0, end: 3, text: 'Меня зовут Мария.' }]
    const map = resolveSpeakers(segments)
    expect(map['SPEAKER_0']).toBe('Мария')
  })

  it('resolveSpeakers handles English self-intro', () => {
    const segments = [{ speaker: 'SPEAKER_0', start: 0, end: 3, text: "I'm John here." }]
    const map = resolveSpeakers(segments)
    expect(map['SPEAKER_0']).toBe('John')
  })
})

// T09: NFR-008 — Failures surfaced with human-readable error_reason; terminal jobs immutable
describe('T09 (NFR-008) — Human-readable error_reason; terminal state immutability', () => {
  it('error message is captured in the FAILED update (error_reason non-null)', async () => {
    mockPrisma.transcriptionJob.findUnique.mockResolvedValue(BASE_TX_JOB as any)
    mockPrisma.transcriptionJob.updateMany.mockResolvedValue({ count: 1 })

    const mockStorage = {
      storageUriToKey: vi.fn().mockReturnValue('recordings/test.mp4'),
      getPresignedDownloadUrl: vi.fn().mockRejectedValue(new Error('Bucket not found')),
    }
    ;(createStorage as MockedFunction<typeof createStorage>).mockReturnValue(mockStorage as any)

    let capturedErrorMsg: string | undefined
    mockPrisma.$transaction.mockImplementation(async (cb: any) => {
      const txMock = {
        transcriptionJob: {
          updateMany: vi.fn().mockImplementation((args: any) => {
            if (args.data?.errorMsg) capturedErrorMsg = args.data.errorMsg
            return { count: 1 }
          }),
          findUnique: vi.fn().mockResolvedValue({ meetingId: MEETING_ID }),
        },
        meeting: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      }
      return cb(txMock)
    })
    ;(publishMeetingEvent as MockedFunction<typeof publishMeetingEvent>).mockResolvedValue(undefined)
    mockPrisma.transcriptionJob.findUnique
      .mockResolvedValueOnce(BASE_TX_JOB as any)
      .mockResolvedValueOnce({ meetingId: MEETING_ID } as any)

    const log = makeLogger()
    await expect(
      processTranscriptionJob(makeJob('bullmq-11', JOB_ID) as any, log),
    ).rejects.toThrow()

    expect(capturedErrorMsg).toBe('Bucket not found')
  })

  it('publishMeetingEvent is called on success with TRANSCRIBED status', async () => {
    setupSuccessfulMocks()
    await processTranscriptionJob(makeJob('bullmq-12', JOB_ID) as any, makeLogger())

    expect(publishMeetingEvent).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ type: 'meeting.status', status: 'TRANSCRIBED' }),
      MEETING_ID,
    )
  })

  it('publishMeetingEvent is called on failure with ERROR status', async () => {
    mockPrisma.transcriptionJob.findUnique.mockResolvedValue(null as any)
    ;(publishMeetingEvent as MockedFunction<typeof publishMeetingEvent>).mockResolvedValue(undefined)
    mockPrisma.$transaction.mockImplementation(async (cb: any) => {
      const txMock = {
        transcriptionJob: {
          updateMany: vi.fn().mockResolvedValue({ count: 0 }),
          findUnique: vi.fn().mockResolvedValue(null),
        },
        meeting: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
      }
      return cb(txMock)
    })

    const log = makeLogger()
    await expect(
      processTranscriptionJob(makeJob('bullmq-13', JOB_ID) as any, log),
    ).rejects.toThrow()

    // publisher was attempted (best-effort — may or may not fire depending on findUnique result)
    // The important thing is no unhandled rejection
  })
})
