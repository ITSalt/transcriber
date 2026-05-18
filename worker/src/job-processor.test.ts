/**
 * TECH-006 — Job processor unit tests
 *
 * Tests handler wiring and failed-job error logging without a real Redis
 * connection or Prisma connection.
 * The CONCURRENCY constant is verified against NFR-009.
 *
 * UC-200: processTranscriptionJob now delegates to the real pipeline.
 * We verify it delegates without error using a mocked pipeline (prisma + storage
 * stubs injected).
 */
import { describe, it, expect, vi } from 'vitest'
import type { Job } from 'bullmq'

// Mock all infrastructure before importing the handlers
vi.mock('./lib/prisma.js', () => ({
  prisma: {
    transcriptionJob: {
      findUnique: vi.fn().mockResolvedValue({
        id: '00000000-0000-0000-0000-000000000001',
        meetingId: '11111111-1111-1111-1111-111111111111',
        status: 'DONE', // terminal — skips immediately (idempotency guard)
        startedAt: null,
        finishedAt: null,
        errorMsg: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        meeting: {
          id: '11111111-1111-1111-1111-111111111111',
          title: 'Test',
          status: 'TRANSCRIBED',
          language: 'AUTO',
          createdAt: new Date(),
          updatedAt: new Date(),
          recording: null,
        },
      }),
      updateMany: vi.fn(),
    },
    $transaction: vi.fn(),
    protocolGenerationJob: { create: vi.fn() },
    recording: { update: vi.fn() },
    meeting: { update: vi.fn(), updateMany: vi.fn() },
    transcript: { create: vi.fn() },
  },
}))
vi.mock('./lib/storage.js', () => ({ createStorage: vi.fn() }))
vi.mock('./lib/ffmpeg.js', () => ({ extractAudio: vi.fn() }))
vi.mock('./asr/deepgram-adapter.js', () => ({ DeepgramAsrProvider: vi.fn() }))
vi.mock('./lib/publisher.js', () => ({ publishMeetingEvent: vi.fn().mockResolvedValue(undefined) }))

import { processTranscriptionJob, processProtocolJob, CONCURRENCY } from './job-processor.js'
import type { TranscriptionJobPayload, ProtocolGenerationJobPayload } from '@transcrib/shared'

/** Minimal Job stub — only the fields our handlers read */
function makeJob<T>(id: string, data: T): Job<T> {
  return { id, data } as unknown as Job<T>
}

describe('CONCURRENCY', () => {
  it('is 1 per NFR-009', () => {
    expect(CONCURRENCY).toBe(1)
  })
})

describe('processTranscriptionJob', () => {
  it('resolves without throwing (delegates to pipeline; job is already DONE)', async () => {
    const log = { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() } as any
    const job = makeJob<TranscriptionJobPayload>('job-1', {
      transcription_job_id: '00000000-0000-0000-0000-000000000001',
    })
    await expect(processTranscriptionJob(job, log)).resolves.toBeUndefined()
  })

  it('calls log.info with job start details', async () => {
    const infoSpy = vi.fn()
    const log = { info: infoSpy, error: vi.fn(), warn: vi.fn(), debug: vi.fn() } as any
    const payload: TranscriptionJobPayload = {
      transcription_job_id: '00000000-0000-0000-0000-000000000002',
    }
    const job = makeJob<TranscriptionJobPayload>('job-2', payload)
    await processTranscriptionJob(job, log)
    expect(infoSpy).toHaveBeenCalled()
    // First log.info call includes the jobId
    const firstCall = infoSpy.mock.calls[0] as [Record<string, unknown>, string]
    expect(firstCall[0]).toHaveProperty('jobId', 'job-2')
  })
})

describe('processProtocolJob', () => {
  it('resolves without throwing (echo handler)', async () => {
    const log = { info: vi.fn(), error: vi.fn() } as any
    const job = makeJob<ProtocolGenerationJobPayload>('job-3', {
      protocol_generation_job_id: '00000000-0000-0000-0000-000000000003',
    })
    await expect(processProtocolJob(job, log)).resolves.toBeUndefined()
  })

  it('logs receipt with job id and payload', async () => {
    const infoSpy = vi.fn()
    const log = { info: infoSpy, error: vi.fn() } as any
    const payload: ProtocolGenerationJobPayload = {
      protocol_generation_job_id: '00000000-0000-0000-0000-000000000004',
    }
    const job = makeJob<ProtocolGenerationJobPayload>('job-4', payload)
    await processProtocolJob(job, log)
    expect(infoSpy).toHaveBeenCalledOnce()
    const [meta, msg] = infoSpy.mock.calls[0] as [Record<string, unknown>, string]
    expect(meta.jobId).toBe('job-4')
    expect(msg).toContain('protocolGenerationJob received')
  })
})
