/**
 * TECH-022 — ffmpegRegistry unit tests
 *
 * Tests the thin process registry:
 *   - register / unregister
 *   - terminateAll sends SIGTERM to all registered processes
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { FfmpegRegistry } from './ffmpeg-registry.js'
import type { ChildProcess } from 'node:child_process'

function makeProc(pid: number): ChildProcess {
  return {
    pid,
    kill: vi.fn().mockReturnValue(true),
    on: vi.fn(),
    once: vi.fn(),
  } as unknown as ChildProcess
}

describe('FfmpegRegistry', () => {
  let registry: FfmpegRegistry

  beforeEach(() => {
    registry = new FfmpegRegistry()
  })

  it('register adds a process; terminateAll sends SIGTERM to it', async () => {
    const proc = makeProc(1234)
    registry.register(proc)

    await registry.terminateAll()

    expect(proc.kill).toHaveBeenCalledWith('SIGTERM')
  })

  it('unregister removes a process; terminateAll does not kill it', async () => {
    const proc = makeProc(5678)
    registry.register(proc)
    registry.unregister(proc)

    await registry.terminateAll()

    expect(proc.kill).not.toHaveBeenCalled()
  })

  it('terminateAll handles multiple processes', async () => {
    const proc1 = makeProc(1)
    const proc2 = makeProc(2)
    registry.register(proc1)
    registry.register(proc2)

    await registry.terminateAll()

    expect(proc1.kill).toHaveBeenCalledWith('SIGTERM')
    expect(proc2.kill).toHaveBeenCalledWith('SIGTERM')
  })

  it('terminateAll resolves even if processes are already dead (kill returns false)', async () => {
    const proc = makeProc(9999)
    ;(proc.kill as ReturnType<typeof vi.fn>).mockReturnValue(false)
    registry.register(proc)

    await expect(registry.terminateAll()).resolves.toBeUndefined()
  })

  it('terminateAll clears the registry after killing', async () => {
    const proc = makeProc(111)
    registry.register(proc)

    await registry.terminateAll()

    // Second call should not call kill again
    vi.clearAllMocks()
    await registry.terminateAll()
    expect(proc.kill).not.toHaveBeenCalled()
  })
})
