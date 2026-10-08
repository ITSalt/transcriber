/**
 * WP-WORKER-03 — provider/model selection from env (D-32).
 */
import { describe, expect, it } from 'vitest'
import { KieAiCompletionProvider } from '../memory/kieai-completion.js'
import { KieAiLlmProvider } from './kieai.js'
import { OpenRouterLlmProvider } from './openrouter.js'
import {
  LlmConfigError,
  createCompletionProvider,
  createLlmProvider,
  describeLlmSettings,
  resolveLlmSettings,
} from './provider.js'

describe('resolveLlmSettings', () => {
  it('no OPENROUTER_API_KEY and no LLM_PROVIDER → kie.ai, claude-sonnet-4-6', () => {
    expect(resolveLlmSettings({ KIE_API_KEY: 'k' })).toMatchObject({ provider: 'kieai', model: 'claude-sonnet-4-6' })
    expect(resolveLlmSettings({})).toMatchObject({ provider: 'kieai' })
  })

  it('OPENROUTER_API_KEY → OpenRouter, anthropic/claude-haiku-5.5, 180 s timeout', () => {
    expect(resolveLlmSettings({ OPENROUTER_API_KEY: 'or' })).toMatchObject({
      provider: 'openrouter',
      model: 'anthropic/claude-haiku-5.5',
      timeoutMs: 180_000,
    })
  })

  it('LLM_PROVIDER=kieai wins over a present OpenRouter key', () => {
    expect(resolveLlmSettings({ LLM_PROVIDER: 'kieai', OPENROUTER_API_KEY: 'or' })).toMatchObject({ provider: 'kieai', model: 'claude-sonnet-4-6' })
  })

  it('LLM_MODEL and LLM_TIMEOUT_MS override the defaults; blank values count as unset', () => {
    expect(resolveLlmSettings({ OPENROUTER_API_KEY: 'or', LLM_MODEL: 'anthropic/claude-sonnet-4.6', LLM_TIMEOUT_MS: '60000' })).toMatchObject({
      model: 'anthropic/claude-sonnet-4.6',
      timeoutMs: 60_000,
    })
    expect(resolveLlmSettings({ LLM_PROVIDER: '', LLM_MODEL: '', OPENROUTER_API_KEY: '', LLM_TIMEOUT_MS: '' })).toMatchObject({
      provider: 'kieai',
      timeoutMs: 180_000,
    })
  })

  it('an unknown provider is a clear configuration error', () => {
    expect(() => resolveLlmSettings({ LLM_PROVIDER: 'gemini' })).toThrowError(LlmConfigError)
    expect(() => resolveLlmSettings({ LLM_PROVIDER: 'gemini' })).toThrowError(/LLM_PROVIDER/)
  })

  it('LLM_PROVIDER=openrouter without a key, and kieai with a foreign model, are configuration errors', () => {
    expect(() => resolveLlmSettings({ LLM_PROVIDER: 'openrouter' })).toThrowError(/OPENROUTER_API_KEY/)
    expect(() => resolveLlmSettings({ LLM_PROVIDER: 'kieai', LLM_MODEL: 'anthropic/claude-haiku-5.5' })).toThrowError(/LLM_MODEL/)
  })

  it('startup line', () => {
    expect(describeLlmSettings(resolveLlmSettings({ OPENROUTER_API_KEY: 'or' }))).toBe(
      'llm provider: openrouter model: anthropic/claude-haiku-5.5 proxy: direct reasoning: off max_tokens: 8192',
    )
  })

  // WP-WORKER-04
  it('OUTBOUND_PROXY_URL: the startup line shows the masked address, never the credentials', () => {
    const s = resolveLlmSettings({ OPENROUTER_API_KEY: 'or', OUTBOUND_PROXY_URL: 'http://user:s3cret@proxy.test:3128' })
    expect(s).toMatchObject({ useProxy: true, proxy: 'http://***:***@proxy.test:3128' })
    const line = describeLlmSettings(s)
    expect(line).toBe('llm provider: openrouter model: anthropic/claude-haiku-5.5 proxy: http://***:***@proxy.test:3128 reasoning: off max_tokens: 8192')
    expect(line).not.toContain('s3cret')
  })

  it('blank OUTBOUND_PROXY_URL = direct; the kie.ai line is always direct', () => {
    expect(resolveLlmSettings({ OPENROUTER_API_KEY: 'or', OUTBOUND_PROXY_URL: '' })).toMatchObject({ useProxy: false, proxy: null })
    const kie = resolveLlmSettings({ KIE_API_KEY: 'k', OUTBOUND_PROXY_URL: 'http://proxy.test:3128' })
    expect(describeLlmSettings(kie)).toBe('llm provider: kieai model: claude-sonnet-4-6 proxy: direct')
  })

  it('an invalid OUTBOUND_PROXY_URL (socks, garbage) is a configuration error at start, credentials masked', () => {
    for (const bad of ['socks5://user:s3cret@proxy.test:1080', 'user:s3cret@not a url']) {
      const call = () => resolveLlmSettings({ OPENROUTER_API_KEY: 'or', OUTBOUND_PROXY_URL: bad })
      expect(call).toThrowError(LlmConfigError)
      expect(call).toThrowError(/OUTBOUND_PROXY_URL/)
      try {
        call()
      } catch (err) {
        expect((err as Error).message).not.toContain('s3cret')
      }
    }
  })
})

