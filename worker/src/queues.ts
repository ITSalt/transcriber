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
 * @param redisUrl - Redis connection URL (e.g. redis://localhost:6379)
 * @returns Map of queue name to Queue instance
 */
export function createQueues(
  redisUrl: string,
): Record<QueueName, Queue> {
  const connection = parseRedisUrl(redisUrl)

  return {
    [QueueName.Transcription]: new Queue(QueueName.Transcription, { connection }),
    [QueueName.Protocol]: new Queue(QueueName.Protocol, { connection }),
  }
}

/**
 * Parse a Redis URL into BullMQ ConnectionOptions.
 * BullMQ accepts { host, port, password } or a full URL string via ioredis.
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
  return opts
}
