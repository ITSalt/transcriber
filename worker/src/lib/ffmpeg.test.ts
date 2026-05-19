/**
 * TECH-009 — ffmpeg audio extraction unit tests
 *
 * Uses vi.mock to stub fluent-ffmpeg so these tests run without a real
 * ffmpeg binary.  The integration paths (real binary) are skipped when
 * the binary is absent.
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'
import { Readable, PassThrough } from 'node:stream'

// ── fluent-ffmpeg mock ────────────────────────────────────────────────────────

// We mock the entire module before importing our code under test.
vi.mock('fluent-ffmpeg', () => {
  // Minimal chainable builder returned by ffmpeg()
  const makeBuilder = (opts: { shouldError?: boolean; probeResult?: unknown } = {}) => {
    const builder: Record<string, unknown> = {}
    const chain = (name: string, ret: unknown = builder) => {
      builder[name] = vi.fn(() => ret)
      return builder
    }
    chain('inputFormat')
    chain('outputFormat')
    chain('audioChannels')
    chain('audioFrequency')
    chain('noVideo')
    chain('audioCodec')
    chain('format')

    // pipe() returns a PassThrough; optionally emits error
    builder['pipe'] = vi.fn(() => {
      const pt = new PassThrough()
      if (opts.shouldError) {
        setImmediate(() => pt.emit('error', new Error('ffmpeg process error')))
      } else {
        setImmediate(() => {
          pt.write(Buffer.from('RIFF'))
          pt.end()
        })
      }
      return pt
    })

    // on() for 'error' event
    builder['on'] = vi.fn((event: string, cb: (err: Error) => void) => {
      if (opts.shouldError && event === 'error') {
        setImmediate(() => cb(new Error('ffmpeg process error')))
      }
      return builder
    })

    if (opts.probeResult !== undefined) {
      builder['ffprobe'] = vi.fn((_input: unknown, cb: (err: Error | null, data: unknown) => void) => {
        if (opts.probeResult === 'error') {
          cb(new Error('probe failed'), null)
        } else {
          cb(null, opts.probeResult)
        }
      })
    }

    return builder
  }

  // Default factory: happy-path builder
  const ffmpegFn = vi.fn(() => makeBuilder()) as Mock & {
    ffprobe: Mock
    setFfmpegPath: Mock
    setFfprobePath: Mock
  }

  // Static ffprobe attached to the constructor
  ffmpegFn.ffprobe = vi.fn()
  ffmpegFn.setFfmpegPath = vi.fn()
  ffmpegFn.setFfprobePath = vi.fn()

  return { default: ffmpegFn }
})

// ── import module under test (after mock registration) ────────────────────────
import ffmpegLib from 'fluent-ffmpeg'
import { extractAudio, probeContainer } from './ffmpeg.js'

// ── helpers ───────────────────────────────────────────────────────────────────

function makeReadable(content = 'fake-video-bytes'): Readable {
  return Readable.from([Buffer.from(content)])
}

async function collectStream(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array))
  }
  return Buffer.concat(chunks)
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('extractAudio', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    // Re-configure the mock factory for each test: happy path
    const makeBuilder = () => {
      const builder: Record<string, unknown> = {}
      const chain = (name: string) => {
        builder[name] = vi.fn(() => builder)
      }
      chain('inputFormat')
      chain('outputFormat')
      chain('audioChannels')
      chain('audioFrequency')
      chain('noVideo')
      chain('audioCodec')
      chain('format')
      chain('on')

      // extractAudio now passes a destination PassThrough to pipe(); when a
      // destination is provided, write our fake bytes into it. Otherwise
      // (legacy no-arg form) return a fresh PassThrough.
      builder['pipe'] = vi.fn((dest?: PassThrough) => {
        if (dest) {
          setImmediate(() => {
            dest.write(Buffer.from('RIFF'))
            dest.end()
          })
          return dest
        }
        const pt = new PassThrough()
        setImmediate(() => {
          pt.write(Buffer.from('RIFF'))
          pt.end()
        })
        return pt
      })

      return builder
    }

    ;(ffmpegLib as unknown as Mock).mockImplementation(makeBuilder)
  })

  it('returns a readable stream when given a readable input', async () => {
    const input = makeReadable()
    const result = extractAudio(input)
    expect(result).toBeDefined()
    const bytes = await collectStream(result)
    expect(bytes.length).toBeGreaterThan(0)
  })

  it('calls noVideo(), audioChannels(1), audioFrequency(16000)', async () => {
    const input = makeReadable()
    extractAudio(input)

    const builder = (ffmpegLib as unknown as Mock).mock.results[0]?.value as Record<string, Mock>
    expect((builder['noVideo'] as Mock)).toHaveBeenCalled()
    expect((builder['audioChannels'] as Mock)).toHaveBeenCalledWith(1)
    expect((builder['audioFrequency'] as Mock)).toHaveBeenCalledWith(16000)
  })

  it('uses wav output format', () => {
    const input = makeReadable()
    extractAudio(input)

    const builder = (ffmpegLib as unknown as Mock).mock.results[0]?.value as Record<string, Mock>
    // Either .format('wav') or .audioCodec('pcm_s16le') indicates WAV pipeline
    const formatCalled = (builder['format'] as Mock | undefined)?.mock?.calls?.some(
      (args: unknown[]) => args[0] === 'wav',
    )
    const codecCalled = (builder['audioCodec'] as Mock | undefined)?.mock?.calls?.some(
      (args: unknown[]) => (args[0] as string)?.startsWith('pcm'),
    )
    expect(formatCalled || codecCalled).toBe(true)
  })
})

describe('probeContainer', () => {
  it('returns {isValid: true, durationSec} for a valid probe result', async () => {
    const metadata = {
      format: { duration: 42.5 },
      streams: [{ codec_type: 'video' }],
    }
    ;(ffmpegLib.ffprobe as Mock).mockImplementation(
      (_path: string, cb: (err: Error | null, data: unknown) => void) => {
        cb(null, metadata)
      },
    )

    const result = await probeContainer('some-path.mp4')
    expect(result.isValid).toBe(true)
    expect(result.durationSec).toBeCloseTo(42.5)
  })

  it('returns {isValid: false} when ffprobe returns an error', async () => {
    ;(ffmpegLib.ffprobe as Mock).mockImplementation(
      (_path: string, cb: (err: Error | null, data: unknown) => void) => {
        cb(new Error('ffprobe: invalid data'), null)
      },
    )

    const result = await probeContainer('corrupted.mp4')
    expect(result.isValid).toBe(false)
    expect(result.durationSec).toBe(0)
  })

  it('returns {isValid: false} when duration is missing/zero', async () => {
    const metadata = { format: { duration: 0 }, streams: [] }
    ;(ffmpegLib.ffprobe as Mock).mockImplementation(
      (_path: string, cb: (err: Error | null, data: unknown) => void) => {
        cb(null, metadata)
      },
    )

    const result = await probeContainer('empty.mp4')
    expect(result.isValid).toBe(false)
  })
})
