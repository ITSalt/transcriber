/**
 * UC-100-BE — BullMQ producer helper for the API process.
 *
 * The API enqueues jobs; the worker process consumes them.
 * QueueName constants mirror worker/src/queues.ts to keep both sides in sync
 * without cross-package import (api/ must not import worker/).
 *
 * RQ-011: On successful upload completion, enqueue TranscriptionJob (BullMQ)
 * with status=QUEUED so the worker picks it up.
 */
import { Queue } from 'bullmq'
import type { TranscriptionJobPayload, ProtocolGenerationJobPayload } from '@transcrib/shared'
import { JOB_RETRY_OPTIONS, QueueName } from '@transcrib/shared'
import { config } from './config.js'

/**
 * F-004: BullMQ bakes job options from the PRODUCING Queue at `add()` time, so
 * every producer must carry the retry policy. Without `defaultJobOptions` these
 * queues stamped `attempts: 0` onto every job, `Job.shouldRetryJob` never fired,
 * and the FR-001 retry policy was inert on the UC-100 upload and UC-004 retry
 * paths — the worker's own config could not compensate.
 *
 * Queue names and the policy now come from `@transcrib/shared` so api/ and
 * worker/ cannot drift again (api/ must not import worker/).
 */

/** @internal Exported for unit testing only */
export function parseRedisUrl(redisUrl: string): { host: string; port: number; password?: string; db?: number } {
  const url = new URL(redisUrl)
  const opts: { host: string; port: number; password?: string; db?: number } = {
    host: url.hostname || 'localhost',
    port: url.port ? parseInt(url.port, 10) : 6379,
  }
  if (url.password) {
    opts.password = url.password
  }
  const dbSegment = url.pathname.replace(/^\//, '')
  if (dbSegment !== '') {
    const db = parseInt(dbSegment, 10)
    if (!isNaN(db)) {
      opts.db = db
    }
  }
  return opts
}

/**
 * Enqueue a TranscriptionJob onto the BullMQ transcription queue.
 * Called atomically after Recording + TranscriptionJob rows are persisted.
 *
 * RQ-011: create exactly one BullMQ job per TranscriptionJob DB row.
 */
export async function addTranscriptionJob(
  payload: TranscriptionJobPayload,
): Promise<void> {
  const connection = parseRedisUrl(config.REDIS_URL)
  const queue = new Queue(QueueName.Transcription, {
    connection,
    defaultJobOptions: JOB_RETRY_OPTIONS,
  })
  try {
    await queue.add('transcribe', payload)
  } finally {
    await queue.close()
  }
}

/**
 * Enqueue a ProtocolGenerationJob onto the BullMQ protocol generation queue.
 * Called after ProtocolGenerationJob row is persisted in the DB.
 *
 * UC-301-BE: Producer side — the worker (UC-300-BE) consumes and runs LLM generation.
 */
export async function enqueueProtocolGenerationJob(
  payload: ProtocolGenerationJobPayload,
): Promise<void> {
  const connection = parseRedisUrl(config.REDIS_URL)
  const queue = new Queue(QueueName.Protocol, {
    connection,
    defaultJobOptions: JOB_RETRY_OPTIONS,
  })
  try {
    await queue.add('generateProtocol', payload)
  } finally {
    await queue.close()
  }
}
