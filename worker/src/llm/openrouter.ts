/**
 * WP-WORKER-03 — OpenRouter adapter (D-32)
 *
 * Implements ILlmProvider (protocol generation) and ILlmCompletionProvider (project-memory
 * steps) on OpenRouter's OpenAI-compatible chat endpoint. Node 20 built-in fetch, no new
 * dependency. Only the transport differs from kie.ai: the system/user texts come from the
 * same builders (./protocol-prompt.ts), so the prompt is byte-for-byte the one kie.ai gets.
 *
 * Request:
 *   POST {baseUrl}/chat/completions
 *   Authorization: Bearer {OPENROUTER_API_KEY}
 *   HTTP-Referer: https://transcriber.itsalt.ru, X-Title: Transcrib   (OpenRouter's attribution headers)
 *   { model, messages:[{role:'system',content},{role:'user',content}], max_tokens,
 *     response_format?: {type:'json_object'} }          (only for responseFormat 'json')
 *
 * Response:
 *   { model, choices:[{ message:{ content }, finish_reason }], usage:{ prompt_tokens, completion_tokens } }
 * Errors: HTTP status + { error:{ code, message, metadata } }; an upstream failure can also
 * arrive inside an HTTP 200 as the same `error` object, so classification runs on the
 * EFFECTIVE status (error.code when present), as for kie.ai.
 *
 * Classification (DEC-001): 408 / 429 / 5xx, transport failures and the request timeout are
 * transient; 400 / 401 / 402 / 403 / 413, any other 4xx, a malformed or empty reply are permanent.
 *
 * The model is fixed at construction (LLM_MODEL). `input.model` is ignored: callers pass the
 * kie.ai default ('claude-sonnet-4-6'), which is not an OpenRouter id. The model OpenRouter
 * actually used (response `model`) is what LlmResult.model reports.
 */
import type {
  ILlmCompletionProvider,
  ILlmProvider,
  LlmCompletionInput,
  LlmInput,
  LlmResult,
} from '@transcrib/shared'
import { stripCodeFence } from '../memory/kieai-completion.js'
import { LlmProviderError, bodyExcerpt } from './errors.js'
import { hasProtocolContext, loadProtocolSystemPrompt, renderProtocolUserMessage } from './protocol-prompt.js'

export const OPENROUTER_API_BASE_URL = 'https://openrouter.ai/api/v1'
export const OPENROUTER_DEFAULT_MODEL = 'anthropic/claude-haiku-5.5'
export const OPENROUTER_DEFAULT_TIMEOUT_MS = 180_000
const DEFAULT_MAX_TOKENS = 4096
const REFERER = 'https://transcriber.itsalt.ru'
const TITLE = 'Transcrib'
/** how much of an error body goes to the message / logs */
const ERROR_BODY_MAX = 300

export class OpenRouterLlmError extends LlmProviderError {
  constructor(message: string, opts?: { status?: number; reason?: unknown; isTransient?: boolean }) {
    super(message, opts)
    this.name = 'OpenRouterLlmError'
  }
}

export function isTransientOpenRouterStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500
}

interface OpenRouterResponse {
  model?: string
  choices?: Array<{ message?: { content?: unknown } }>
  usage?: { prompt_tokens?: number; completion_tokens?: number }
  error?: { code?: unknown; message?: unknown }
}

interface ChatRequest {
  system: string
  user: string
  maxTokens: number
  json: boolean
}

export class OpenRouterLlmProvider implements ILlmProvider, ILlmCompletionProvider {
  private readonly apiKey: string
  private readonly baseUrl: string
  private readonly model: string
  private readonly timeoutMs: number

