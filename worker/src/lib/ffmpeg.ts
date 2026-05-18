/**
 * TECH-009 — ffmpeg audio extraction utility
 *
 * Provides two public helpers:
 *
 *   extractAudio(inputStream) → Readable
 *     Converts any video/audio container to 16 kHz mono PCM/WAV, suitable for
 *     Deepgram Nova-3 (BRQ-003, ADR-006).  Returns a Node.js Readable stream
 *     so callers can pipe directly to S3 putObject without temp files.
 *
 *   probeContainer(filePath) → Promise<ProbeResult>
 *     Runs ffprobe on a local path (or URL) and returns duration + validity.
 *     Returns {isValid: false, durationSec: 0} on any error or zero-duration file.
 */

import ffmpeg from 'fluent-ffmpeg'
import type { Readable } from 'node:stream'
import type { FfprobeData } from 'fluent-ffmpeg'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ProbeResult {
  isValid: boolean
  durationSec: number
}

// ── extractAudio ──────────────────────────────────────────────────────────────

/**
 * Wraps a video/audio ReadableStream through ffmpeg and returns a new Readable
 * that emits raw 16 kHz mono PCM WAV bytes.
 *
 * Output spec (Deepgram-compatible):
 *   - Format:    WAV (RIFF, pcm_s16le)
 *   - Channels:  1 (mono)
 *   - Sample rate: 16 000 Hz
 *   - Video:     stripped
 *
 * @param inputStream  - Any Node.js Readable carrying the source media.
 * @returns            A Node.js PassThrough stream emitting WAV bytes.
 */
export function extractAudio(inputStream: Readable): Readable {
  const output = ffmpeg(inputStream)
    .inputFormat('mp4')   // hint the demuxer; ffmpeg auto-detects if wrong
    .noVideo()
    .audioChannels(1)
    .audioFrequency(16000)
    .audioCodec('pcm_s16le')
    .format('wav')
    .pipe() as unknown as Readable   // pipe() with no dest returns a PassThrough

  return output
}

// ── probeContainer ─────────────────────────────────────────────────────────────

/**
 * Probes a media file using ffprobe and returns validity + duration.
 *
 * @param filePath - Local filesystem path or HTTP/RTMP URL to probe.
 * @returns ProbeResult
 */
export function probeContainer(filePath: string): Promise<ProbeResult> {
  return new Promise((resolve) => {
    ffmpeg.ffprobe(filePath, (err: Error | null, data: FfprobeData) => {
      if (err) {
        resolve({ isValid: false, durationSec: 0 })
        return
      }

      const duration = data?.format?.duration ?? 0
      if (!duration || duration <= 0) {
        resolve({ isValid: false, durationSec: 0 })
        return
      }

      resolve({ isValid: true, durationSec: duration })
    })
  })
}