describe('LLM_REASONING / LLM_MAX_TOKENS (WP-WORKER-05)', () => {
  const or = { OPENROUTER_API_KEY: 'or' }

  it('defaults: reasoning off, 8192; blank = unset', () => {
    expect(resolveLlmSettings(or)).toMatchObject({ reasoning: 'off', maxTokens: 8192 })
    expect(resolveLlmSettings({ ...or, LLM_REASONING: '', LLM_MAX_TOKENS: '' })).toMatchObject({ reasoning: 'off', maxTokens: 8192 })
  })

  it('valid values are taken; the startup line shows them', () => {
    const s = resolveLlmSettings({ ...or, LLM_REASONING: 'low', LLM_MAX_TOKENS: '16000' })
    expect(s).toMatchObject({ reasoning: 'low', maxTokens: 16000 })
    expect(describeLlmSettings(s)).toContain('reasoning: low max_tokens: 16000')
  })

  it('invalid values are configuration errors at start', () => {
    for (const bad of [{ LLM_REASONING: 'max' }, { LLM_REASONING: 'on' }, { LLM_MAX_TOKENS: '255' }, { LLM_MAX_TOKENS: 'lots' }, { LLM_MAX_TOKENS: '1.5' }]) {
      expect(() => resolveLlmSettings({ ...or, ...bad })).toThrowError(LlmConfigError)
    }
    expect(() => resolveLlmSettings({ ...or, LLM_REASONING: 'max' })).toThrowError(/LLM_REASONING/)
    expect(() => resolveLlmSettings({ ...or, LLM_MAX_TOKENS: '255' })).toThrowError(/LLM_MAX_TOKENS/)
  })

  it('the kie.ai startup line has no reasoning / max_tokens', () => {
    expect(describeLlmSettings(resolveLlmSettings({ KIE_API_KEY: 'k' }))).toBe('llm provider: kieai model: claude-sonnet-4-6 proxy: direct')
  })
})

describe('factories', () => {
  it('build the adapter the settings name, for both interfaces', () => {
    const or = { OPENROUTER_API_KEY: 'or' }
    expect(createLlmProvider(or)).toBeInstanceOf(OpenRouterLlmProvider)
    expect(createCompletionProvider(or)).toBeInstanceOf(OpenRouterLlmProvider)
    const kie = { KIE_API_KEY: 'k' }
    expect(createLlmProvider(kie)).toBeInstanceOf(KieAiLlmProvider)
    expect(createCompletionProvider(kie)).toBeInstanceOf(KieAiCompletionProvider)
    expect(createLlmProvider({ ...or, ...kie, LLM_PROVIDER: 'kieai' })).toBeInstanceOf(KieAiLlmProvider)
  })

  it('an invalid OUTBOUND_PROXY_URL stops both factories', () => {
    const bad = { OPENROUTER_API_KEY: 'or', OUTBOUND_PROXY_URL: 'socks5://p:1080' }
    expect(() => createLlmProvider(bad)).toThrowError(LlmConfigError)
    expect(() => createCompletionProvider(bad)).toThrowError(LlmConfigError)
  })
})
