/**
 * TECH-006 — Worker config loader
 * Loads and validates environment variables via Zod.
 */
import 'dotenv/config'
import { z } from 'zod'

/** `VAR=` in a .env file means "unset" */
const blankAsUnset = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v)

/** WP-WORKER-03 (D-32): LLM provider selection. Resolved (defaults by key presence) in llm/provider.ts. */
export const LlmEnvSchema = z.object({
  LLM_PROVIDER: z.preprocess(blankAsUnset, z.enum(['openrouter', 'kieai']).optional()),
  LLM_MODEL: z.preprocess(blankAsUnset, z.string().optional()),
  OPENROUTER_API_KEY: z.preprocess(blankAsUnset, z.string().optional()),
  KIE_API_KEY: z.preprocess(blankAsUnset, z.string().optional()),
  /** per-request timeout of the LLM call; a timeout is a transient failure */
  LLM_TIMEOUT_MS: z.preprocess(blankAsUnset, z.coerce.number().int().min(1000).default(180_000)),
  /** OpenRouter reasoning: off = disabled (default), else the effort level (WP-WORKER-05) */
  LLM_REASONING: z.preprocess(blankAsUnset, z.enum(['off', 'low', 'medium', 'high']).default('off')),
  /** OpenRouter max_tokens of protocol generation (WP-WORKER-05) */
  LLM_MAX_TOKENS: z.preprocess(blankAsUnset, z.coerce.number().int().min(256).default(8192)),
})

const EnvSchema = LlmEnvSchema.extend({
  REDIS_URL: z.string().min(1).default('redis://localhost:6379'),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  /** Job concurrency per worker — NFR-009: 1 video at a time */
  JOB_CONCURRENCY: z.coerce.number().int().min(1).default(1),
})

export type WorkerEnv = z.infer<typeof EnvSchema>

export function loadConfig(env: Record<string, string | undefined> = process.env): WorkerEnv {
  const result = EnvSchema.safeParse(env)
  if (!result.success) {
    throw new Error(
      `Invalid environment configuration:\n${result.error.issues
        .map((i) => `  ${i.path.join('.')}: ${i.message}`)
        .join('\n')}`,
    )
  }
  return result.data
}

export const config: WorkerEnv = loadConfig()
