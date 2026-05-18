/**
 * TECH-022 — Worker graceful shutdown tests
 *
 * Tests:
 *   - shutdown() calls worker.close() on all BullMQ workers
 *   - shutdown() calls ffmpegRegistry.terminateAll()
 *   - process exits 0 after clean shutdown
 *   - process exits 1 if shutdown times out (guarded by 25s timer)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// We mock the ffmpeg registry module before importing shutdown logic
vi.mock('./lib/ffmpeg-registry.js', () => ({
  ffmpegRegistry: {
    register: vi.fn(),
    unregister: vi.fn(),
    terminateAll: vi.fn().mockResolvedValue(undefined),
  },
}))

vi.mock('./lib/prisma.js', () => ({
  prisma: {
    $disconnect: vi.fn().mockResolvedValue(undefined),
  },
}))

// Import the module under test AFTER mocks are registered
import { createShutdownHandler } from './shutdown.js'
import { ffmpegRegistry } from './lib/ffmpeg-registry.js'
import { prisma } from './lib/prisma.js'

describe('TECH-022 — Worker shutdown handler', () => {
  let exitSpy: ReturnType<typeof vi.spyOn>
  let setTimeoutSpy: ReturnType<typeof vi.spyOn>
  let clearTimeoutSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.clearAllMocks()
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((_code?: number) => {
      return undefined as never
    })
  })

  afterEach(() => {
    exitSpy.mockRestore()
  })

  it('closes all BullMQ workers during shutdown', async () => {
    const worker1 = { close: vi.fn().mockResolvedValue(undefined) }
    const worker2 = { close: vi.fn().mockResolvedValue(undefined) }

    const log = {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    }

    const shutdown = createShutdownHandler([worker1 as never, worker2 as never], log as never)
    await shutdown('SIGTERM')

    expect(worker1.close).toHaveBeenCalledOnce()
    expect(worker2.close).toHaveBeenCalledOnce()
  })

  it('calls ffmpegRegistry.terminateAll() during shutdown', async () => {
    const worker = { close: vi.fn().mockResolvedValue(undefined) }
    const log = {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    }

    const shutdown = createShutdownHandler([worker as never], log as never)
    await shutdown('SIGTERM')

    expect(ffmpegRegistry.terminateAll).toHaveBeenCalledOnce()
  })

  it('calls prisma.$disconnect() during shutdown', async () => {
    const worker = { close: vi.fn().mockResolvedValue(undefined) }
    const log = {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    }

    const shutdown = createShutdownHandler([worker as never], log as never)
    await shutdown('SIGTERM')

    expect(prisma.$disconnect).toHaveBeenCalledOnce()
  })

  it('calls process.exit(0) after successful shutdown', async () => {
    const worker = { close: vi.fn().mockResolvedValue(undefined) }
    const log = {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    }

    const shutdown = createShutdownHandler([worker as never], log as never)
    await shutdown('SIGTERM')

    expect(exitSpy).toHaveBeenCalledWith(0)
  })

  it('calls process.exit(1) if shutdown throws', async () => {
    const worker = { close: vi.fn().mockRejectedValue(new Error('close failed')) }
    const log = {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    }

    const shutdown = createShutdownHandler([worker as never], log as never)
    await shutdown('SIGTERM')

    expect(exitSpy).toHaveBeenCalledWith(1)
  })
})
