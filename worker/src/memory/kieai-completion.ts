/**
 * FR-006 — ILlmCompletionProvider on kie.ai (Claude Sonnet 4.6) for the memory steps.
 *
 * Same endpoint, auth and error classification as KieAiLlmProvider (worker/src/llm/kieai.ts,
 * whose helpers are reused), but the caller owns the system prompt. Lives in the memory
 * module because this package may only touch worker/src/{memory,graph}; it can move next
 * to KieAiLlmProvider later without changing callers.
 */
import { LLM_MODEL_DEFAULT, type ILlmCompletionProvider, type LlmCompletionInput, type LlmModel, type LlmResult } from '@transcrib/shared'
import { effectiveStatus, isTransientStatus, KieAiLlmError } from '../llm/kieai.js'

const KIE_API_BASE_URL = 'https://api.kie.ai/claude/v1'
const DEFAULT_MAX_TOKENS = 4096
/** a hung request must not hold the job lock forever; a timeout is transient (retry) */
const REQUEST_TIMEOUT_MS = 300_000

interface KieAiResponse {
  content?: Array<{ type: string; text?: string }>
  usage?: { input_tokens?: number; output_tokens?: number }
}

/** Removes a ```json … ``` fence around a JSON reply. */
export function stripCodeFence(text: string): string {
  const m = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(text.trim())
  return m ? m[1]! : text.trim()
}

export class KieAiCompletionProvider implements ILlmCompletionProvider {
  private readonly apiKey: string
  private readonly baseUrl: string
  private readonly timeoutMs: number

  constructor(opts?: { apiKey?: string; baseUrl?: string; timeoutMs?: number }) {
    const key = opts?.apiKey ?? process.env['KIE_API_KEY']
    if (!key) throw new KieAiLlmError('KIE_API_KEY is not set. Provide it as a constructor option or via process.env.')
    this.apiKey = key
    this.baseUrl = opts?.baseUrl ?? KIE_API_BASE_URL
    this.timeoutMs = opts?.timeoutMs ?? REQUEST_TIMEOUT_MS
  }

  async complete(input: LlmCompletionInput): Promise<LlmResult> {
    const model: LlmModel = input.model ?? LLM_MODEL_DEFAULT
    if (model !== 'claude-sonnet-4-6') {
      throw new KieAiLlmError(`kie.ai integration currently supports only claude-sonnet-4-6; got model=${model}`)
    }
    let response: Response
    try {
      response = await fetch(`${this.baseUrl}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` },
        body: JSON.stringify({
          model,
          system: input.system,
          messages: [{ role: 'user', content: input.user }],
          stream: false,
          max_tokens: input.maxTokens ?? DEFAULT_MAX_TOKENS,
        }),
        signal: AbortSignal.timeout(this.timeoutMs),
      })
    } catch (err) {
      throw new KieAiLlmError('Network error calling kie.ai API', { reason: err, isTransient: true })
    }

    let body: unknown
    try {
      body = await response.json()
    } catch (err) {
      if (!response.ok) {
        throw new KieAiLlmError(`kie.ai API error: HTTP ${response.status}`, {
          status: response.status,
          isTransient: isTransientStatus(response.status),
        })
      }
      throw new KieAiLlmError('Failed to parse kie.ai API response as JSON', { reason: err })
    }
    // provider errors may arrive inside an HTTP 200 envelope ({code, msg})
    const status = effectiveStatus(response.status, body)
    if (!response.ok || status !== 200) {
      const msg = (body as { msg?: unknown } | null)?.msg
      throw new KieAiLlmError(`kie.ai API error: code ${status}${typeof msg === 'string' && msg ? ` — ${msg}` : ''}`, {
        status,
        reason: body,
        isTransient: isTransientStatus(status),
      })
    }

    const data = body as KieAiResponse
    const raw = (data.content ?? [])
      .filter((b) => b.type === 'text' && typeof b.text === 'string')
      .map((b) => b.text as string)
      .join('')
      .trim()
    if (!raw) throw new KieAiLlmError('kie.ai API returned an empty or missing completion text', { reason: data })
    return {
      text: input.responseFormat === 'json' ? stripCodeFence(raw) : raw,
      model,
      tokensIn: data.usage?.input_tokens ?? 0,
      tokensOut: data.usage?.output_tokens ?? 0,
    }
  }
}
