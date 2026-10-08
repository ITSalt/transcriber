/**
 * WP-WORKER-04 — the HTTP/1.1-on-both-legs property is guarded here, not only by a comment.
 * undici's ProxyAgent is replaced by a recorder so the constructor options can be read.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

const captured: Array<Record<string, any>> = []

vi.mock('undici', () => {
  class ProxyAgent {
    constructor(opts: Record<string, any>) {
      captured.push(opts)
    }
    close = vi.fn(async () => undefined)
  }
  return { ProxyAgent }
})

const { getOutboundDispatcher, resetOutboundDispatcher } = await import('./outbound-proxy.js')

afterEach(() => {
  resetOutboundDispatcher()
  captured.length = 0
})

describe('ProxyAgent options', () => {
  it('forbid h2 and force ALPN http/1.1 on the CONNECT leg and the upstream TLS leg', () => {
    getOutboundDispatcher('http://proxy.test:3128')
    expect(captured).toHaveLength(1)
    const o = captured[0]!
    expect(o['uri']).toBe('http://proxy.test:3128')
    expect(o['allowH2']).toBe(false)
    expect(o['connect']).toMatchObject({ ALPNProtocols: ['http/1.1'] })
    expect(o['requestTls']).toMatchObject({ ALPNProtocols: ['http/1.1'] })
  })

  it('caller TLS options (private CA) are merged but cannot weaken the forcing', () => {
    getOutboundDispatcher('http://proxy.test:3128', undefined, { ca: 'PEM', ALPNProtocols: ['h2'] } as never)
    const o = captured[0]!
    for (const leg of [o['connect'], o['requestTls']]) {
      expect(leg.ca).toBe('PEM')
      expect(leg.ALPNProtocols).toEqual(['http/1.1'])
    }
    expect(o['allowH2']).toBe(false)
  })
})
