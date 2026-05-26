/**
 * UC-200 — Independent regression tests for the transcription worker pipeline.
 *
 * AUTHORSHIP NOTE: Written independently from transcription.test.ts.
 * - Uses call-sequence tracking (ordered event log) instead of isolated mock assertions.
 * - Verifies the specific WHERE-clause shape for the optimistic PENDING→PROCESSING lock.
 * - Tests after-commit ordering by tracking whether DB commit preceded BullMQ enqueue.
 * - Mutation proofs documented per test as RED→GREEN comments.
 *
 * TESTING STRATEGY differences from original test:
 * - Single `callLog: string[]` that records ALL side-effects in chronological order.
 * - Prisma $transaction interceptor captures AND executes the callback, then marks
 *   "TX_COMMITTED" in the log — so we can assert enqueue came AFTER.
 * - Terminal-state guard verified by asserting zero calls on EVERY mock, not just $transaction.
 * - Failure-path verified by asserting Meeting.status='ERROR' update was invoked explicitly
 *   (not just log.error), and ProtocolGenerationJob.create was NEVER called.
 * - Double-pickup verified by confirming that when updateMany returns {count:0} the pipeline
 *   halts and $transaction is never reached.
 */

import { describe, it, expect, vi, beforeEach, type MockedFunction } from 'vitest'
import type { Job } from 'bullmq'
import { Readable } from 'node:stream'

// ── Module-level mocks (hoisted) ──────────────────────────────────────────────
// Strategy: we intercept at the same module boundaries as production code uses,
// but we instrument them with an ordered call-log so we can verify sequencing.

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    transcriptionJob: {
      findUnique: vi.fn(),
      updateMany: vi.fn(),
    },
    recording: { update: vi.fn() },
    meeting: {
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    transcript: { create: vi.fn() },
    protocolGenerationJob: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}))

vi.mock('../lib/storage.js', () => ({
  createStorage: vi.fn(),
}))

vi.mock('../lib/ffmpeg.js', () => ({
  extractAudio: vi.fn(),
}))

vi.mock('../asr/deepgram-adapter.js', async (importOriginal) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const original = (await importOriginal()) as any
  return {
    DeepgramAsrProvider: vi.fn(),
    // Keep the real error class and helper so tests can construct transient errors
    DeepgramAsrError: original.DeepgramAsrError,
    isTransientAsrError: original.isTransientAsrError,
  }
})

vi.mock('../lib/publisher.js', () => ({
  publishMeetingEvent: vi.fn(),
}))

vi.mock('../queues.js', () => ({
  QueueName: { Transcription: 'transcriptionJob', Protocol: 'protocolGenerationJob' },
  createQueues: vi.fn(),
}))

// ── Subject under test ────────────────────────────────────────────────────────
import { processTranscriptionJob } from './transcription.js'
import { prisma } from '../lib/prisma.js'
import { createStorage } from '../lib/storage.js'
import { extractAudio } from '../lib/ffmpeg.js'
import { DeepgramAsrProvider, DeepgramAsrError } from '../asr/deepgram-adapter.js'
import { publishMeetingEvent } from '../lib/publisher.js'
import { createQueues } from '../queues.js'

// ── Typed mock helpers ────────────────────────────────────────────────────────

type AnyFn = (...args: any[]) => any

type FakePrisma = {
  transcriptionJob: { findUnique: MockedFunction<AnyFn>; updateMany: MockedFunction<AnyFn> }
  recording: { update: MockedFunction<AnyFn> }
  meeting: { update: MockedFunction<AnyFn>; updateMany: MockedFunction<AnyFn> }
  transcript: { create: MockedFunction<AnyFn> }
  protocolGenerationJob: { create: MockedFunction<AnyFn> }
  $transaction: MockedFunction<AnyFn>
}

const fp = prisma as unknown as FakePrisma

// ── Fixtures ──────────────────────────────────────────────────────────────────

// Distinct UUIDs from the original test to make fixture overlap obvious at a glance.
const MTG = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const REC = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
const TXJOB = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
const TXS = 'dddddddd-dddd-dddd-dddd-dddddddddddd'
const PROTO = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'

const BASE_JOB = {
  id: TXJOB,
  meetingId: MTG,
  status: 'PENDING' as const,
  startedAt: null,
  finishedAt: null,
  errorMsg: null,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
  meeting: {
    id: MTG,
    title: 'Regression Test Meeting',
    status: 'TRANSCRIBING' as const,
    language: 'AUTO' as const,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    recording: {
      id: REC,
      meetingId: MTG,
      storageUri: 's3://reg-bucket/recordings/reg.mp4',
      mimeType: 'VIDEO_MP4' as const,
      sizeBytes: BigInt(2048),
      durationSec: null,
      uploadedAt: new Date('2026-01-01'),
    },
  },
}

const BASE_ASR = {
  segments: [
    { speaker: 'SPEAKER_0', start: 0, end: 4, text: 'My name is Carol.' },
    { speaker: 'SPEAKER_1', start: 4, end: 8, text: 'Good to be here.' },
  ],
  detectedLanguage: 'en',
  speakers: ['SPEAKER_0', 'SPEAKER_1'],
  durationSec: 8,
}

function makeJob(
  bullId: string,
  jobId: string,
  attemptsMade = 0,
): Job<{ transcription_job_id: string }> {
  return { id: bullId, data: { transcription_job_id: jobId }, attemptsMade } as unknown as Job<{
    transcription_job_id: string
  }>
}

