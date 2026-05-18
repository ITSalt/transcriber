/**
 * TECH-022 — ffmpeg child process registry
 *
 * Tracks all fluent-ffmpeg child processes spawned by the worker.
 * During graceful shutdown, `terminateAll()` sends SIGTERM to every
 * registered process so pm2's kill_timeout does not leave orphan ffmpeg
 * processes consuming CPU after a deploy.
 */
import type { ChildProcess } from 'node:child_process'

export class FfmpegRegistry {
  private readonly procs = new Set<ChildProcess>()

  /** Register a child process. Call this immediately after spawning. */
  register(proc: ChildProcess): void {
    this.procs.add(proc)
  }

  /** Unregister a child process. Call this when the process exits normally. */
  unregister(proc: ChildProcess): void {
    this.procs.delete(proc)
  }

  /**
   * Send SIGTERM to all registered processes and clear the registry.
   * Resolves immediately after signalling — callers should await
   * BullMQ `worker.close()` which blocks until in-flight jobs finish/abort.
   */
  terminateAll(): Promise<void> {
    for (const proc of this.procs) {
      try {
        proc.kill('SIGTERM')
      } catch {
        // Process may already be dead — ignore
      }
    }
    this.procs.clear()
    return Promise.resolve()
  }
}

/** Singleton registry shared across the worker process. */
export const ffmpegRegistry = new FfmpegRegistry()
