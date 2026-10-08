/**
 * Common LLM-provider error (DEC-001, TECH-026).
 *
 * Both adapters (kie.ai, OpenRouter) throw a subclass of LlmProviderError, so the retry
 * decision in the jobs ("transient → let BullMQ retry, permanent → FAILED") does not depend
 * on the vendor. A shared base class (not duck-typing) keeps `instanceof` checks honest:
 * an unrelated error that happens to carry `isTransient` is never retried by accident.
 */
export class LlmProviderError extends Error {
  public readonly status?: number
  public readonly reason?: unknown
  /** True when the failure is transient and safe to retry with BullMQ backoff. */
  public readonly isTransient: boolean

  constructor(message: string, opts?: { status?: number; reason?: unknown; isTransient?: boolean }) {
    super(message)
    this.name = 'LlmProviderError'
    this.status = opts?.status
    this.reason = opts?.reason
    this.isTransient = opts?.isTransient ?? false
  }
}

/** Returns true if the error should be retried. RC-UC-300 FR-001 / DEC-001. */
export function isTransientLlmError(err: unknown): boolean {
  return err instanceof LlmProviderError && err.isTransient
}

/** Short, log-safe excerpt of a response body, for the error message. */
export function bodyExcerpt(body: unknown, max = 200): string {
  const raw = typeof body === 'string' ? body : JSON.stringify(body)
  if (!raw) return ''
  return raw.length > max ? `${raw.slice(0, max)}…` : raw
}
