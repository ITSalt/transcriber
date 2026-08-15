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

/**
 * Error thrown by DeepgramAsrProvider when the ASR call fails.
 *
 * `isTransient` = true  → 429 / 5xx: retriable with BullMQ backoff (RC-UC-200 FR-001)
 * `isTransient` = false → 401/400/402/413 or local errors: permanent, write FAILED immediately.
 */
export class DeepgramAsrError extends Error {
  public readonly reason: unknown;
  /** True when the error is transient (429/5xx) and safe to retry with BullMQ backoff. */
  public readonly isTransient: boolean;

  constructor(message: string, reason?: unknown, isTransient = false) {
    super(message);
    this.name = 'DeepgramAsrError';
    this.reason = reason;
    this.isTransient = isTransient;
  }
}

/** Returns true if the error should be retried. RC-UC-200 FR-001 / RQ-015. */
export function isTransientAsrError(err: unknown): boolean {
  return err instanceof DeepgramAsrError && err.isTransient;
}

/**
 * Is this HTTP status worth retrying? (F-005, probe-independent half.)
 *
 * NOTE the deliberate asymmetry with `isTransientStatus` in the kie.ai adapter,
 * which also treats **404** as transient. That conclusion is provider-specific
 * and must NOT be copied here: kie.ai carries the model id in the request body,
 * so a 404 there can only be a gateway routing blip, whereas Deepgram carries
 * the model in a query parameter — a Deepgram 404 may legitimately mean "unknown
 * model". Flipping it requires the live probes in F-005 plus a decision record.
 */
export function isTransientAsrStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

/** Transport-level failure codes that are always worth retrying. */
const TRANSPORT_ERROR_CODES = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'EPIPE',
  'EAI_AGAIN',
  'ENOTFOUND',
  'UND_ERR_SOCKET',
  'UND_ERR_CONNECT_TIMEOUT',
]);

/** Error names the SDK/runtime uses for an aborted or timed-out request. */
const TIMEOUT_ERROR_NAMES = new Set(['DeepgramTimeoutError', 'AbortError', 'TimeoutError']);

/**
 * Classify a thrown SDK error into our transport-independent taxonomy.
 *
 * Matched structurally rather than via `instanceof DeepgramError`: the SDK's
 * error classes are not part of its stable surface, and binding to them would
 * also force every test that mocks `@deepgram/sdk` to re-export them.
 */
function classifyAsrError(err: unknown): { message: string; isTransient: boolean } {
  const e = (err ?? {}) as {
    name?: unknown;
    message?: unknown;
    statusCode?: unknown;
    status?: unknown;
    code?: unknown;
    cause?: { code?: unknown };
  };

  const message = typeof e.message === 'string' && e.message ? e.message : String(err);

  if (typeof e.name === 'string' && TIMEOUT_ERROR_NAMES.has(e.name)) {
    return { message, isTransient: true };
  }

  const status = typeof e.statusCode === 'number' ? e.statusCode
    : typeof e.status === 'number' ? e.status
    : undefined;

  if (typeof status === 'number') {
    return { message, isTransient: isTransientAsrStatus(status) };
  }

  // No status at all → the request never produced an HTTP response. Undici
  // surfaces these as a TypeError('fetch failed') whose `cause` carries the
  // syscall code.
  const code = typeof e.code === 'string' ? e.code
    : typeof e.cause?.code === 'string' ? e.cause.code
    : undefined;
  if (code && TRANSPORT_ERROR_CODES.has(code)) {
    return { message, isTransient: true };
  }
  if (err instanceof TypeError && /fetch failed|network|socket/i.test(message)) {
    return { message, isTransient: true };
  }

  // Anything else is a local/programming error — permanent.
  return { message, isTransient: false };
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

// ─── Request timeout ──────────────────────────────────────────────────────────

/**
 * Per-request timeout for the pre-recorded transcription call, in seconds.
 *
 * `@deepgram/sdk@5` defaults `timeoutInSeconds` to **60** for `transcribeFile`
 * (`media/client/Client.mjs:241`), and its AbortController is armed before
 * `fetch` and cleared only after the fetch promise settles — so that budget
 * covers uploading the audio body AND Deepgram's entire processing time.
 * Production's longest recording (4429 s of audio → ~142 MB of 16 kHz mono WAV)
 * fits with only a few seconds of headroom; the next longer meeting would abort
 * mid-flight with a raw `AbortError`.
 *
 * 570 s sits just under Deepgram's own 600 s sync-processing cap, so we surface
 * a clean client-side abort instead of waiting on their 504.
 */
const REQUEST_TIMEOUT_SECONDS = 570;

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
    //
    // F-005: every failure must leave here as a DeepgramAsrError carrying an
    // explicit transience verdict. Without this catch the raw SDK error escaped,
    // `isTransientAsrError` returned false for it, and the RQ-015 / RC-UC-200
    // FR-001 retry policy was dead code on the ASR branch.
    let body: unknown;
    try {
      body = await this.client.listen.v1.media.transcribeFile(
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
        { timeoutInSeconds: REQUEST_TIMEOUT_SECONDS },
      );
    } catch (err) {
      const { message, isTransient } = classifyAsrError(err);
      throw new DeepgramAsrError(`Deepgram ASR request failed: ${message}`, err, isTransient);
    }

    return mapResponse(body as ListenV1Response | { request_id?: string }, languageHint);
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
