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
import { processProtocolGenerationJob as runProtocolPipeline } from './jobs/protocol-generation.js'

export const CONCURRENCY = 1

/**
 * How long a worker holds a job's lock before BullMQ considers it stalled, in ms.
 *
 * Previously unset, i.e. BullMQ's 30 s default with a heartbeat every 15 s. Both
 * pipelines make long synchronous-looking provider calls (ffmpeg extraction into
 * a single Buffer, then a Deepgram request now budgeted at 570 s), and any stretch
 * that blocks the event loop past the renewal window makes BullMQ re-deliver the
 * job as stalled. That is not merely wasteful: a re-delivered job re-runs the
 * whole ASR/LLM call, so a false stall costs a duplicate provider charge.
 *
 * 60 s (renewed every 30 s) leaves generous headroom for a `Buffer.concat` of a
 * few hundred MB while still detecting a genuinely dead worker quickly. Recovery
 * of a real stall is safe now that both pipelines re-claim a PROCESSING row
 * (RC-UC-200 / RC-UC-300 recovery_procedure).
 */
export const LOCK_DURATION_MS = 60_000

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
 * UC-300: Protocol generation pipeline handler.
 * Delegates to the real pipeline in jobs/protocol-generation.ts.
 */
export async function processProtocolJob(
  job: Job<ProtocolGenerationJobPayload>,
  log: Logger,
): Promise<void> {
  await runProtocolPipeline(job, log)
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
    { connection, concurrency: CONCURRENCY, lockDuration: LOCK_DURATION_MS },
  )

  const protocolWorker = new Worker<ProtocolGenerationJobPayload>(
    QueueName.Protocol,
    (job) => processProtocolJob(job, log),
    { connection, concurrency: CONCURRENCY, lockDuration: LOCK_DURATION_MS },
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
