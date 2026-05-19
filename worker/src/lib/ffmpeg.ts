/**
 * TECH-009 — ffmpeg audio extraction utility
 *
 * Provides two public helpers:
 *
 *   extractAudio(input) → Readable
 *     Converts any video/audio container to 16 kHz mono PCM/WAV, suitable for
 *     Deepgram Nova-3 (BRQ-003, ADR-006).  `input` is either an HTTPS URL or a
 *     local filesystem path — both are seekable, which is required by the MP4
 *     demuxer (most encoders place the moov atom at the end of the file).
 *     stdin pipes are NOT supported here; they break for non-faststart MP4.
 *
 *   probeContainer(filePath) → Promise<ProbeResult>
 *     Runs ffprobe on a local path or URL and returns duration + validity.
 *     Returns {isValid: false, durationSec: 0} on any error or zero-duration file.
 */

import ffmpeg from 'fluent-ffmpeg'
import { PassThrough, type Readable } from 'node:stream'
import type { FfprobeData } from 'fluent-ffmpeg'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ProbeResult {
  isValid: boolean
  durationSec: number
}

// ── extractAudio ──────────────────────────────────────────────────────────────

/**
 * Spawns ffmpeg against a seekable input (HTTPS URL or local file path) and
 * returns a Readable that emits raw 16 kHz mono PCM WAV bytes.
 *
 * Output spec (Deepgram-compatible):
 *   - Format:    WAV (RIFF, pcm_s16le)
 *   - Channels:  1 (mono)
 *   - Sample rate: 16 000 Hz
 *   - Video:     stripped
 *
 * Why URL instead of stdin Readable: ffmpeg's MP4 demuxer needs to seek to the
 * moov atom, which is at the END of most non-faststart files. stdin is not
 * seekable, so feeding an MP4 buffer through stdin fails with
 * "moov atom not found" and ffmpeg exits before producing output. HTTPS URLs
 * are seekable via Range requests.
 *
 * @param input - HTTPS URL (e.g. an S3 presigned download URL) or local path.
 * @returns A PassThrough stream that emits WAV bytes; errors from the ffmpeg
 *          process are forwarded to this stream's 'error' event so consumers
 *          can `await` on stream-end without unhandled-rejection crashes.
 */
export function extractAudio(input: string | Readable): Readable {
  const output = new PassThrough()

  const command = ffmpeg(input)
    .noVideo()
    .audioChannels(1)
    .audioFrequency(16000)
    .audioCodec('pcm_s16le')
    .format('wav')
    .on('error', (err: Error) => {
      // Forward ffmpeg process errors to the output stream so the awaiting
      // consumer sees them. Without this, fluent-ffmpeg emits 'error' on the
      // command object and Node treats it as an unhandled exception, crashing
      // the worker and triggering a pm2 restart.
      output.destroy(err)
    })

  command.pipe(output, { end: true })

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