  constructor(opts?: { apiKey?: string; baseUrl?: string; model?: string; timeoutMs?: number }) {
    const key = opts?.apiKey ?? process.env['OPENROUTER_API_KEY']
    if (!key) {
      throw new OpenRouterLlmError('OPENROUTER_API_KEY is not set. Provide it as a constructor option or via process.env.')
    }
    this.apiKey = key
    this.baseUrl = opts?.baseUrl ?? OPENROUTER_API_BASE_URL
    this.model = opts?.model ?? OPENROUTER_DEFAULT_MODEL
    this.timeoutMs = opts?.timeoutMs ?? OPENROUTER_DEFAULT_TIMEOUT_MS
  }

  /** ILlmProvider — protocol generation. Same prompt builders as kie.ai. */
  async generate(input: LlmInput): Promise<LlmResult> {
    return this.chat({
      system: loadProtocolSystemPrompt(input.language, hasProtocolContext(input.context)).text,
      user: renderProtocolUserMessage(input.prompt, input.context),
      maxTokens: DEFAULT_MAX_TOKENS,
      json: false,
    })
  }

  /** ILlmCompletionProvider — project-memory steps. */
  async complete(input: LlmCompletionInput): Promise<LlmResult> {
    const json = input.responseFormat === 'json'
    const res = await this.chat({
      system: input.system,
      user: input.user,
      maxTokens: input.maxTokens ?? DEFAULT_MAX_TOKENS,
      json,
    })
    return json ? { ...res, text: stripCodeFence(res.text) } : res
  }

  /** Error text without the key, whatever an upstream echoes back. */
  private scrub(text: string): string {
    return text.split(this.apiKey).join('[REDACTED]')
  }

  private async chat(req: ChatRequest): Promise<LlmResult> {
    const requestBody = {
      model: this.model,
      messages: [
        { role: 'system', content: req.system },
        { role: 'user', content: req.user },
      ],
      max_tokens: req.maxTokens,
      ...(req.json ? { response_format: { type: 'json_object' } } : {}),
    }

    let response: Response
    let body: unknown
    try {
      response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
          'HTTP-Referer': REFERER,
          'X-Title': TITLE,
        },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(this.timeoutMs),
      })
      const raw = await response.text()
      try {
        body = JSON.parse(raw)
      } catch {
        body = raw
      }
    } catch (err) {
      // DNS, reset, the request timeout (also while reading the body): all retriable
      const timedOut = err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')
      throw new OpenRouterLlmError(
        timedOut ? `OpenRouter request timed out after ${this.timeoutMs} ms` : 'Network error calling OpenRouter API',
        { reason: err, isTransient: true },
      )
    }

    const data = typeof body === 'object' && body !== null ? (body as OpenRouterResponse) : undefined
    // an upstream failure may come inside HTTP 200 as { error: { code, message } }
    const bodyCode = typeof data?.error?.code === 'number' ? data.error.code : undefined
    const status = bodyCode ?? response.status
    if (!response.ok || data?.error) {
      const excerpt = bodyExcerpt(body, ERROR_BODY_MAX)
      throw new OpenRouterLlmError(
        this.scrub(`OpenRouter API error: HTTP ${response.status}${status !== response.status ? ` (code ${status})` : ''}${excerpt ? ` — ${excerpt}` : ''}`),
        { status, isTransient: isTransientOpenRouterStatus(status) },
      )
    }

    if (!data) {
      throw new OpenRouterLlmError('Failed to parse OpenRouter API response as JSON', { status: response.status })
    }
    const content = data.choices?.[0]?.message?.content
    const text = typeof content === 'string' ? content.trim() : ''
    if (!text) {
      throw new OpenRouterLlmError('OpenRouter API returned an empty or missing completion text', { status: response.status })
    }
    return {
      text,
      model: typeof data.model === 'string' && data.model ? data.model : this.model,
      tokensIn: data.usage?.prompt_tokens ?? 0,
      tokensOut: data.usage?.completion_tokens ?? 0,
    }
  }
}

/** One class serves both interfaces; this alias names the completion role at call sites. */
export const OpenRouterCompletionProvider = OpenRouterLlmProvider