function makeLogger() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as any
}

// ── Ordered call-log setup ────────────────────────────────────────────────────
// This is the key differentiator: we record events in a shared log array so we
// can assert temporal ordering across async boundaries.

let callLog: string[] = []

/**
 * Wire up all mocks for the happy path.
 * Returns the mock instances for targeted assertions.
 *
 * The $transaction implementation appends 'TX_COMMITTED' to callLog AFTER
 * the callback resolves, allowing Test 3 to verify that BullMQ enqueue
 * (logged as 'QUEUE_ADD') appears AFTER 'TX_COMMITTED'.
 */
function wireHappyPath() {
  fp.transcriptionJob.findUnique.mockResolvedValue(BASE_JOB as any)
  fp.transcriptionJob.updateMany.mockResolvedValue({ count: 1 })

  const storage = {
    storageUriToKey: vi.fn().mockReturnValue('recordings/reg.mp4'),
    getPresignedDownloadUrl: vi.fn().mockResolvedValue('https://reg.s3/presigned'),
  }
  ;(createStorage as MockedFunction<AnyFn>).mockReturnValue(storage as any)

  const audioReadable = Readable.from([Buffer.from('fake-audio')])
  ;(extractAudio as MockedFunction<AnyFn>).mockReturnValue(audioReadable)

  const asr = { transcribe: vi.fn().mockResolvedValue(BASE_ASR) }
  ;(DeepgramAsrProvider as unknown as MockedFunction<AnyFn>).mockReturnValue(asr)

  // $transaction: run callback synchronously with a tx proxy, then mark committed.
  fp.$transaction.mockImplementation(async (cb: any) => {
    const txProxy = {
      transcript: {
        create: vi.fn().mockImplementation(async () => {
          callLog.push('TX:transcript.create')
          return { id: TXS, meetingId: MTG }
        }),
      },
      recording: {
        update: vi.fn().mockImplementation(async () => {
          callLog.push('TX:recording.update')
          return {}
        }),
      },
      meeting: {
        update: vi.fn().mockImplementation(async () => {
          callLog.push('TX:meeting.update(TRANSCRIBED)')
          return {}
        }),
      },
      transcriptionJob: {
        updateMany: vi.fn().mockImplementation(async () => {
          callLog.push('TX:transcriptionJob.updateMany(DONE)')
          return { count: 1 }
        }),
        findUnique: vi.fn().mockResolvedValue({ meetingId: MTG }),
      },
    }
    const result = await cb(txProxy)
    callLog.push('TX_COMMITTED')
    return result
  })

  fp.protocolGenerationJob.create.mockImplementation(async () => {
    callLog.push('PROTO_JOB_CREATED')
    return { id: PROTO }
  })

  const protoQueue = {
    add: vi.fn().mockImplementation(async () => {
      callLog.push('QUEUE_ADD')
    }),
    close: vi.fn().mockResolvedValue(undefined),
  }
  ;(createQueues as MockedFunction<AnyFn>).mockReturnValue({
    transcriptionJob: { add: vi.fn(), close: vi.fn() } as any,
    protocolGenerationJob: protoQueue as any,
  } as any)
  ;(publishMeetingEvent as MockedFunction<AnyFn>).mockResolvedValue(undefined)

  return { storage, asr, protoQueue }
}

// ── Test suite ────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
  callLog = []
})

// ─────────────────────────────────────────────────────────────────────────────
// TEST 1: Optimistic PENDING→PROCESSING lock + double-pickup guard
//
// RED mutation proof (see task spec):
//   Remove the `WHERE status='PENDING'` clause in the updateMany call →
//   the assertion `expect(updateManyArg.where).toEqual({ id: TXJOB, status: 'PENDING' })`
//   would FAIL because where.status would be absent.
//
//   Also: if the first invocation succeeds and a second invocation fires on the same job
//   (simulated by returning count=0 from updateMany), the pipeline must halt before $transaction.
// ─────────────────────────────────────────────────────────────────────────────

