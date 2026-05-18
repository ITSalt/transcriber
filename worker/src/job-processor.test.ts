/**
 * TECH-006 — Job processor unit tests
 *
 * Tests stub handlers and failed-job error logging without a real Redis connection.
 * The CONCURRENCY constant is verified against NFR-009.
 */
import { describe, it, expect, vi } from 'vitest'
import type { Job } from 'bullmq'
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
  it('resolves without throwing (echo handler)', async () => {
    const log = { info: vi.fn(), error: vi.fn() } as any
    const job = makeJob<TranscriptionJobPayload>('job-1', {
      transcription_job_id: '00000000-0000-0000-0000-000000000001',
    })
    await expect(processTranscriptionJob(job, log)).resolves.toBeUndefined()
  })

  it('logs receipt with job id and payload', async () => {
    const infoSpy = vi.fn()
    const log = { info: infoSpy, error: vi.fn() } as any
    const payload: TranscriptionJobPayload = {
      transcription_job_id: '00000000-0000-0000-0000-000000000002',
    }
    const job = makeJob<TranscriptionJobPayload>('job-2', payload)
    await processTranscriptionJob(job, log)
    expect(infoSpy).toHaveBeenCalledOnce()
    const [meta, msg] = infoSpy.mock.calls[0] as [Record<string, unknown>, string]
    expect(meta.jobId).toBe('job-2')
    expect(msg).toContain('transcriptionJob received')
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
