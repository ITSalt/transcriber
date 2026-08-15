/**
 * F-004 regression — the API's BullMQ producers must stamp the canonical retry
 * policy onto every job they enqueue.
 *
 * WHY THE ASSERTION IS ON THE Queue CONSTRUCTOR, NOT ON `add()`:
 * BullMQ resolves a job's options at `add()` time by merging
 * `{...this.jobsOpts, ...opts}`, where `this.jobsOpts` comes from the Queue
 * constructor's `defaultJobOptions`. Here `add` is a mock, so that real merge
 * never runs — the constructor's second argument IS the thing that determines
 * `job.opts` in production. Asserting on it is therefore the faithful unit-level
 * check; the acceptance-level check is a live enqueue + `job.opts.attempts`
 * read-back from Redis (F-004 task.md:55-57).
 *
 * The arity guard (F004d) exists because the alternative implementation — passing
 * options as a third argument to `queue.add()` — would silently break four
 * exact-arity assertions in uc-100.test.ts / uc-004.test.ts. Failing here names
 * the cause instead.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { JOB_RETRY_OPTIONS, QueueName } from '@transcrib/shared'

vi.mock('./config.js', () => ({
  config: {
    PORT: 3000,
    HOST: '0.0.0.0',
    DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
    REDIS_URL: 'redis://localhost:6379',
    LOG_LEVEL: 'silent',
    NODE_ENV: 'test',
  },
}))

const mockQueueAdd = vi.fn()
const mockQueueClose = vi.fn()

vi.mock('bullmq', () => ({
  Queue: vi.fn().mockImplementation(() => ({
    add: mockQueueAdd,
    close: mockQueueClose,
  })),
}))

const { Queue } = await import('bullmq')
const { addTranscriptionJob, enqueueProtocolGenerationJob } = await import('./queue.js')

const QueueMock = Queue as unknown as ReturnType<typeof vi.fn>

describe('F-004 — API producers stamp the canonical retry policy', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  /* MUTATION PROOF: remove `defaultJobOptions` from the Queue constructor in
   * api/src/queue.ts -> the 2nd arg becomes `{ connection }` -> RED.
   * That is exactly the pre-fix state. */
  it('F004a: transcription producer sets defaultJobOptions on its Queue', async () => {
    await addTranscriptionJob({ transcription_job_id: 'job-1', speaker_count: null })

    expect(QueueMock).toHaveBeenCalledWith(
      QueueName.Transcription,
      expect.objectContaining({
        defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
      }),
    )
  })

  /* MUTATION PROOF: same removal on the protocol producer -> RED. */
  it('F004b: protocol producer sets defaultJobOptions on its Queue', async () => {
    await enqueueProtocolGenerationJob({ protocol_generation_job_id: 'pg-1' })

    expect(QueueMock).toHaveBeenCalledWith(
      QueueName.Protocol,
      expect.objectContaining({
        defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
      }),
    )
  })

  /* MUTATION PROOF (drift lock): change `attempts` in api/src/queue.ts only ->
   * deep equality against the shared constant fails -> RED. This is the
   * assertion that makes silent api/worker divergence impossible. */
  it('F004c: the policy is the shared constant, not a local literal', async () => {
    await addTranscriptionJob({ transcription_job_id: 'job-2', speaker_count: null })

    const ctorOptions = QueueMock.mock.calls[0]?.[1] as { defaultJobOptions?: unknown }
    expect(ctorOptions.defaultJobOptions).toEqual(JOB_RETRY_OPTIONS)
  })

  /* MUTATION PROOF: implement the fix as `queue.add(name, payload, opts)` ->
   * arity becomes 3 -> RED here, instead of as collateral damage across four
   * assertions in uc-100.test.ts / uc-004.test.ts. */
  it('F004d: queue.add keeps its two-argument arity', async () => {
    await addTranscriptionJob({ transcription_job_id: 'job-3', speaker_count: null })

    expect(mockQueueAdd).toHaveBeenCalledTimes(1)
    expect(mockQueueAdd.mock.calls[0]).toHaveLength(2)
  })
})
