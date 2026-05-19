/**
 * TECH-010 — DeepgramAsrProvider
 *
 * Implements IAsrProvider using Deepgram Nova-3 via @deepgram/sdk.
 * Supports RU/EN + automatic language detection + speaker diarization.
 *
 * Reads DEEPGRAM_API_KEY from process.env (set by worker config / dotenv).
 */

import { DeepgramClient } from '@deepgram/sdk';
import type {
  ListenV1Response,
  ListenV1ResponseResultsUtterancesItem,
  ListenV1ResponseResultsChannelsItem,
} from '@deepgram/sdk';
import type {
  IAsrProvider,
  AudioInput,
  AsrResult,
  AsrSegment,
} from '@transcrib/shared';

// ─── Error Types ─────────────────────────────────────────────────────────────

export class DeepgramAsrError extends Error {
  public readonly reason: unknown;

  constructor(message: string, reason?: unknown) {
    super(message);
    this.name = 'DeepgramAsrError';
    this.reason = reason;
  }
}

// ─── Helper: map language hint → Deepgram language param ─────────────────────

const LANGUAGE_MAP: Record<string, string> = {
  RU: 'ru',
  EN: 'en',
  ru: 'ru',
  en: 'en',
  'en-US': 'en-US',
  'en-GB': 'en-GB',
};

function resolveLanguage(hint: string | null): {
  language?: string;
  detect_language?: boolean;
} {
  if (hint === null) {
    return { detect_language: true };
  }
  const mapped = LANGUAGE_MAP[hint] ?? hint;
  return { language: mapped };
}

// ─── Helper: normalize StorageStream → Buffer ─────────────────────────────────

async function toBuffer(audio: Uint8Array | AsyncIterable<Uint8Array>): Promise<Buffer> {
  if (audio instanceof Uint8Array) {
    return Buffer.from(audio);
  }
  const chunks: Buffer[] = [];
  for await (const chunk of audio) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

// ─── DeepgramAsrProvider ─────────────────────────────────────────────────────

export class DeepgramAsrProvider implements IAsrProvider {
  private readonly client: DeepgramClient;

  constructor(apiKey?: string) {
    const key = apiKey ?? process.env['DEEPGRAM_API_KEY'];
    if (!key) {
      throw new DeepgramAsrError(
        'DEEPGRAM_API_KEY is not set. Provide it as a constructor argument or via process.env.',
      );
    }
    this.client = new DeepgramClient({ apiKey: key });
  }

  async transcribe(input: AudioInput): Promise<AsrResult> {
    const { audio, languageHint, speakerCount } = input;

    // Collect the audio into a Buffer so we can use transcribeFile()
    const buffer = await toBuffer(audio);

    const languageParams = resolveLanguage(languageHint);

    // If the user explicitly told us how many speakers there are, pin the
    // diarizer to that exact count. Without this hint Deepgram occasionally
    // collapses two soft-voiced speakers into one (observed on a real meeting
    // upload: two speakers, returned as a single SPEAKER_0 monologue). Setting
    // min == max gives the model both bounds.
    const diarizationParams =
      typeof speakerCount === 'number' && speakerCount >= 1
        ? { min_speakers: speakerCount, max_speakers: speakerCount }
        : {};

    // HttpResponsePromise<MediaTranscribeResponse> extends Promise<MediaTranscribeResponse>
    // — await yields the body directly (no .body wrapper needed).
    const body = await this.client.listen.v1.media.transcribeFile(
      buffer,
      {
        model: 'nova-3',
        diarize: true,
        smart_format: true,
        utterances: true,
        punctuate: true,
        ...languageParams,
        ...diarizationParams,
      },
    );

    return mapResponse(body as unknown as ListenV1Response | { request_id?: string }, languageHint);
  }
}

// ─── Response mapper ──────────────────────────────────────────────────────────

function mapResponse(
  body: ListenV1Response | { request_id?: string },
  languageHint: string | null,
): AsrResult {
  // The async-callback (accepted) response has no results — treat as empty.
  if (!('results' in body) || (body as ListenV1Response).results == null) {
    return {
      segments: [],
      detectedLanguage: languageHint ?? 'auto',
      speakers: [],
      durationSec: 0,
    };
  }

  const syncBody = body as ListenV1Response;
  const metadata = syncBody.metadata;
  const results = syncBody.results;

  // Duration from metadata
  const durationSec = metadata?.duration ?? 0;

  // Detected language: prefer channel-level detected_language, fallback to hint
  const channels = results.channels as ListenV1ResponseResultsChannelsItem[] | undefined;
  const channelLang: string | undefined =
    Array.isArray(channels) && channels.length > 0
      ? channels[0]?.detected_language
      : undefined;
  const detectedLanguage = channelLang ?? (languageHint ?? 'auto');

  // Map utterances → segments (speaker-attributed)
  const utterances: ListenV1ResponseResultsUtterancesItem[] = results.utterances ?? [];
  const segments: AsrSegment[] = utterances
    .filter(
      (u) =>
        typeof u.start === 'number' &&
        typeof u.end === 'number' &&
        typeof u.transcript === 'string' &&
        u.transcript.trim().length > 0,
    )
    .map((u) => ({
      speaker: `SPEAKER_${u.speaker ?? 0}`,
      start: u.start as number,
      end: u.end as number,
      text: (u.transcript as string).trim(),
    }));

  // Collect unique speakers
  const speakers = Array.from(new Set(segments.map((s) => s.speaker))).sort();

  return { segments, detectedLanguage, speakers, durationSec };
}
