/**
 * WP-WORKER-03 — OpenRouter adapter. fetch is stubbed; no key or network needed.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ProxyAgent } from 'undici'
import { resetOutboundDispatcher } from '../lib/outbound-proxy.js'
import { isTransientLlmError } from './errors.js'
import { KieAiLlmProvider } from './kieai.js'
import { OpenRouterCompletionProvider, OpenRouterLlmError, OpenRouterLlmProvider } from './openrouter.js'

const KEY = 'sk-or-secret-key-123'
const ok = (over: Record<string, unknown> = {}) => ({
  id: 'gen-1',
  model: 'anthropic/claude-haiku-5.5-20260901',
  choices: [{ message: { role: 'assistant', content: '  # Protocol\n  ' }, finish_reason: 'stop' }],
  usage: { prompt_tokens: 100, completion_tokens: 50 },
  ...over,
})
const reply = (status: number, body: unknown) =>
  vi.fn(async () => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status }))
const provider = (opts: Partial<ConstructorParameters<typeof OpenRouterLlmProvider>[0] & object> = {}) =>
  new OpenRouterLlmProvider({ apiKey: KEY, baseUrl: 'https://or.test/api/v1', ...opts })
const callOf = (f: ReturnType<typeof vi.fn>) => f.mock.calls[0] as unknown as [string, RequestInit]

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('OpenRouterLlmProvider.generate', () => {
  it('posts system+user messages with max_tokens 8192, reasoning off, Bearer and attribution headers', async () => {
    const f = reply(200, ok())
    vi.stubGlobal('fetch', f)
    await provider().generate({ prompt: 'TRANSCRIPT', language: 'EN' })
    const [url, init] = callOf(f)
    expect(url).toBe('https://or.test/api/v1/chat/completions')
    expect(init.method).toBe('POST')
    expect(init.headers).toMatchObject({
      Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://transcriber.itsalt.ru',
      'X-Title': 'Transcrib',
    })
    const body = JSON.parse(init.body as string)
    expect(body.model).toBe('anthropic/claude-haiku-5.5')
    expect(body.max_tokens).toBe(8192)
    expect(body.messages.map((m: { role: string }) => m.role)).toEqual(['system', 'user'])
    expect(body.messages[1].content).toContain('TRANSCRIPT')
    expect(body.response_format).toBeUndefined()
    expect(init.signal).toBeInstanceOf(AbortSignal)
  })

  it('maps the reply: trimmed text, tokens, and the model OpenRouter reports', async () => {
    vi.stubGlobal('fetch', reply(200, ok()))
    expect(await provider().generate({ prompt: 'p', language: 'RU' })).toEqual({
      text: '# Protocol',
      model: 'anthropic/claude-haiku-5.5-20260901',
      tokensIn: 100,
      tokensOut: 50,
    })
  })

  it('falls back to the configured model when the reply has none; ignores input.model', async () => {
    const f = reply(200, ok({ model: undefined }))
    vi.stubGlobal('fetch', f)
    const res = await provider().generate({ prompt: 'p', language: 'EN', model: 'claude-sonnet-4-6' })
    expect(res.model).toBe('anthropic/claude-haiku-5.5')
    expect(JSON.parse(callOf(f)[1].body as string).model).toBe('anthropic/claude-haiku-5.5')
  })

  it('an empty completion or a reply without choices is permanent', async () => {
    for (const body of [ok({ choices: [{ message: { content: '  ' } }] }), { id: 'x' }, ok({ choices: [] })]) {
      vi.stubGlobal('fetch', reply(200, body))
      const err = await provider().generate({ prompt: 'p', language: 'EN' }).catch((e: unknown) => e)
      expect(err).toBeInstanceOf(OpenRouterLlmError)
      expect(isTransientLlmError(err)).toBe(false)
    }
  })

  it.each([408, 429, 500, 502, 503])('HTTP %i is transient', async (status) => {
    vi.stubGlobal('fetch', reply(status, { error: { code: status, message: 'upstream down', metadata: { raw: 'x' } } }))
    const err = await provider().generate({ prompt: 'p', language: 'EN' }).catch((e: unknown) => e)
    expect(err).toMatchObject({ status, isTransient: true })
    expect(isTransientLlmError(err)).toBe(true)
    expect((err as Error).message).toContain('upstream down')
  })

  it.each([400, 401, 402, 403, 413])('HTTP %i is permanent', async (status) => {
    vi.stubGlobal('fetch', reply(status, { error: { code: status, message: 'nope' } }))
    const err = await provider().generate({ prompt: 'p', language: 'EN' }).catch((e: unknown) => e)
    expect(err).toMatchObject({ status, isTransient: false })
    expect(isTransientLlmError(err)).toBe(false)
  })

  it('an error object inside HTTP 200 is classified by its code', async () => {
    vi.stubGlobal('fetch', reply(200, { error: { code: 502, message: 'provider returned error' } }))
    expect(await provider().generate({ prompt: 'p', language: 'EN' }).catch((e: unknown) => e)).toMatchObject({ status: 502, isTransient: true })
    vi.stubGlobal('fetch', reply(200, { error: { code: 401, message: 'bad key' } }))
    expect(await provider().generate({ prompt: 'p', language: 'EN' }).catch((e: unknown) => e)).toMatchObject({ status: 401, isTransient: false })
  })

  it('a non-JSON error body is kept as an excerpt (300 chars max)', async () => {
    vi.stubGlobal('fetch', reply(502, '<html>' + 'x'.repeat(1000)))
    const err = (await provider().generate({ prompt: 'p', language: 'EN' }).catch((e: unknown) => e)) as Error
    expect(err.message.length).toBeLessThan(450)
    expect(err).toMatchObject({ status: 502, isTransient: true })
  })

  it('a network failure is transient', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('fetch failed') }))
    expect(await provider().generate({ prompt: 'p', language: 'EN' }).catch((e: unknown) => e)).toMatchObject({ isTransient: true })
  })

  it('a request timeout is transient', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((_u: string, init: RequestInit) => new Promise((_res, rej) => {
        init.signal!.addEventListener('abort', () => rej(init.signal!.reason))
      })),
    )
    const err = await provider({ timeoutMs: 20 }).generate({ prompt: 'p', language: 'EN' }).catch((e: unknown) => e)
    expect(err).toMatchObject({ isTransient: true })
    expect((err as Error).message).toMatch(/timed out/)
  })

  it('never puts the API key into an error message, even when upstream echoes it', async () => {
    vi.stubGlobal('fetch', reply(401, { error: { code: 401, message: `Invalid key ${KEY}` } }))
    const err = (await provider().generate({ prompt: 'p', language: 'EN' }).catch((e: unknown) => e)) as Error
    expect(err.message).not.toContain(KEY)
    expect(err.message).toContain('[REDACTED]')
  })

  it('requires a key', () => {
    const saved = process.env['OPENROUTER_API_KEY']
    delete process.env['OPENROUTER_API_KEY']
    try {
      expect(() => new OpenRouterLlmProvider()).toThrowError(/OPENROUTER_API_KEY/)
    } finally {
      if (saved !== undefined) process.env['OPENROUTER_API_KEY'] = saved
    }
  })
})

describe('OpenRouterCompletionProvider.complete', () => {
  it('json: response_format json_object, caller prompts, maxTokens, code fence stripped', async () => {
    const f = reply(200, ok({ choices: [{ message: { content: '```json\n{"tasks":[]}\n```' } }] }))
    vi.stubGlobal('fetch', f)
    const res = await new OpenRouterCompletionProvider({ apiKey: KEY, baseUrl: 'https://or.test/api/v1' }).complete({
      system: 'SYS',
      user: 'USER',
      responseFormat: 'json',
      maxTokens: 8192,
    })
    expect(res.text).toBe('{"tasks":[]}')
    expect(res.tokensIn).toBe(100)
    const body = JSON.parse(callOf(f)[1].body as string)
    expect(body).toMatchObject({
      messages: [{ role: 'system', content: 'SYS' }, { role: 'user', content: 'USER' }],
      max_tokens: 8192,
      response_format: { type: 'json_object' },
    })
  })

  it('text: no response_format, default max_tokens, text untouched', async () => {
    const f = reply(200, ok({ choices: [{ message: { content: '```\nkeep\n```' } }] }))
    vi.stubGlobal('fetch', f)
    const res = await provider().complete({ system: 's', user: 'u' })
    expect(res.text).toBe('```\nkeep\n```')
    const body = JSON.parse(callOf(f)[1].body as string)
    expect(body.max_tokens).toBe(8192)
    expect(body.response_format).toBeUndefined()
  })

  it('errors are classified like generate()', async () => {
    vi.stubGlobal('fetch', reply(503, { error: { code: 503, message: 'x' } }))
    expect(isTransientLlmError(await provider().complete({ system: 's', user: 'u' }).catch((e: unknown) => e))).toBe(true)
  })
})

describe('prompt parity with kie.ai (only the transport differs)', () => {
  it.each([
    ['EN', undefined],
    ['RU', undefined],
    ['RU', { notes: 'Check </notes> escaping', glossary: 'ARR — annual recurring revenue' }],
  ] as const)('language=%s context=%j: system and user texts equal byte for byte', async (language, context) => {
    const input = { prompt: '[Speaker 1] Привет, hello.', language, ...(context ? { context } : {}) }
    const orFetch = reply(200, ok())
    vi.stubGlobal('fetch', orFetch)
    await provider().generate(input)
    const or = JSON.parse(callOf(orFetch)[1].body as string)

    const kieFetch = reply(200, { content: [{ type: 'text', text: 'x' }], usage: {} })
    vi.stubGlobal('fetch', kieFetch)
    await new KieAiLlmProvider({ apiKey: 'k', baseUrl: 'https://kie.test' }).generate(input)
    const kie = JSON.parse(callOf(kieFetch)[1].body as string)

    expect(or.messages[0].content).toBe(kie.system)
    expect(or.messages[1].content).toBe(kie.messages[0].content)
    // WP-WORKER-05: the OpenRouter limit is LLM_MAX_TOKENS (8192); the kie.ai default stays 4096
    expect(or.max_tokens).toBe(8192)
    expect(kie.max_tokens).toBe(4096)
  })
})

describe('reasoning, max_tokens and empty-reply diagnostics (WP-WORKER-05)', () => {
  const bodyOf = (f: ReturnType<typeof vi.fn>) => JSON.parse(callOf(f)[1].body as string)
  const exhausted = (over: Record<string, unknown> = {}) =>
    ok({
      choices: [{ message: { content: null }, finish_reason: 'length' }],
      usage: { prompt_tokens: 34441, completion_tokens: 4096, completion_tokens_details: { reasoning_tokens: 4096 } },
      ...over,
    })

  it('reasoning is {enabled:false} by default and {effort} when set', async () => {
    const f = reply(200, ok())
    vi.stubGlobal('fetch', f)
    await provider().generate({ prompt: 'p', language: 'EN' })
    expect(bodyOf(f).reasoning).toEqual({ enabled: false })

    const g = reply(200, ok())
    vi.stubGlobal('fetch', g)
    await provider({ reasoning: 'low' }).generate({ prompt: 'p', language: 'EN' })
    expect(bodyOf(g).reasoning).toEqual({ effort: 'low' })
  })

  it('max_tokens: the option for generate(), input.maxTokens ?? option for complete()', async () => {
    const f = reply(200, ok())
    vi.stubGlobal('fetch', f)
    await provider({ maxTokens: 12000 }).generate({ prompt: 'p', language: 'EN' })
    expect(bodyOf(f).max_tokens).toBe(12000)

    const g = reply(200, ok())
    vi.stubGlobal('fetch', g)
    await provider({ maxTokens: 12000 }).complete({ system: 's', user: 'u', maxTokens: 4096 })
    expect(bodyOf(g).max_tokens).toBe(4096)

    const h = reply(200, ok())
    vi.stubGlobal('fetch', h)
    await provider({ maxTokens: 12000 }).complete({ system: 's', user: 'u' })
    expect(bodyOf(h).max_tokens).toBe(12000)
  })

  it('finish_reason length with null content → permanent error naming the limit and reasoning_tokens', async () => {
    vi.stubGlobal('fetch', reply(200, exhausted()))
    const err = await provider({ maxTokens: 4096 }).generate({ prompt: 'p', language: 'EN' }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(OpenRouterLlmError)
    expect(isTransientLlmError(err)).toBe(false)
    expect((err as Error).message).toBe(
      'OpenRouter: max_tokens (4096) exhausted before any content (reasoning_tokens=4096, completion_tokens=4096) — lower LLM_REASONING or raise LLM_MAX_TOKENS',
    )
  })

  it('another empty reply keeps the old text and adds finish_reason', async () => {
    vi.stubGlobal('fetch', reply(200, ok({ choices: [{ message: { content: ' ' }, finish_reason: 'stop' }] })))
    const err = await provider().generate({ prompt: 'p', language: 'EN' }).catch((e: unknown) => e)
    expect((err as Error).message).toBe('OpenRouter API returned an empty or missing completion text (finish_reason=stop)')
    vi.stubGlobal('fetch', reply(200, { id: 'x' }))
    const err2 = await provider().generate({ prompt: 'p', language: 'EN' }).catch((e: unknown) => e)
    expect((err2 as Error).message).toContain('empty or missing completion text (finish_reason=unknown)')
  })

  it('a normal reply maps as before (tokensOut = completion_tokens) and logs reasoning_tokens', async () => {
    const log = vi.fn()
    vi.stubGlobal(
      'fetch',
      reply(200, ok({ usage: { prompt_tokens: 100, completion_tokens: 50, completion_tokens_details: { reasoning_tokens: 7 } } })),
    )
    const res = await provider({ log }).generate({ prompt: 'p', language: 'EN' })
    expect(res).toMatchObject({ text: '# Protocol', tokensIn: 100, tokensOut: 50 })
    expect(log).toHaveBeenCalledWith('openrouter completion', expect.objectContaining({ tokensOut: 50, reasoningTokens: 7, finishReason: 'stop' }))
  })
})

describe('outbound proxy (WP-WORKER-04)', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    resetOutboundDispatcher()
  })

  it('with OUTBOUND_PROXY_URL set, fetch gets the ProxyAgent as dispatcher (both interfaces)', async () => {
    vi.stubEnv('OUTBOUND_PROXY_URL', 'http://user:pw@proxy.test:3128')
    const f = reply(200, ok())
    vi.stubGlobal('fetch', f)
    await provider().generate({ prompt: 'p', language: 'EN' })
    await provider().complete({ system: 's', user: 'u' })
    expect(f).toHaveBeenCalledTimes(2)
    for (const call of f.mock.calls as unknown as Array<[string, { dispatcher?: unknown }]>) {
      expect(call[1].dispatcher).toBeInstanceOf(ProxyAgent)
    }
  })

  it('without the variable, or with useProxy=false, fetch gets no dispatcher key', async () => {
    const f = reply(200, ok())
    vi.stubGlobal('fetch', f)
    vi.stubEnv('OUTBOUND_PROXY_URL', '')
    await provider().generate({ prompt: 'p', language: 'EN' })
    vi.stubEnv('OUTBOUND_PROXY_URL', 'http://proxy.test:3128')
    await new OpenRouterLlmProvider({ apiKey: KEY, baseUrl: 'https://or.test/api/v1', useProxy: false }).generate({ prompt: 'p', language: 'EN' })
    expect(f).toHaveBeenCalledTimes(2)
    for (const call of f.mock.calls as unknown as Array<[string, RequestInit]>) {
      expect('dispatcher' in call[1]).toBe(false)
    }
  })

  it('kie.ai never gets a dispatcher, whatever OUTBOUND_PROXY_URL says', async () => {
    vi.stubEnv('OUTBOUND_PROXY_URL', 'http://proxy.test:3128')
    const f = reply(200, { content: [{ type: 'text', text: 'x' }], usage: {} })
    vi.stubGlobal('fetch', f)
    await new KieAiLlmProvider({ apiKey: 'k', baseUrl: 'https://kie.test' }).generate({ prompt: 'p', language: 'EN' })
    expect(f).toHaveBeenCalled()
    for (const call of f.mock.calls as unknown as Array<[string, RequestInit]>) {
      expect('dispatcher' in (call[1] ?? {})).toBe(false)
    }
  })
})
