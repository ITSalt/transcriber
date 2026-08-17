/**
 * TECH-006 — Queue registry
 * Defines QueueName enum and creates BullMQ Queue instances for the worker.
 *
 * Job payload Zod schemas live in shared/:
 *   TranscriptionJobPayload  — shared/src/api/uc200.ts
 *   ProtocolGenerationJobPayload — shared/src/api/uc300.ts
 */
import { Queue, type ConnectionOptions } from 'bullmq'
import { JOB_RETRY_OPTIONS, QueueName } from '@transcrib/shared'

/**
 * Canonical BullMQ queue names now live in `@transcrib/shared` so the api/ and
 * worker/ producers cannot drift (F-004). Re-exported here to keep the existing
 * `from './queues.js'` import sites untouched.
 */
export { QueueName } from '@transcrib/shared'

/**
 * Creates BullMQ Queue instances connected to the provided Redis URL.
 *
 * RC-UC-200 FR-001: transcription queue defaults to attempts=3 + exponential backoff
 * (initial 5s, multiplier 2: 5s, 10s, 20s) so BullMQ retries transient Deepgram errors.
 * RC-UC-300 FR-001: protocol queue mirrors the same retry config for transient kie.ai errors.
 *
 * @param redisUrl - Redis connection URL (e.g. redis://localhost:6379)
 * @returns Map of queue name to Queue instance
 */
export function createQueues(
  redisUrl: string,
): Record<QueueName, Queue> {
  const connection = parseRedisUrl(redisUrl)

  return {
    [QueueName.Transcription]: new Queue(QueueName.Transcription, {
      connection,
      defaultJobOptions: JOB_RETRY_OPTIONS,
    }),
    [QueueName.Protocol]: new Queue(QueueName.Protocol, {
      connection,
      defaultJobOptions: JOB_RETRY_OPTIONS,
    }),
  }
}

/**
 * Parse a Redis URL into BullMQ ConnectionOptions.
 * BullMQ accepts { host, port, password } or a full URL string via ioredis.
 * The URL path segment (e.g. /1) is parsed as the Redis db-index.
 */
export function parseRedisUrl(redisUrl: string): ConnectionOptions {
  const url = new URL(redisUrl)
  const opts: ConnectionOptions = {
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
