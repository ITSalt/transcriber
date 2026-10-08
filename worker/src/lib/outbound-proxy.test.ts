/**
 * WP-WORKER-04 — outbound proxy dispatcher. No network: ProxyAgent is only constructed.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ProxyAgent } from 'undici'
import {
  OUTBOUND_PROXY_ENV_VAR,
  OutboundProxyConfigError,
  assertOutboundProxyConfig,
  getOutboundDispatcher,
  maskProxyUrl,
  outboundDispatcherFor,
  resetOutboundDispatcher,
  resolveOutboundProxyUrl,
} from './outbound-proxy.js'

const PROXY = 'http://user:s3cret@proxy.test:3128'

afterEach(() => {
  resetOutboundDispatcher()
  vi.unstubAllEnvs()
})

describe('resolveOutboundProxyUrl / assertOutboundProxyConfig', () => {
  it('unset or blank → null (direct)', () => {
    expect(resolveOutboundProxyUrl({})).toBeNull()
    expect(resolveOutboundProxyUrl({ [OUTBOUND_PROXY_ENV_VAR]: '   ' })).toBeNull()
    expect(assertOutboundProxyConfig({})).toBeNull()
  })

  it('http and https are accepted; the assert returns the masked address', () => {
    expect(resolveOutboundProxyUrl({ [OUTBOUND_PROXY_ENV_VAR]: PROXY })).toBe(PROXY)
    expect(resolveOutboundProxyUrl({ [OUTBOUND_PROXY_ENV_VAR]: 'https://proxy.test:3128' })).toBe('https://proxy.test:3128')
    expect(assertOutboundProxyConfig({ [OUTBOUND_PROXY_ENV_VAR]: PROXY })).toBe('http://***:***@proxy.test:3128')
  })

  it('socks5 and garbage are rejected without leaking the credentials', () => {
    const socks = { [OUTBOUND_PROXY_ENV_VAR]: 'socks5://user:s3cret@proxy.test:1080' }
    expect(() => resolveOutboundProxyUrl(socks)).toThrowError(OutboundProxyConfigError)
    expect(() => resolveOutboundProxyUrl(socks)).toThrowError(/SOCKS/)
    const garbage = { [OUTBOUND_PROXY_ENV_VAR]: 'user:s3cret@not a url' }
    expect(() => resolveOutboundProxyUrl(garbage)).toThrowError(OutboundProxyConfigError)
    for (const env of [socks, garbage]) {
      try {
        resolveOutboundProxyUrl(env)
      } catch (err) {
        expect((err as Error).message).not.toContain('s3cret')
      }
    }
  })
})

describe('maskProxyUrl', () => {
  it('hides the credentials, leaves a credential-free address alone', () => {
    expect(maskProxyUrl(PROXY)).toBe('http://***:***@proxy.test:3128')
    expect(maskProxyUrl('http://proxy.test:3128')).toBe('http://proxy.test:3128')
  })
})

describe('getOutboundDispatcher', () => {
  it('no proxy → undefined (direct)', () => {
    expect(getOutboundDispatcher(null)).toBeUndefined()
    expect(getOutboundDispatcher('')).toBeUndefined()
  })

  it('one ProxyAgent per URL, reused on repeated calls; the log line carries the masked URL', () => {
    const log = vi.fn()
    const a = getOutboundDispatcher(PROXY, log)
    expect(a).toBeInstanceOf(ProxyAgent)
    expect(getOutboundDispatcher(PROXY, log)).toBe(a)
    expect(getOutboundDispatcher('https://other.test:3128')).not.toBe(a)
    expect(log).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(log.mock.calls)).not.toContain('s3cret')
  })

  it('an invalid URL passed directly throws a config error', () => {
    expect(() => getOutboundDispatcher('socks5://proxy.test:1080')).toThrowError(OutboundProxyConfigError)
  })
})

describe('outboundDispatcherFor', () => {
  it('useProxy=false → undefined even when the variable is set', () => {
    vi.stubEnv(OUTBOUND_PROXY_ENV_VAR, PROXY)
    expect(outboundDispatcherFor(false)).toBeUndefined()
    expect(outboundDispatcherFor(undefined)).toBeUndefined()
  })

  it('useProxy=true without the variable → undefined; with it → the shared agent', () => {
    vi.stubEnv(OUTBOUND_PROXY_ENV_VAR, '')
    expect(outboundDispatcherFor(true)).toBeUndefined()
    vi.stubEnv(OUTBOUND_PROXY_ENV_VAR, PROXY)
    const d = outboundDispatcherFor(true)
    expect(d).toBeInstanceOf(ProxyAgent)
    expect(outboundDispatcherFor(true)).toBe(d)
  })
})
