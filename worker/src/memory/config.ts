/** FR-006 — tunables of the project-memory pipeline (env, all optional). */
import { z } from 'zod'

const EnvSchema = z.object({
  /** D-14: LLM changes below this confidence go to the review queue */
  MEMORY_CONFIDENCE_THRESHOLD: z.coerce.number().min(0).max(1).default(0.7),
  /** more open tasks than this → lexical prefilter before MEMORY_RESOLVE */
  MEMORY_CANDIDATE_LIMIT: z.coerce.number().int().min(1).default(200),
  /** GraphOutbox drain period */
  MEMORY_OUTBOX_POLL_MS: z.coerce.number().int().min(100).default(10_000),
  /** prompt memory budget (~4 chars per token → ≈ 5 000 tokens) */
  MEMORY_PROMPT_MAX_CHARS: z.coerce.number().int().min(1000).default(20_000),
})

export type MemorySettings = {
  confidenceThreshold: number
  candidateLimit: number
  outboxPollMs: number
  promptMaxChars: number
}

export function readMemorySettings(env: NodeJS.ProcessEnv = process.env): MemorySettings {
  const e = EnvSchema.parse(env)
  return {
    confidenceThreshold: e.MEMORY_CONFIDENCE_THRESHOLD,
    candidateLimit: e.MEMORY_CANDIDATE_LIMIT,
    outboxPollMs: e.MEMORY_OUTBOX_POLL_MS,
    promptMaxChars: e.MEMORY_PROMPT_MAX_CHARS,
  }
}
