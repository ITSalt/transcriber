/**
 * WP-WORKER-04 (D-33, D-34) — dispatcher for outgoing requests through the owner's forward proxy.
 *
 * Ported from procontent (`backend/src/lib/outbound-proxy.ts` ← ptd-back ← learn): all of them use
 * the same tinyproxy in Dallas.
 *
 * Why: OpenRouter (behind Cloudflare) answers RU addresses with HTTP 403 "Access denied by
 * security policy"; through the proxy the same request is 200.
 *
 * IMPORTANT — do not "simplify" the ProxyAgent options. HTTP/2 over CONNECT intermittently hangs
 * (~30 s, partial reply and idle) on Cloudflare upstreams at a high RTT (~180 ms RU↔Dallas), so
 * HTTP/1.1 is forced on BOTH legs of the tunnel — the CONNECT to the proxy and the TLS to the
 * upstream. `allowH2: false` is on top of the ALPN list: since undici 8 the agent negotiates h2
 * despite `ALPNProtocols` unless it is forbidden explicitly. The property is guarded by
 * outbound-proxy.test.ts, not only by this text.
 *
 * IMPORTANT — the proxy is for LLM-provider traffic ONLY (OpenRouter). Object storage, Deepgram,
 * kie.ai go directly: a transatlantic hop on the data path is latency and an extra point of failure.
 */
import { ProxyAgent } from 'undici'
import type { Dispatcher } from 'undici'

/** Env variable with the proxy address. Empty / unset = direct connection. */
export const OUTBOUND_PROXY_ENV_VAR = 'OUTBOUND_PROXY_URL'

/** One agent per proxy URL — created once and reused. */
const agents = new Map<string, ProxyAgent>()

export class OutboundProxyConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'OutboundProxyConfigError'
  }
}

/**
 * Extra TLS options mixed into both legs of the tunnel — e.g. a private CA when the proxy
 * re-signs traffic. Forcing HTTP/1.1 is applied AFTER them and cannot be overridden by them.
 */
export interface OutboundTlsOptions {
  ca?: string | Buffer | Array<string | Buffer>
  rejectUnauthorized?: boolean
  servername?: string
}

/** Hide the credentials in a proxy address so they never reach a log: `http://u:p@host:3128` → `http://***:***@host:3128`. */
export function maskProxyUrl(proxyUrl: string): string {
  return proxyUrl.replace(/\/\/[^@/]*@/, '//***:***@')
}

/**
 * Parse and check a proxy address. The scheme must be http/https: undici tunnels through
 * HTTP CONNECT and has no SOCKS support, so `socks5://` is rejected here, not on the first call.
 *
 * @throws {OutboundProxyConfigError} when the string does not parse or the scheme is wrong.
 */
function assertValidProxyUrl(proxyUrl: string): void {
  let parsed: URL
  try {
    parsed = new URL(proxyUrl)
  } catch {
    throw new OutboundProxyConfigError(`${OUTBOUND_PROXY_ENV_VAR} is not a valid URL: ${maskProxyUrl(proxyUrl)}`)
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new OutboundProxyConfigError(
      `${OUTBOUND_PROXY_ENV_VAR} must be an http(s) proxy — undici does not support SOCKS (got: ${parsed.protocol}//)`,
    )
  }
}

/**
 * Read the proxy address from the environment. An empty string and an unset variable both
 * mean a direct connection.
 *
 * @throws {OutboundProxyConfigError} when the variable is set but unusable.
 */
export function resolveOutboundProxyUrl(env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env): string | null {
  const raw = (env[OUTBOUND_PROXY_ENV_VAR] ?? '').trim()
  if (raw === '') return null
  assertValidProxyUrl(raw)
  return raw
}

/**
 * Startup check (fail fast): a typo would otherwise show up on the first LLM call and look like
 * a provider failure.
 *
 * @returns the masked proxy address, or null in direct mode.
 */
export function assertOutboundProxyConfig(env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env): string | null {
  const url = resolveOutboundProxyUrl(env)
  return url === null ? null : maskProxyUrl(url)
}

/**
 * The shared dispatcher for `proxyUrl`, or `undefined` when no proxy is configured (direct mode).
 * A ProxyAgent per request leaks sockets, so the agent is cached: safe to call on every request.
 */
export function getOutboundDispatcher(
  proxyUrl: string | null,
  log?: (msg: string, ctx: Record<string, unknown>) => void,
  tlsOptions?: OutboundTlsOptions,
): Dispatcher | undefined {
  if (!proxyUrl) return undefined

  const cached = agents.get(proxyUrl)
  if (cached) return cached

  assertValidProxyUrl(proxyUrl)

  const agent = new ProxyAgent({
    uri: proxyUrl,
    // whatever the caller passes, never negotiate HTTP/2
    allowH2: false,
    // HTTP/1.1 on the CONNECT leg to the proxy itself
    connect: { ...tlsOptions, ALPNProtocols: ['http/1.1'] },
    // HTTP/1.1 on the TLS leg to the upstream (after CONNECT).
    // ALPNProtocols is spread LAST on purpose: the caller may add a private CA but cannot weaken it.
    requestTls: { ...tlsOptions, ALPNProtocols: ['http/1.1'] },
  })
  agents.set(proxyUrl, agent)

  log?.('outbound proxy configured (HTTP/1.1 forced on both legs)', { proxyUrl: maskProxyUrl(proxyUrl) })

  return agent
}

/**
 * THE one place that holds the rule "through the proxy or direct".
 *
 * @returns a dispatcher or `undefined`; undici ignores `undefined`, so direct mode keeps the
 *   previous behaviour byte for byte.
 */
export function outboundDispatcherFor(useProxy: boolean | undefined): Dispatcher | undefined {
  if (!useProxy) return undefined
  return getOutboundDispatcher(resolveOutboundProxyUrl())
}

/** Drop the agent cache. Tests only: lets a run re-initialise with another proxy address. */
export function resetOutboundDispatcher(): void {
  for (const agent of agents.values()) {
    void agent.close()
  }
  agents.clear()
}
