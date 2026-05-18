/**
 * TECH-006 — Worker config loader
 * Loads and validates environment variables via Zod.
 */
import 'dotenv/config'
import { z } from 'zod'

const EnvSchema = z.object({
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
