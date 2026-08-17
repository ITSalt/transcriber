/**
 * F-004 — canonical BullMQ queue names and retry policy.
 *
 * BullMQ resolves a job's options from the **producing** Queue instance at
 * `add()` time (`Queue.add` merges `{...this.jobsOpts, ...opts}`). A producer
 * built without `defaultJobOptions` therefore stamps `attempts: 0` onto every
 * job it enqueues — the BullMQ `Job` constructor's own default — and
 * `Job.shouldRetryJob` (`attemptsMade + 1 < opts.attempts`) never fires. The
 * consumer's configuration cannot rescue it.
 *
 * This module is the single place those values live, so `api/` (producer) and
 * `worker/` (producer + consumer) cannot drift apart again. Duplicated literals
 * in two packages are exactly what let F-004 happen.
 *
 * NOTE: deliberately NO `import type { JobsOptions } from 'bullmq'`. `web/`
 * consumes `@transcrib/shared`, and `shared`'s only runtime dependency is zod;
 * adding bullmq here would pull a Redis client into the browser bundle. The
 * local structural interface below is assignable to BullMQ's
 * `DefaultJobOptions` without the coupling.
 */

/** Canonical BullMQ queue names. Values are Redis keys — never change them. */
export const QueueName = {
  Transcription: 'transcriptionJob',
  Protocol: 'protocolGenerationJob',
} as const;
export type QueueName = (typeof QueueName)[keyof typeof QueueName];

/** Structural mirror of the subset of BullMQ's DefaultJobOptions we set. */
export interface JobRetryOptions {
  attempts: number;
  backoff: { type: 'exponential' | 'fixed'; delay: number };
}

/**
 * Total attempts per job (initial try + retries), per FR-001
 * (RC-UC-200 / RC-UC-300). Also the fallback the worker uses to derive
 * `isFinalAttempt` when a job carries no `opts` (test fixtures only — a real
 * BullMQ Job always does).
 */
export const JOB_RETRY_ATTEMPTS = 3;

/** Base delay for the exponential backoff: 5s -> 10s -> 20s. */
export const JOB_RETRY_BACKOFF_DELAY_MS = 5000;

/**
 * The retry policy every producer of a transcription or protocol job MUST pass
 * as `defaultJobOptions`. Both queues share one policy today; split this into
 * two constants only when RC-UC-200 and RC-UC-300 genuinely diverge.
 */
export const JOB_RETRY_OPTIONS = {
  attempts: JOB_RETRY_ATTEMPTS,
  backoff: { type: 'exponential', delay: JOB_RETRY_BACKOFF_DELAY_MS },
} as const satisfies JobRetryOptions;
