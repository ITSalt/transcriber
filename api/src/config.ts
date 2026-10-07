/**
 * TECH-005 — Config loader
 * Loads and validates environment variables via Zod.
 */
import 'dotenv/config'
import { z } from 'zod'

const EnvSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  HOST: z.string().default('0.0.0.0'),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1).default('redis://localhost:6379'),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  // FR-003 / D-20: login by PIN is enforced only when AUTH_REQUIRED=true. Off by default so
  // the API keeps serving the pre-login web (legacy principal = workspace «Роман») until the
  // owner has set PIN_PEPPER, created the users and switched it on.
  // Anything other than true/false (after trim + lower-case) is a startup error — a typo
  // must not silently leave the API open.
  AUTH_REQUIRED: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() !== '' ? v.trim().toLowerCase() : undefined),
    z
      .enum(['true', 'false'])
      .default('false')
      .transform((v) => v === 'true'),
  ),
  // D-8 / A-3: HMAC key of pin_lookup (≥ 16 chars; changing it invalidates every PIN).
  // Optional for startup: without it login answers 503 AUTH_NOT_CONFIGURED and the user CLI
  // refuses to run. An empty value (`PIN_PEPPER=` copied from .env.example) counts as unset.
  PIN_PEPPER: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    z.string().min(16).optional(),
  ),
})

export type Env = z.infer<typeof EnvSchema>

function loadConfig(): Env {
  const result = EnvSchema.safeParse(process.env)
  if (!result.success) {
    throw new Error(
      `Invalid environment configuration:\n${result.error.issues
        .map((i) => `  ${i.path.join('.')}: ${i.message}`)
        .join('\n')}`,
    )
  }
  return result.data
}

export const config: Env = loadConfig()
