/**
 * FR-006 / UC-605 — drains GraphOutbox (Postgres) into the memory graph.
 *
 * Every pollMs: up to batchSize pending rows, oldest first. A row is applied (idempotent
 * DETACH DELETE) and marked done; on failure attempts + 1 and last_error are stored and the
 * tick stops — later rows keep their order and everything is retried on the next tick, for
 * as long as Neo4j is down. A row whose op/payload does not parse is marked failed and
 * skipped so it never blocks the queue.
 */
import type { Logger } from 'pino'
import { GraphOutboxEntry } from '@transcrib/shared'

export interface OutboxRow {
  id: string
  op: string
  payload: unknown
  attempts: number
}

export interface OutboxRepo {
  pending(limit: number): Promise<OutboxRow[]>
  markDone(id: string, at: Date): Promise<void>
  markFailed(id: string, error: string): Promise<void>
}

export interface OutboxTickResult {
  done: number
  failed: number
  invalid: number
}

export class GraphOutboxConsumer {
  private timer: ReturnType<typeof setTimeout> | undefined
  private running: Promise<unknown> | undefined
  private stopped = true

  constructor(
    private readonly deps: {
      repo: OutboxRepo
      apply: (entry: GraphOutboxEntry) => Promise<void>
      log: Logger
      pollMs: number
      batchSize?: number
      now?: () => Date
    },
  ) {}

  async tick(): Promise<OutboxTickResult> {
    const result: OutboxTickResult = { done: 0, failed: 0, invalid: 0 }
    const rows = await this.deps.repo.pending(this.deps.batchSize ?? 50)
    for (const row of rows) {
      const parsed = GraphOutboxEntry.safeParse({ op: row.op, payload: row.payload })
      if (!parsed.success) {
        result.invalid++
        await this.deps.repo.markFailed(row.id, `invalid outbox entry: ${parsed.error.message}`)
        this.deps.log.error({ outboxId: row.id, op: row.op }, 'graph outbox: invalid entry skipped')
        continue
      }
      try {
        await this.deps.apply(parsed.data)
        await this.deps.repo.markDone(row.id, (this.deps.now ?? (() => new Date()))())
        result.done++
      } catch (err) {
        result.failed++
        const message = err instanceof Error ? err.message : String(err)
        await this.deps.repo.markFailed(row.id, message)
        this.deps.log.warn({ outboxId: row.id, op: row.op, attempts: row.attempts + 1, err: message }, 'graph outbox: apply failed — will retry')
        break
      }
    }
    if (result.done > 0) this.deps.log.info(result, 'graph outbox: applied')
    return result
  }

  start(): void {
    if (!this.stopped) return
    this.stopped = false
    this.schedule(0)
  }

  private schedule(delay: number): void {
    if (this.stopped) return
    this.timer = setTimeout(() => {
      this.running = this.tick()
        .catch((err: unknown) => this.deps.log.warn({ err }, 'graph outbox: tick failed — will retry'))
        .finally(() => {
          this.running = undefined
          this.schedule(this.deps.pollMs)
        })
    }, delay)
    this.timer.unref?.()
  }

  /** Stops polling and waits for the tick in progress. */
  async stop(): Promise<void> {
    this.stopped = true
    clearTimeout(this.timer)
    await this.running
  }
}
