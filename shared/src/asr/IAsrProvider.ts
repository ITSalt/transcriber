/**
 * TECH-010 — IAsrProvider abstraction (ADR-006)
 *
 * All ASR vendors must implement this interface.
 * New vendors are added by writing a new adapter — never call vendor SDKs
 * directly from api/ or worker/.
 *
 * AudioInput supports both a streaming path (Node.js Readable via the
 * StorageStream async-iterable shape) and a pre-buffered Buffer path,
 * keeping the interface usable without Node.js globals (e.g. in tests).
 */

import type { StorageStream } from '../storage/IStorage.js';

// ─── AudioInput ───────────────────────────────────────────────────────────────

export interface AudioInput {
  /**
   * Raw audio data — either a Buffer/Uint8Array (pre-loaded)
   * or an async-iterable stream (piped from ffmpeg / storage).
   *
   * Expected format: 16 kHz mono PCM/WAV (pcm_s16le) as produced by
   * TECH-009 extractAudio().
   */
  audio: Uint8Array | StorageStream;

  /**
   * IETF language tag hint (e.g. 'ru', 'en-US').
   * Pass null to enable Deepgram automatic language detection (BRQ-005).
   */
  languageHint: string | null;

  /**
   * Optional user-supplied speaker count. When set, providers should pin
   * diarization to exactly this number (e.g. Deepgram min_speakers /
   * max_speakers). Null/undefined = let the provider auto-detect.
   */
  speakerCount?: number | null;
}

// ─── AsrSegment ───────────────────────────────────────────────────────────────

/** Provider-neutral transcript segment (maps to TranscriptSegment in shared/dto). */
export interface AsrSegment {
  /** Speaker label, e.g. "SPEAKER_0", "SPEAKER_1". */
  speaker: string;
  /** Segment start time in seconds. */
  start: number;
  /** Segment end time in seconds. */
  end: number;
  /** Transcript text for this segment. */
  text: string;
  /** BCP-47 language tag detected for this segment (optional). */
  language?: string;
}

// ─── AsrResult ────────────────────────────────────────────────────────────────

export interface AsrResult {
  /** All speaker-attributed transcript segments ordered by start time. */
  segments: AsrSegment[];

  /**
   * BCP-47 language tag of the detected/dominant language.
   * Set from languageHint when provided; from model auto-detection otherwise.
   */
  detectedLanguage: string;

  /** Unique speaker labels found in segments (e.g. ["SPEAKER_0", "SPEAKER_1"]). */
  speakers: string[];

  /** Total media duration in seconds as reported by the ASR provider. */
  durationSec: number;
}

// ─── IAsrProvider ─────────────────────────────────────────────────────────────

export interface IAsrProvider {
  /**
   * Transcribe audio and return structured segments with speaker diarization.
   *
   * @param input - Audio bytes/stream and optional language hint.
   * @returns Resolved AsrResult with segments, detected language, and speakers.
   */
  transcribe(input: AudioInput): Promise<AsrResult>;
}
