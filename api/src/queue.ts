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
import type { TranscriptionJobPayload } from '@transcrib/shared'
import { config } from './config.js'

/** Canonical BullMQ queue name for transcription jobs (mirrors worker/src/queues.ts) */
const TRANSCRIPTION_QUEUE_NAME = 'transcriptionJob'

function parseRedisUrl(redisUrl: string): { host: string; port: number; password?: string } {
  const url = new URL(redisUrl)
  const opts: { host: string; port: number; password?: string } = {
    host: url.hostname || 'localhost',
    port: url.port ? parseInt(url.port, 10) : 6379,
  }
  if (url.password) {
    opts.password = url.password
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
  const queue = new Queue(TRANSCRIPTION_QUEUE_NAME, { connection })
  try {
    await queue.add('transcribe', payload)
  } finally {
    await queue.close()
  }
}
