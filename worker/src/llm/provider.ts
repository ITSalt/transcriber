/**
 * WP-WORKER-03 (D-32) — the one place that picks the LLM vendor and model from env.
 *
 *   LLM_PROVIDER = openrouter | kieai
 *       unset → openrouter when OPENROUTER_API_KEY is set, else kieai (stands without a key keep working)
 *   LLM_MODEL    = model id of that provider
 *       unset → anthropic/claude-haiku-5.5 (openrouter) / claude-sonnet-4-6 (kieai)
 *   OPENROUTER_API_KEY / KIE_API_KEY — credentials; LLM_TIMEOUT_MS — OpenRouter request timeout (default 180000)
 *
 * An unknown LLM_PROVIDER, a missing key for the chosen provider, or a model kie.ai cannot serve
 * is a configuration error thrown here (worker/src/config.ts also rejects an unknown provider at start).
 */
import { LLM_MODEL_DEFAULT, type ILlmCompletionProvider, type ILlmProvider } from '@transcrib/shared'
import { LlmEnvSchema } from '../config.js'
import { KieAiCompletionProvider } from '../memory/kieai-completion.js'
import { KieAiLlmProvider } from './kieai.js'
import { OPENROUTER_DEFAULT_MODEL, OpenRouterLlmProvider } from './openrouter.js'

export type LlmProviderName = 'openrouter' | 'kieai'

export interface LlmSettings {
  provider: LlmProviderName
  model: string
  timeoutMs: number
  openrouterApiKey?: string
  kieApiKey?: string
}

export class LlmConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'LlmConfigError'
  }
}

export function resolveLlmSettings(env: Record<string, string | undefined> = process.env): LlmSettings {
  const parsed = LlmEnvSchema.safeParse(env)
  if (!parsed.success) {
    throw new LlmConfigError(
      `Invalid LLM configuration: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}` +
        ' (LLM_PROVIDER must be "openrouter" or "kieai")',
    )
  }
  const e = parsed.data
  const provider: LlmProviderName = e.LLM_PROVIDER ?? (e.OPENROUTER_API_KEY ? 'openrouter' : 'kieai')
  const model = e.LLM_MODEL ?? (provider === 'openrouter' ? OPENROUTER_DEFAULT_MODEL : LLM_MODEL_DEFAULT)
  if (provider === 'openrouter' && !e.OPENROUTER_API_KEY) {
    throw new LlmConfigError('LLM_PROVIDER=openrouter requires OPENROUTER_API_KEY')
  }
  if (provider === 'kieai' && model !== LLM_MODEL_DEFAULT) {
    throw new LlmConfigError(`LLM_PROVIDER=kieai supports only LLM_MODEL=${LLM_MODEL_DEFAULT}; got ${model}`)
  }
  return {
    provider,
    model,
    timeoutMs: e.LLM_TIMEOUT_MS,
    openrouterApiKey: e.OPENROUTER_API_KEY,
    kieApiKey: e.KIE_API_KEY,
  }
}

/** The startup line: `llm provider: <provider> model: <model>` */
export function describeLlmSettings(s: Pick<LlmSettings, 'provider' | 'model'>): string {
  return `llm provider: ${s.provider} model: ${s.model}`
}

export function createLlmProvider(env: Record<string, string | undefined> = process.env): ILlmProvider {
  const s = resolveLlmSettings(env)
  return s.provider === 'openrouter'
    ? new OpenRouterLlmProvider({ apiKey: s.openrouterApiKey, model: s.model, timeoutMs: s.timeoutMs })
    : new KieAiLlmProvider({ apiKey: s.kieApiKey })
}

export function createCompletionProvider(env: Record<string, string | undefined> = process.env): ILlmCompletionProvider {
  const s = resolveLlmSettings(env)
  return s.provider === 'openrouter'
    ? new OpenRouterLlmProvider({ apiKey: s.openrouterApiKey, model: s.model, timeoutMs: s.timeoutMs })
    : new KieAiCompletionProvider({ apiKey: s.kieApiKey })
}