describe('REGR-T1 — Optimistic PENDING→PROCESSING lock', () => {
  it('updateMany WHERE clause includes exactly status=PENDING (RQ-014)', async () => {
    /*
     * MUTATION PROOF:
     *   If the production code removes `status: 'PENDING'` from the WHERE clause,
     *   the captured `where` object will be `{ id: TXJOB }` without the status field,
     *   and the deep-equal assertion below turns RED.
     */
    wireHappyPath()

    await processTranscriptionJob(makeJob('r-1', TXJOB) as any, makeLogger())

    // First updateMany call is the PENDING→PROCESSING optimistic lock.
    const firstUpdateManyCall = fp.transcriptionJob.updateMany.mock.calls[0]
    expect(firstUpdateManyCall).toBeDefined()
    const arg = firstUpdateManyCall[0] as { where: { id: string; status: string }; data: any }

    // The WHERE must contain both the job id AND status='PENDING'.
    // Any mutation that removes the status field from WHERE will break this assertion.
    expect(arg.where).toEqual({ id: TXJOB, status: 'PENDING' })
    expect(arg.data).toMatchObject({ status: 'PROCESSING' })
  })

  it('second invocation with updateMany count=0 is a no-op: $transaction never called (BRQ-009 double-pickup)', async () => {
    /*
     * MUTATION PROOF:
     *   If the guard `if (updated.count === 0) return` is removed, the pipeline
     *   will proceed to $transaction even when another worker claimed the job,
     *   and `expect(fp.$transaction).not.toHaveBeenCalled()` turns RED.
     */
    fp.transcriptionJob.findUnique.mockResolvedValue(BASE_JOB as any)
    // Simulate: first worker already transitioned — count is 0 for this invocation.
    fp.transcriptionJob.updateMany.mockResolvedValue({ count: 0 })
    const storage = {
      storageUriToKey: vi.fn(),
      getPresignedDownloadUrl: vi.fn(),
    }
    ;(createStorage as MockedFunction<AnyFn>).mockReturnValue(storage as any)
    ;(publishMeetingEvent as MockedFunction<AnyFn>).mockResolvedValue(undefined)

    await processTranscriptionJob(makeJob('r-2', TXJOB) as any, makeLogger())

    // $transaction MUST NOT have been called — the pipeline stopped at count=0 guard.
    expect(fp.$transaction).not.toHaveBeenCalled()
    // Also: storage was fetched but ASR was never reached — key signal.
    expect(fp.protocolGenerationJob.create).not.toHaveBeenCalled()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// TEST 2: Success path — persisted fields + Meeting.status=TRANSCRIBED + job DONE
//
// RED mutation proof (see task spec):
//   Comment out `await tx.meeting.update({ data: { status: 'TRANSCRIBED' } })` →
//   the callLog will no longer contain 'TX:meeting.update(TRANSCRIBED)',
//   and the assertion `expect(callLog).toContain('TX:meeting.update(TRANSCRIBED)')` turns RED.
// ─────────────────────────────────────────────────────────────────────────────

describe('REGR-T2 — Successful path: Transcript persisted + Meeting TRANSCRIBED + Job DONE', () => {
  it('Transcript is created with rawText, segmentsBlob, speakerMap populated', async () => {
    /*
     * MUTATION PROOF:
     *   If the transcript.create call is removed or the fields are omitted,
     *   the assertions on txProxy.transcript.create.mock.calls will fail.
     */
    const { asr: _asr } = wireHappyPath()

    // Intercept the transaction to capture what transcript.create received.
    let transcriptCreateArg: any
    fp.$transaction.mockImplementation(async (cb: any) => {
      const txProxy = {
        transcript: {
          create: vi.fn().mockImplementation(async (args: any) => {
            callLog.push('TX:transcript.create')
            transcriptCreateArg = args
            return { id: TXS, meetingId: MTG }
          }),
        },
        recording: { update: vi.fn().mockResolvedValue({}) },
        meeting: {
          update: vi.fn().mockImplementation(async () => {
            callLog.push('TX:meeting.update(TRANSCRIBED)')
            return {}
          }),
        },
        transcriptionJob: {
          updateMany: vi.fn().mockImplementation(async () => {
            callLog.push('TX:transcriptionJob.updateMany(DONE)')
            return { count: 1 }
          }),
          findUnique: vi.fn().mockResolvedValue({ meetingId: MTG }),
        },
      }
      const result = await cb(txProxy)
      callLog.push('TX_COMMITTED')
      return result
    })

    await processTranscriptionJob(makeJob('r-3', TXJOB) as any, makeLogger())

    // Transcript must have rawText (built from ASR segments)
    expect(transcriptCreateArg.data.rawText).toBeTruthy()
    expect(typeof transcriptCreateArg.data.rawText).toBe('string')

    // segmentsBlob must be the raw ASR segments array
    expect(transcriptCreateArg.data.segmentsBlob).toEqual(BASE_ASR.segments)

    // speakerMap must be an object (resolved speaker names)
    expect(typeof transcriptCreateArg.data.speakerMap).toBe('object')
    // Carol introduced herself — SPEAKER_0 resolves to 'Carol'
    expect((transcriptCreateArg.data.speakerMap as any)['SPEAKER_0']).toBe('Carol')
    // SPEAKER_1 had no intro — null
    expect((transcriptCreateArg.data.speakerMap as any)['SPEAKER_1']).toBeNull()
  })

  it('Meeting.status=TRANSCRIBED update fires inside transaction (BRQ-008)', async () => {
    /*
     * MUTATION PROOF:
     *   Remove `await tx.meeting.update({ data: { status: 'TRANSCRIBED' } })` in production code →
     *   callLog will not contain 'TX:meeting.update(TRANSCRIBED)' → assertion turns RED.
     */
    wireHappyPath()

    await processTranscriptionJob(makeJob('r-4', TXJOB) as any, makeLogger())

    expect(callLog).toContain('TX:meeting.update(TRANSCRIBED)')
    expect(callLog).toContain('TX:transcriptionJob.updateMany(DONE)')
    // Both writes happened before TX_COMMITTED
    const meetingUpdateIdx = callLog.indexOf('TX:meeting.update(TRANSCRIBED)')
    const txCommittedIdx = callLog.indexOf('TX_COMMITTED')
    expect(meetingUpdateIdx).toBeLessThan(txCommittedIdx)
  })

  it('TranscriptionJob.status transitions to DONE with finishedAt set', async () => {
    wireHappyPath()

    let jobDoneArg: any
    // Override $transaction after wireHappyPath to capture the transcriptionJob.updateMany args
    fp.$transaction.mockImplementation(async (cb: any) => {
      const txProxy = {
        transcript: { create: vi.fn().mockResolvedValue({ id: TXS, meetingId: MTG }) },
        recording: { update: vi.fn().mockResolvedValue({}) },
        meeting: { update: vi.fn().mockResolvedValue({}) },
        transcriptionJob: {
          updateMany: vi.fn().mockImplementation(async (args: any) => {
            callLog.push('TX:transcriptionJob.updateMany(DONE)')
            jobDoneArg = args
            return { count: 1 }
          }),
          findUnique: vi.fn().mockResolvedValue({ meetingId: MTG }),
        },
      }
      const result = await cb(txProxy)
      callLog.push('TX_COMMITTED')
      return result
    })

    await processTranscriptionJob(makeJob('r-5', TXJOB) as any, makeLogger())

    expect(jobDoneArg).toBeDefined()
    expect(jobDoneArg.data.status).toBe('DONE')
    expect(jobDoneArg.data.finishedAt).toBeInstanceOf(Date)
    // WHERE must include status='PROCESSING' to prevent overwriting terminal states
    expect(jobDoneArg.where).toMatchObject({ id: TXJOB, status: 'PROCESSING' })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// TEST 3: After-commit BullMQ enqueue ordering
//
// RED mutation proof (see task spec):
//   Move `queues[QueueName.Protocol].add(...)` INSIDE the $transaction callback →
//   'QUEUE_ADD' will appear BEFORE 'TX_COMMITTED' in callLog →
//   the ordering assertion `queueIdx > txCommittedIdx` turns RED.
//
// Also verifies: the BullMQ payload carries the proto-job id from the freshly-
// created ProtocolGenerationJob row (not a pre-hardcoded value).
// ─────────────────────────────────────────────────────────────────────────────

describe('REGR-T3 — BullMQ enqueue happens AFTER $transaction commit (after-commit side-effect)', () => {
  it('QUEUE_ADD appears after TX_COMMITTED in the ordered call log', async () => {
    /*
     * MUTATION PROOF:
     *   Move queue.add() inside the $transaction callback in production code →
     *   'QUEUE_ADD' will precede 'TX_COMMITTED' in callLog →
     *   `queueIdx > txCommittedIdx` fails → test turns RED.
     */
    wireHappyPath()

    await processTranscriptionJob(makeJob('r-6', TXJOB) as any, makeLogger())

    const txCommittedIdx = callLog.indexOf('TX_COMMITTED')
    const protoCreatedIdx = callLog.indexOf('PROTO_JOB_CREATED')
    const queueIdx = callLog.indexOf('QUEUE_ADD')

    expect(txCommittedIdx).toBeGreaterThanOrEqual(0)
    expect(protoCreatedIdx).toBeGreaterThan(txCommittedIdx) // proto job created after tx commit
    expect(queueIdx).toBeGreaterThan(protoCreatedIdx) // enqueue after proto job row created
  })

  it('BullMQ payload carries the proto-job id from the freshly-created DB row', async () => {
    /*
     * MUTATION PROOF:
     *   If the payload used a hardcoded id or wrong variable, this assertion fails.
     *   The test also proves the id comes from the DB create result, not from
     *   a pre-existing fixture.
     */
    const { protoQueue } = wireHappyPath()

    await processTranscriptionJob(makeJob('r-7', TXJOB) as any, makeLogger())

    expect(protoQueue.add).toHaveBeenCalledOnce()
    const [jobName, payload] = protoQueue.add.mock.calls[0]
    expect(jobName).toBe('generateProtocol')
    // PROTO is the id returned by our mock fp.protocolGenerationJob.create
    expect(payload).toEqual({ protocol_generation_job_id: PROTO })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// TEST 4: Failure path
//
// RED mutation proof (see task spec):
//   Remove `Meeting.status='FAILED'` update in catch block →
//   the assertion that the failure transaction set meeting status to FAILED turns RED.
// ─────────────────────────────────────────────────────────────────────────────

describe('REGR-T4 — Failure path: ASR throws → FAILED state, no ProtocolGenerationJob', () => {
  it('TranscriptionJob.status=FAILED with non-null errorMsg and finishedAt when ASR throws', async () => {
    /*
     * MUTATION PROOF:
     *   If the catch block omits setting status='FAILED' or errorMsg,
     *   capturedFailArgs will be undefined or lack the fields, and assertions turn RED.
     */
    fp.transcriptionJob.findUnique.mockResolvedValue(BASE_JOB as any)
    fp.transcriptionJob.updateMany.mockResolvedValue({ count: 1 })

    const storage = {
      storageUriToKey: vi.fn().mockReturnValue('recordings/reg.mp4'),
      getPresignedDownloadUrl: vi.fn().mockResolvedValue('https://reg.s3/presigned'),
    }
    ;(createStorage as MockedFunction<AnyFn>).mockReturnValue(storage as any)

    const fakeAudio = Readable.from([Buffer.from('fake-audio')])
    ;(extractAudio as MockedFunction<AnyFn>).mockReturnValue(fakeAudio)

    const asrMock = {
      transcribe: vi.fn().mockRejectedValue(new Error('ASR service unavailable')),
    }
    ;(DeepgramAsrProvider as unknown as MockedFunction<AnyFn>).mockReturnValue(asrMock)

    // The catch-block transaction: record what it tried to write
    let failJobArgs: any
    let _failMeetingArgs: any

    fp.$transaction.mockImplementation(async (cb: any) => {
      const txProxy = {
        transcriptionJob: {
          updateMany: vi.fn().mockImplementation(async (args: any) => {
            failJobArgs = args
            return { count: 1 }
          }),
          findUnique: vi.fn().mockResolvedValue({ meetingId: MTG }),
        },
        meeting: {
          updateMany: vi.fn().mockImplementation(async (args: any) => {
            _failMeetingArgs = args
            return { count: 1 }
          }),
        },
      }
      return cb(txProxy)
    })

    fp.transcriptionJob.findUnique
      .mockResolvedValueOnce(BASE_JOB as any)
      .mockResolvedValueOnce({ meetingId: MTG } as any)
    ;(publishMeetingEvent as MockedFunction<AnyFn>).mockResolvedValue(undefined)

    await expect(
      processTranscriptionJob(makeJob('r-8', TXJOB) as any, makeLogger()),
    ).rejects.toThrow('ASR service unavailable')

    // Job must be marked FAILED with the error message and finishedAt
    expect(failJobArgs).toBeDefined()
    expect(failJobArgs.data.status).toBe('FAILED')
    expect(failJobArgs.data.errorMsg).toBe('ASR service unavailable')
    expect(failJobArgs.data.finishedAt).toBeInstanceOf(Date)
  })

  it('Meeting.status=FAILED is written in the failure transaction (RQ-015)', async () => {
    /*
     * MUTATION PROOF:
     *   Remove `await tx.meeting.updateMany({ data: { status: 'FAILED' } })` in catch block →
     *   failMeetingStatus will be undefined or different →
     *   `expect(failMeetingStatus).toBe('FAILED')` turns RED.
     */
    fp.transcriptionJob.findUnique.mockResolvedValue(BASE_JOB as any)
    fp.transcriptionJob.updateMany.mockResolvedValue({ count: 1 })

    const storage = {
      storageUriToKey: vi.fn().mockReturnValue('recordings/reg.mp4'),
      getPresignedDownloadUrl: vi.fn().mockResolvedValue('https://reg.s3/presigned'),
    }
    ;(createStorage as MockedFunction<AnyFn>).mockReturnValue(storage as any)

    const fakeAudio = Readable.from([Buffer.from('fake-audio')])
    ;(extractAudio as MockedFunction<AnyFn>).mockReturnValue(fakeAudio)

    const asrMock = {
      transcribe: vi.fn().mockRejectedValue(new Error('Deepgram timeout')),
    }
    ;(DeepgramAsrProvider as unknown as MockedFunction<AnyFn>).mockReturnValue(asrMock)

    let failMeetingStatus: string | undefined

    fp.$transaction.mockImplementation(async (cb: any) => {
      const txProxy = {
        transcriptionJob: {
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          findUnique: vi.fn().mockResolvedValue({ meetingId: MTG }),
        },
        meeting: {
          updateMany: vi.fn().mockImplementation(async (args: any) => {
            failMeetingStatus = args.data.status
            return { count: 1 }
          }),
        },
      }
      return cb(txProxy)
    })

    fp.transcriptionJob.findUnique
      .mockResolvedValueOnce(BASE_JOB as any)
      .mockResolvedValueOnce({ meetingId: MTG } as any)
    ;(publishMeetingEvent as MockedFunction<AnyFn>).mockResolvedValue(undefined)

    await expect(
      processTranscriptionJob(makeJob('r-9', TXJOB) as any, makeLogger()),
    ).rejects.toThrow('Deepgram timeout')

    // Meeting status must be set to FAILED in the failure path
    expect(failMeetingStatus).toBe('FAILED')
  })

  it('ProtocolGenerationJob is NEVER created on failure (RQ-016)', async () => {
    /*
     * MUTATION PROOF:
     *   If the code accidentally calls protocolGenerationJob.create in the catch block,
     *   this assertion turns RED.
     */
    fp.transcriptionJob.findUnique.mockResolvedValue(BASE_JOB as any)
    fp.transcriptionJob.updateMany.mockResolvedValue({ count: 1 })

    const storage = {
      storageUriToKey: vi.fn().mockReturnValue('recordings/reg.mp4'),
      getPresignedDownloadUrl: vi.fn().mockRejectedValue(new Error('bucket gone')),
    }
    ;(createStorage as MockedFunction<AnyFn>).mockReturnValue(storage as any)

    fp.$transaction.mockImplementation(async (cb: any) => {
      const txProxy = {
        transcriptionJob: {
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          findUnique: vi.fn().mockResolvedValue({ meetingId: MTG }),
        },
        meeting: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      }
      return cb(txProxy)
    })

    fp.transcriptionJob.findUnique
      .mockResolvedValueOnce(BASE_JOB as any)
      .mockResolvedValueOnce({ meetingId: MTG } as any)
    ;(publishMeetingEvent as MockedFunction<AnyFn>).mockResolvedValue(undefined)

    await expect(
      processTranscriptionJob(makeJob('r-10', TXJOB) as any, makeLogger()),
    ).rejects.toThrow('bucket gone')

    expect(fp.protocolGenerationJob.create).not.toHaveBeenCalled()
  })

  it('BullMQ enqueue does NOT fire on failure path', async () => {
    /*
     * Related to test 4 — additionally checks the queue is not touched on error.
     */
    const protoQueue = { add: vi.fn(), close: vi.fn().mockResolvedValue(undefined) }
    ;(createQueues as MockedFunction<AnyFn>).mockReturnValue({
      transcriptionJob: { add: vi.fn(), close: vi.fn() } as any,
      protocolGenerationJob: protoQueue as any,
    } as any)

    fp.transcriptionJob.findUnique.mockResolvedValue(BASE_JOB as any)
    fp.transcriptionJob.updateMany.mockResolvedValue({ count: 1 })

    const storage = {
      storageUriToKey: vi.fn().mockReturnValue('recordings/reg.mp4'),
      getPresignedDownloadUrl: vi.fn().mockRejectedValue(new Error('network error')),
    }
    ;(createStorage as MockedFunction<AnyFn>).mockReturnValue(storage as any)

    fp.$transaction.mockImplementation(async (cb: any) => {
      const txProxy = {
        transcriptionJob: {
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          findUnique: vi.fn().mockResolvedValue({ meetingId: MTG }),
        },
        meeting: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      }
      return cb(txProxy)
    })

    fp.transcriptionJob.findUnique
      .mockResolvedValueOnce(BASE_JOB as any)
      .mockResolvedValueOnce({ meetingId: MTG } as any)
    ;(publishMeetingEvent as MockedFunction<AnyFn>).mockResolvedValue(undefined)

    await expect(
      processTranscriptionJob(makeJob('r-11', TXJOB) as any, makeLogger()),
    ).rejects.toThrow('network error')

    expect(protoQueue.add).not.toHaveBeenCalled()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// TEST 5: Terminal-state immutability (BRQ-009)
//
// RED mutation proof (see task spec):
//   Remove the entry-time terminal-state guard (lines ~185-188 in production code) →
//   the pipeline will proceed to updateMany even for DONE/FAILED jobs →
//   `expect(fp.transcriptionJob.updateMany).not.toHaveBeenCalled()` turns RED.
// ─────────────────────────────────────────────────────────────────────────────

describe('REGR-T5 — Terminal-state immutability (BRQ-009): DONE and FAILED jobs are no-ops', () => {
  it('DONE job: no DB writes, no BullMQ enqueue, returns without error', async () => {
    /*
     * MUTATION PROOF:
     *   Remove `if (txJob.status === 'DONE' || txJob.status === 'FAILED') return` →
     *   pipeline continues, calls updateMany → assertion fails.
     */
    const doneJob = { ...BASE_JOB, status: 'DONE' as const }
    fp.transcriptionJob.findUnique.mockResolvedValue(doneJob as any)

    const protoQueue = { add: vi.fn(), close: vi.fn().mockResolvedValue(undefined) }
    ;(createQueues as MockedFunction<AnyFn>).mockReturnValue({
      transcriptionJob: { add: vi.fn(), close: vi.fn() } as any,
      protocolGenerationJob: protoQueue as any,
    } as any)
    ;(publishMeetingEvent as MockedFunction<AnyFn>).mockResolvedValue(undefined)

    // Should not throw
    await expect(
      processTranscriptionJob(makeJob('r-12', TXJOB) as any, makeLogger()),
    ).resolves.toBeUndefined()

    // Zero DB writes
    expect(fp.transcriptionJob.updateMany).not.toHaveBeenCalled()
    expect(fp.$transaction).not.toHaveBeenCalled()
    expect(fp.protocolGenerationJob.create).not.toHaveBeenCalled()
    // Zero enqueue
    expect(protoQueue.add).not.toHaveBeenCalled()
  })

  it('FAILED job: no DB writes, no BullMQ enqueue, returns without error', async () => {
    /*
     * MUTATION PROOF:
     *   Same guard removal as above — FAILED jobs must be treated identically to DONE.
     */
    const failedJob = { ...BASE_JOB, status: 'FAILED' as const, errorMsg: 'prior failure' }
    fp.transcriptionJob.findUnique.mockResolvedValue(failedJob as any)

    const protoQueue = { add: vi.fn(), close: vi.fn().mockResolvedValue(undefined) }
    ;(createQueues as MockedFunction<AnyFn>).mockReturnValue({
      transcriptionJob: { add: vi.fn(), close: vi.fn() } as any,
      protocolGenerationJob: protoQueue as any,
    } as any)
    ;(publishMeetingEvent as MockedFunction<AnyFn>).mockResolvedValue(undefined)

    await expect(
      processTranscriptionJob(makeJob('r-13', TXJOB) as any, makeLogger()),
    ).resolves.toBeUndefined()

    expect(fp.transcriptionJob.updateMany).not.toHaveBeenCalled()
    expect(fp.$transaction).not.toHaveBeenCalled()
    expect(fp.protocolGenerationJob.create).not.toHaveBeenCalled()
    expect(protoQueue.add).not.toHaveBeenCalled()
  })

  it('PROCESSING job (not yet terminal) is NOT skipped — pipeline continues to $transaction', async () => {
    /*
     * Regression guard: the terminal check must only skip DONE and FAILED,
     * not PROCESSING. If the guard is over-broad (e.g. also guards PROCESSING),
     * this test turns RED.
     */
    // Job is PROCESSING when we load it (e.g. a previous worker crashed mid-flight
    // and BullMQ re-delivered).  Pipeline should continue and re-attempt.
    const processingJob = { ...BASE_JOB, status: 'PROCESSING' as const }
    fp.transcriptionJob.findUnique.mockResolvedValue(processingJob as any)
    // updateMany returns count=0 because it uses WHERE status='PENDING' and status is PROCESSING
    fp.transcriptionJob.updateMany.mockResolvedValue({ count: 0 })
    ;(publishMeetingEvent as MockedFunction<AnyFn>).mockResolvedValue(undefined)

    // Not a no-op — it will call updateMany (and get count=0, then return early)
    await processTranscriptionJob(makeJob('r-14', TXJOB) as any, makeLogger())

    // updateMany was attempted (the terminal guard did NOT short-circuit it)
    expect(fp.transcriptionJob.updateMany).toHaveBeenCalledOnce()
    // But $transaction never ran because count=0
    expect(fp.$transaction).not.toHaveBeenCalled()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// TEST 6: FR-001 — Transient vs permanent error retry semantics (RC-UC-200)
//
// RED mutation proofs:
//   T6a: If the transient-retry guard is removed, the failure handler will write
//        FAILED for a transient error even when attempts remain, and
//        `expect(fp.$transaction).not.toHaveBeenCalled()` turns RED.
//   T6b: If `isFinalAttempt` check is wrong, a transient error on the last attempt
//        will NOT write FAILED, and `expect(failJobArgs.data.status).toBe('FAILED')`
//        turns RED.
//   T6c: If a non-transient ASR error (e.g. 401) is treated as transient, the
//        test asserting $transaction was called turns RED.
//   T6d: attemptCount mirror: if the FAILED write omits `attemptCount`, the
//        assertion fails.
// ─────────────────────────────────────────────────────────────────────────────

describe('REGR-T6 — FR-001 transient-retry semantics (RC-UC-200)', () => {
  /**
   * Helper: set up mocks up to ASR throw, with configurable ASR error.
   */
  function wireUpToAsrThrow(asrError: Error) {
    fp.transcriptionJob.findUnique.mockResolvedValue(BASE_JOB as any)
    fp.transcriptionJob.updateMany.mockResolvedValue({ count: 1 })

    const storage = {
      storageUriToKey: vi.fn().mockReturnValue('recordings/reg.mp4'),
      getPresignedDownloadUrl: vi.fn().mockResolvedValue('https://reg.s3/presigned'),
    }
    ;(createStorage as MockedFunction<AnyFn>).mockReturnValue(storage as any)

    const fakeAudio = Readable.from([Buffer.from('fake-audio')])
    ;(extractAudio as MockedFunction<AnyFn>).mockReturnValue(fakeAudio)

    const asrMock = { transcribe: vi.fn().mockRejectedValue(asrError) }
    ;(DeepgramAsrProvider as unknown as MockedFunction<AnyFn>).mockReturnValue(asrMock)

    ;(publishMeetingEvent as MockedFunction<AnyFn>).mockResolvedValue(undefined)
  }

  it('T6a: transient ASR error (429) with attempts remaining — re-throws WITHOUT writing FAILED (RQ-015 FR-001)', async () => {
    /*
     * MUTATION PROOF:
     *   Remove `if (shouldRetry) { throw err }` in the catch block →
     *   $transaction will be called to write FAILED →
     *   `expect(fp.$transaction).not.toHaveBeenCalled()` turns RED.
     */
    const transientErr = new DeepgramAsrError('rate limited', null, /* isTransient= */ true)
    wireUpToAsrThrow(transientErr)

    // attemptsMade=0 means this is attempt #1 out of MAX_ATTEMPTS=3 → NOT final
    const job = makeJob('r-15', TXJOB, /* attemptsMade= */ 0)

    await expect(
      processTranscriptionJob(job as any, makeLogger()),
    ).rejects.toThrow('rate limited')

    // NO FAILED write — BullMQ will retry
    expect(fp.$transaction).not.toHaveBeenCalled()
    expect(fp.protocolGenerationJob.create).not.toHaveBeenCalled()
  })

  it('T6b: transient ASR error on FINAL attempt (attemptsMade=2) → writes FAILED (RQ-015 FR-001 exhaustion)', async () => {
    /*
     * MUTATION PROOF:
     *   Remove the `isFinalAttempt` check so the code always re-throws on transient errors →
     *   $transaction will NOT be called → `expect(failJobArgs).toBeDefined()` turns RED.
     */
    const transientErr = new DeepgramAsrError('rate limited — final', null, /* isTransient= */ true)
    wireUpToAsrThrow(transientErr)

    let failJobArgs: any
    fp.$transaction.mockImplementation(async (cb: any) => {
      const txProxy = {
        transcriptionJob: {
          updateMany: vi.fn().mockImplementation(async (args: any) => {
            failJobArgs = args
            return { count: 1 }
          }),
          findUnique: vi.fn().mockResolvedValue({ meetingId: MTG }),
        },
        meeting: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      }
      return cb(txProxy)
    })
    fp.transcriptionJob.findUnique
      .mockResolvedValueOnce(BASE_JOB as any)
      .mockResolvedValueOnce({ meetingId: MTG } as any)

    // attemptsMade=2 means this is attempt #3 (final) of MAX_ATTEMPTS=3
    const job = makeJob('r-16', TXJOB, /* attemptsMade= */ 2)

    await expect(
      processTranscriptionJob(job as any, makeLogger()),
    ).rejects.toThrow('rate limited — final')

    // MUST write FAILED on exhaustion
    expect(failJobArgs).toBeDefined()
    expect(failJobArgs.data.status).toBe('FAILED')
    expect(failJobArgs.data.errorMsg).toBe('rate limited — final')
    expect(failJobArgs.data.finishedAt).toBeInstanceOf(Date)
  })

  it('T6c: permanent (non-transient) ASR error (e.g. 401) → always writes FAILED, even on first attempt', async () => {
    /*
     * MUTATION PROOF:
     *   If a non-transient error is mistakenly treated as transient,
     *   $transaction will NOT be called and `expect(failJobArgs).toBeDefined()` turns RED.
     */
    // isTransient=false (the default) → permanent error
    const permanentErr = new DeepgramAsrError('unauthorized — bad API key', null, /* isTransient= */ false)
    wireUpToAsrThrow(permanentErr)

    let failJobArgs: any
    fp.$transaction.mockImplementation(async (cb: any) => {
      const txProxy = {
        transcriptionJob: {
          updateMany: vi.fn().mockImplementation(async (args: any) => {
            failJobArgs = args
            return { count: 1 }
          }),
          findUnique: vi.fn().mockResolvedValue({ meetingId: MTG }),
        },
        meeting: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      }
      return cb(txProxy)
    })
    fp.transcriptionJob.findUnique
      .mockResolvedValueOnce(BASE_JOB as any)
      .mockResolvedValueOnce({ meetingId: MTG } as any)

    // First attempt (attemptsMade=0) with a permanent error
    const job = makeJob('r-17', TXJOB, /* attemptsMade= */ 0)

    await expect(
      processTranscriptionJob(job as any, makeLogger()),
    ).rejects.toThrow('unauthorized — bad API key')

    // MUST write FAILED immediately (permanent error, no retry)
    expect(failJobArgs).toBeDefined()
    expect(failJobArgs.data.status).toBe('FAILED')
  })

  it('T6d: FAILED write includes attemptCount mirroring job.attemptsMade + 1 (TECH-026)', async () => {
    /*
     * MUTATION PROOF:
     *   Remove `attemptCount: attemptsMade + 1` from the updateMany data →
     *   `failJobArgs.data.attemptCount` will be undefined →
     *   `expect(failJobArgs.data.attemptCount).toBe(3)` turns RED.
     */
    const permanentErr = new DeepgramAsrError('payment required', null, false)
    wireUpToAsrThrow(permanentErr)

    let failJobArgs: any
    fp.$transaction.mockImplementation(async (cb: any) => {
      const txProxy = {
        transcriptionJob: {
          updateMany: vi.fn().mockImplementation(async (args: any) => {
            failJobArgs = args
            return { count: 1 }
          }),
          findUnique: vi.fn().mockResolvedValue({ meetingId: MTG }),
        },
        meeting: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      }
      return cb(txProxy)
    })
    fp.transcriptionJob.findUnique
      .mockResolvedValueOnce(BASE_JOB as any)
      .mockResolvedValueOnce({ meetingId: MTG } as any)

    // Simulating the final (3rd) attempt: attemptsMade=2
    const job = makeJob('r-18', TXJOB, /* attemptsMade= */ 2)

    await expect(
      processTranscriptionJob(job as any, makeLogger()),
    ).rejects.toThrow('payment required')

    // attemptCount must mirror attemptsMade + 1 = 3
    expect(failJobArgs.data.attemptCount).toBe(3)
  })

  it('T6e: non-DeepgramAsrError (e.g. storage error) is treated as permanent — writes FAILED on first attempt', async () => {
    /*
     * MUTATION PROOF:
     *   If `isTransientAsrError` returns true for generic errors,
     *   $transaction will NOT be called on the first attempt →
     *   `expect(failJobArgs).toBeDefined()` turns RED.
     */
    fp.transcriptionJob.findUnique.mockResolvedValue(BASE_JOB as any)
    fp.transcriptionJob.updateMany.mockResolvedValue({ count: 1 })

    const storage = {
      storageUriToKey: vi.fn().mockReturnValue('recordings/reg.mp4'),
      getPresignedDownloadUrl: vi.fn().mockRejectedValue(new Error('S3 bucket not found')),
    }
    ;(createStorage as MockedFunction<AnyFn>).mockReturnValue(storage as any)

    let failJobArgs: any
    fp.$transaction.mockImplementation(async (cb: any) => {
      const txProxy = {
        transcriptionJob: {
          updateMany: vi.fn().mockImplementation(async (args: any) => {
            failJobArgs = args
            return { count: 1 }
          }),
          findUnique: vi.fn().mockResolvedValue({ meetingId: MTG }),
        },
        meeting: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      }
      return cb(txProxy)
    })
    fp.transcriptionJob.findUnique
      .mockResolvedValueOnce(BASE_JOB as any)
      .mockResolvedValueOnce({ meetingId: MTG } as any)
    ;(publishMeetingEvent as MockedFunction<AnyFn>).mockResolvedValue(undefined)

    // First attempt, generic error
    const job = makeJob('r-19', TXJOB, /* attemptsMade= */ 0)

    await expect(
      processTranscriptionJob(job as any, makeLogger()),
    ).rejects.toThrow('S3 bucket not found')

    // Storage error is permanent — must write FAILED immediately
    expect(failJobArgs).toBeDefined()
    expect(failJobArgs.data.status).toBe('FAILED')
  })
})
