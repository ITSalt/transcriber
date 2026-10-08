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
    expect(describeLlmSettings(resolveLlmSettings({ OPENROUTER_API_KEY: 'or' }))).toBe('llm provider: openrouter model: anthropic/claude-haiku-5.5')
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
})
