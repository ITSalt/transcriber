/**
 * F-004 drift lock — the worker's producer must use the SAME retry policy
 * constant as the API's producer.
 *
 * Honest labelling: this is a drift lock, not a defect proof. The worker side
 * was already correct before F-004; these assertions exist so that editing the
 * policy on one side and not the other fails loudly. The api-side proof lives in
 * `api/src/queue.regression.test.ts`.
 *
 * Kept in its own file so `queues.test.ts` (pure unit tests, no mocks) does not
 * need a `bullmq` mock.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { JOB_RETRY_OPTIONS, QueueName } from '@transcrib/shared'

vi.mock('bullmq', () => ({
  Queue: vi.fn().mockImplementation(() => ({ add: vi.fn(), close: vi.fn() })),
}))

const { Queue } = await import('bullmq')
const { createQueues } = await import('./queues.js')

const QueueMock = Queue as unknown as ReturnType<typeof vi.fn>

describe('F-004 — worker producer uses the shared retry policy', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  /* MUTATION PROOF: change `attempts` or `backoff.delay` in worker/src/queues.ts
   * to a local literal that differs from the shared constant -> deep equality
   * fails -> RED. */
  it('both worker queues are constructed with JOB_RETRY_OPTIONS', () => {
    createQueues('redis://localhost:6379')

    expect(QueueMock).toHaveBeenCalledWith(
      QueueName.Transcription,
      expect.objectContaining({ defaultJobOptions: JOB_RETRY_OPTIONS }),
    )
    expect(QueueMock).toHaveBeenCalledWith(
      QueueName.Protocol,
      expect.objectContaining({ defaultJobOptions: JOB_RETRY_OPTIONS }),
    )
  })

  /* Pins the cross-package invariant F-004 is about: api/ and worker/ resolve the
   * SAME object, because both import it from @transcrib/shared. */
  it('the policy is 3 attempts with exponential 5s backoff', () => {
    expect(JOB_RETRY_OPTIONS).toEqual({
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
    })
  })
})
