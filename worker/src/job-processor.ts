/**
 * TECH-006 — Job processor stubs
 *
 * These handlers are intentional stubs. Real logic is implemented in:
 *   - UC-200: processTranscriptionJob
 *   - UC-300: processProtocolJob
 *
 * Concurrency = 1 per NFR-009 (one video at a time per worker instance).
 */
import { Worker, type Job, type ConnectionOptions } from 'bullmq'
import type { Logger } from 'pino'
import { QueueName } from './queues.js'
import type { TranscriptionJobPayload, ProtocolGenerationJobPayload } from '@transcrib/shared'

export const CONCURRENCY = 1

/**
 * Stub handler for transcription jobs (UC-200).
 * Logs receipt and returns — real pipeline added in UC-200.
 */
export async function processTranscriptionJob(
  job: Job<TranscriptionJobPayload>,
  log: Logger,
): Promise<void> {
  log.info({ jobId: job.id, payload: job.data }, 'transcriptionJob received (stub)')
}

/**
 * Stub handler for protocol generation jobs (UC-300).
 * Logs receipt and returns — real pipeline added in UC-300.
 */
export async function processProtocolJob(
  job: Job<ProtocolGenerationJobPayload>,
  log: Logger,
): Promise<void> {
  log.info({ jobId: job.id, payload: job.data }, 'protocolGenerationJob received (stub)')
}

/**
 * Creates BullMQ Worker instances for all queues.
 *
 * @param connection - Redis connection options
 * @param log - Pino logger
 * @returns Array of started Worker instances
 */
export function createWorkers(connection: ConnectionOptions, log: Logger): Worker[] {
  const transcriptionWorker = new Worker<TranscriptionJobPayload>(
    QueueName.Transcription,
    (job) => processTranscriptionJob(job, log),
    { connection, concurrency: CONCURRENCY },
  )

  const protocolWorker = new Worker<ProtocolGenerationJobPayload>(
    QueueName.Protocol,
    (job) => processProtocolJob(job, log),
    { connection, concurrency: CONCURRENCY },
  )

  transcriptionWorker.on('failed', (job, err) => {
    log.error(
      { jobId: job?.id, queue: QueueName.Transcription, error_reason: err.message },
      'transcriptionJob failed',
    )
  })

  protocolWorker.on('failed', (job, err) => {
    log.error(
      { jobId: job?.id, queue: QueueName.Protocol, error_reason: err.message },
      'protocolGenerationJob failed',
    )
  })

  return [transcriptionWorker, protocolWorker]
}
