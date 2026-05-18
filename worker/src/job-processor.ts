/**
 * TECH-006 — Job processor
 *
 * Wires real pipeline handlers:
 *   - UC-200: processTranscriptionJob (worker/src/jobs/transcription.ts)
 *   - UC-300: processProtocolJob (stub, implemented in UC-300)
 *
 * Concurrency = 1 per NFR-009 (one video at a time per worker instance).
 */
import { Worker, type Job, type ConnectionOptions } from 'bullmq'
import type { Logger } from 'pino'
import { QueueName } from './queues.js'
import type { TranscriptionJobPayload, ProtocolGenerationJobPayload } from '@transcrib/shared'
import { processTranscriptionJob as runTranscriptionPipeline } from './jobs/transcription.js'

export const CONCURRENCY = 1

/**
 * UC-200: Transcription pipeline handler.
 * Delegates to the real pipeline in jobs/transcription.ts.
 */
export async function processTranscriptionJob(
  job: Job<TranscriptionJobPayload>,
  log: Logger,
): Promise<void> {
  await runTranscriptionPipeline(job, log)
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
