/**
 * TECH-006 — Queue registry
 * Defines QueueName enum and creates BullMQ Queue instances for the worker.
 *
 * Job payload Zod schemas live in shared/:
 *   TranscriptionJobPayload  — shared/src/api/uc200.ts
 *   ProtocolGenerationJobPayload — shared/src/api/uc300.ts
 */
import { Queue, type ConnectionOptions } from 'bullmq'

/** Canonical BullMQ queue names — used by both producer (api/) and consumer (worker/) */
export const QueueName = {
  Transcription: 'transcriptionJob',
  Protocol: 'protocolGenerationJob',
} as const

export type QueueName = (typeof QueueName)[keyof typeof QueueName]

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
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
      },
    }),
    [QueueName.Protocol]: new Queue(QueueName.Protocol, {
      connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
      },
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
