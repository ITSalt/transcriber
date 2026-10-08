import { afterEach, describe, expect, it, vi } from 'vitest'
import { KieAiLlmError } from '../llm/kieai.js'
import { KieAiCompletionProvider, stripCodeFence } from './kieai-completion.js'

const reply = (status: number, body: unknown) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }))

afterEach(() => vi.unstubAllGlobals())

describe('KieAiCompletionProvider', () => {
  const provider = () => new KieAiCompletionProvider({ apiKey: 'k', baseUrl: 'https://kie.test/claude/v1' })

  it('sends the caller system prompt and returns text + tokens; JSON replies lose their fence', async () => {
    const fetch = reply(200, { content: [{ type: 'text', text: '```json\n{"tasks":[]}\n```' }], usage: { input_tokens: 12, output_tokens: 3 } })
    vi.stubGlobal('fetch', fetch)
    const res = await provider().complete({ system: 'SYS', user: 'USER', responseFormat: 'json', maxTokens: 8192 })
    expect(res).toEqual({ text: '{"tasks":[]}', model: 'claude-sonnet-4-6', tokensIn: 12, tokensOut: 3 })
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://kie.test/claude/v1/messages')
    expect(JSON.parse(init.body as string)).toMatchObject({
      model: 'claude-sonnet-4-6',
      system: 'SYS',
      messages: [{ role: 'user', content: 'USER' }],
      max_tokens: 8192,
      stream: false,
    })
  })

  it('an error inside an HTTP 200 envelope is classified by its code', async () => {
    vi.stubGlobal('fetch', reply(200, { code: 429, msg: 'rate limited' }))
    const err = await provider().complete({ system: 's', user: 'u' }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(KieAiLlmError)
    expect(err).toMatchObject({ status: 429, isTransient: true })

    vi.stubGlobal('fetch', reply(200, { code: 401, msg: 'Unauthorized' }))
    expect(await provider().complete({ system: 's', user: 'u' }).catch((e: unknown) => e)).toMatchObject({ status: 401, isTransient: false })
  })

  it('HTTP 5xx and network failures are transient; an empty completion is not', async () => {
    vi.stubGlobal('fetch', reply(502, { error: 'bad gateway' }))
    expect(await provider().complete({ system: 's', user: 'u' }).catch((e: unknown) => e)).toMatchObject({ status: 502, isTransient: true })
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('fetch failed'))))
    expect(await provider().complete({ system: 's', user: 'u' }).catch((e: unknown) => e)).toMatchObject({ isTransient: true })
    vi.stubGlobal('fetch', reply(200, { content: [] }))
    expect(await provider().complete({ system: 's', user: 'u' }).catch((e: unknown) => e)).toMatchObject({ isTransient: false })
  })

  it('stripCodeFence leaves plain text alone', () => {
    expect(stripCodeFence('{"a":1}')).toBe('{"a":1}')
    expect(stripCodeFence('```\n{"a":1}\n```')).toBe('{"a":1}')
  })
})
