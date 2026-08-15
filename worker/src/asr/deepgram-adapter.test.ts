/**
 * TECH-010 — DeepgramAsrProvider unit tests
 *
 * All @deepgram/sdk calls are mocked so no live API key is required.
 *
 * Acceptance tests (from test-spec.md):
 *  - transcribe on a sample EN audio fixture returns segments with speaker
 *    labels and non-empty text
 *  - languageHint=null sets detectedLanguage on result (auto-detection path)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock @deepgram/sdk ───────────────────────────────────────────────────────

vi.mock('@deepgram/sdk', () => {
  // A minimal builder for listen.v1.media.transcribeFile responses.
  const makeTranscribeFile = vi.fn();

  const mockClient = {
    listen: {
      v1: {
        media: {
          transcribeFile: makeTranscribeFile,
        },
      },
    },
  };

  const DeepgramClient = vi.fn(() => mockClient);

  return { DeepgramClient };
});

// ─── Import module under test AFTER mock ─────────────────────────────────────

import { DeepgramClient } from '@deepgram/sdk';
import {
  DeepgramAsrProvider,
  DeepgramAsrError,
  isTransientAsrError,
} from './deepgram-adapter.js';

// ─── Test helpers ─────────────────────────────────────────────────────────────

/**
 * Build a minimal Deepgram ListenV1Response fixture.
 * HttpResponsePromise<T> extends Promise<T> and resolves to T directly —
 * so transcribeFile() resolves to the response body without a wrapper.
 */
function makeDeepgramResponse(opts: {
  utterances?: Array<{
    start: number;
    end: number;
    transcript: string;
    speaker?: number;
  }>;
  duration?: number;
  detectedLanguage?: string;
}) {
  const { utterances = [], duration = 60, detectedLanguage } = opts;
  return {
    metadata: {
      request_id: 'test-req-id',
      sha256: 'abc',
      created: new Date().toISOString(),
      duration,
      channels: 1,
      models: ['nova-3'],
      model_info: {},
    },
    results: {
      channels: [
        {
          detected_language: detectedLanguage,
          alternatives: [{ transcript: utterances.map((u) => u.transcript).join(' ') }],
        },
      ],
      utterances: utterances.map((u) => ({
        start: u.start,
        end: u.end,
        transcript: u.transcript,
        speaker: u.speaker ?? 0,
        confidence: 0.99,
      })),
    },
  };
}

function getTranscribeFileMock() {
  const instance = (DeepgramClient as ReturnType<typeof vi.fn>).mock.results[0]?.value as {
    listen: { v1: { media: { transcribeFile: ReturnType<typeof vi.fn> } } };
  };
  return instance?.listen.v1.media.transcribeFile as ReturnType<typeof vi.fn>;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('DeepgramAsrProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Constructor ──────────────────────────────────────────────────────────

  describe('constructor', () => {
    it('throws DeepgramAsrError when no API key is provided', () => {
      const savedKey = process.env['DEEPGRAM_API_KEY'];
      delete process.env['DEEPGRAM_API_KEY'];

      expect(() => new DeepgramAsrProvider()).toThrowError(DeepgramAsrError);

      if (savedKey !== undefined) {
        process.env['DEEPGRAM_API_KEY'] = savedKey;
      }
    });

    it('accepts an explicit API key without reading process.env', () => {
      expect(() => new DeepgramAsrProvider('test-api-key')).not.toThrow();
    });
  });

  // ── Acceptance test 1: EN audio with speaker diarization ────────────────

  describe('transcribe', () => {
    it('returns segments with speaker labels and non-empty text for EN audio', async () => {
      const provider = new DeepgramAsrProvider('test-api-key');
      const mock = getTranscribeFileMock();

      mock.mockResolvedValueOnce(
        makeDeepgramResponse({
          utterances: [
            { start: 0, end: 3.5, transcript: 'Hello everyone.', speaker: 0 },
            { start: 4.0, end: 7.2, transcript: 'Good morning.', speaker: 1 },
            { start: 8.0, end: 12.0, transcript: 'Let us begin the meeting.', speaker: 0 },
          ],
          duration: 120,
          detectedLanguage: 'en',
        }),
      );

      const result = await provider.transcribe({
        audio: Buffer.from('fake-audio-bytes'),
        languageHint: 'en',
      });

      expect(result.segments).toHaveLength(3);

      // Each segment must have a non-empty speaker label
      for (const seg of result.segments) {
        expect(seg.speaker).toMatch(/^SPEAKER_\d+$/);
        expect(seg.text.trim().length).toBeGreaterThan(0);
        expect(typeof seg.start).toBe('number');
        expect(typeof seg.end).toBe('number');
      }

      // Speakers deduplication
      expect(result.speakers).toContain('SPEAKER_0');
      expect(result.speakers).toContain('SPEAKER_1');

      // Duration and language
      expect(result.durationSec).toBe(120);
      expect(result.detectedLanguage).toBe('en');
    });

    // ── Acceptance test 2: languageHint=null → auto-detection ──────────────

    it('sets detectedLanguage from Deepgram response when languageHint=null', async () => {
      const provider = new DeepgramAsrProvider('test-api-key');
      const mock = getTranscribeFileMock();

      mock.mockResolvedValueOnce(
        makeDeepgramResponse({
          utterances: [
            { start: 0, end: 2.0, transcript: 'Привет всем.', speaker: 0 },
          ],
          duration: 30,
          detectedLanguage: 'ru',
        }),
      );

      const result = await provider.transcribe({
        audio: Buffer.from('fake-ru-audio'),
        languageHint: null,
      });

      // Language from channel-level detected_language in the Deepgram response
      expect(result.detectedLanguage).toBe('ru');
      expect(result.segments[0]?.text).toBe('Привет всем.');
    });

    it('sends detect_language=true to Deepgram when languageHint is null', async () => {
      const provider = new DeepgramAsrProvider('test-api-key');
      const mock = getTranscribeFileMock();

      mock.mockResolvedValueOnce(
        makeDeepgramResponse({ utterances: [], detectedLanguage: 'en' }),
      );

      await provider.transcribe({
        audio: Buffer.from('fake-audio'),
        languageHint: null,
      });

      expect(mock).toHaveBeenCalledTimes(1);
      const [, requestParams] = mock.mock.calls[0] as [unknown, Record<string, unknown>];
      expect(requestParams['detect_language']).toBe(true);
      expect(requestParams['language']).toBeUndefined();
    });

    it('sends language param to Deepgram when languageHint is provided', async () => {
      const provider = new DeepgramAsrProvider('test-api-key');
      const mock = getTranscribeFileMock();

      mock.mockResolvedValueOnce(makeDeepgramResponse({ utterances: [] }));

      await provider.transcribe({
        audio: Buffer.from('fake-audio'),
        languageHint: 'ru',
      });

      const [, requestParams] = mock.mock.calls[0] as [unknown, Record<string, unknown>];
      expect(requestParams['language']).toBe('ru');
      expect(requestParams['detect_language']).toBeUndefined();
    });

    it('sends model=nova-3, diarize=true, smart_format=true', async () => {
      const provider = new DeepgramAsrProvider('test-api-key');
      const mock = getTranscribeFileMock();

      mock.mockResolvedValueOnce(makeDeepgramResponse({ utterances: [] }));

      await provider.transcribe({
        audio: Buffer.from('fake-audio'),
        languageHint: 'en',
      });

      const [, requestParams] = mock.mock.calls[0] as [unknown, Record<string, unknown>];
      expect(requestParams['model']).toBe('nova-3');
      expect(requestParams['diarize']).toBe(true);
      expect(requestParams['smart_format']).toBe(true);
    });

    it('filters out utterances with empty transcript text', async () => {
      const provider = new DeepgramAsrProvider('test-api-key');
      const mock = getTranscribeFileMock();

      mock.mockResolvedValueOnce(
        makeDeepgramResponse({
          utterances: [
            { start: 0, end: 1.0, transcript: '   ', speaker: 0 },   // empty after trim
            { start: 2, end: 5.0, transcript: 'Real content.', speaker: 0 },
          ],
        }),
      );

      const result = await provider.transcribe({
        audio: Buffer.from('fake-audio'),
        languageHint: 'en',
      });

      expect(result.segments).toHaveLength(1);
      expect(result.segments[0]?.text).toBe('Real content.');
    });

    it('collects async iterable audio stream into buffer', async () => {
      const provider = new DeepgramAsrProvider('test-api-key');
      const mock = getTranscribeFileMock();

      mock.mockResolvedValueOnce(
        makeDeepgramResponse({
          utterances: [{ start: 0, end: 1.5, transcript: 'Stream test.', speaker: 0 }],
        }),
      );

      // StorageStream is an AsyncIterable<Uint8Array>
      async function* audioStream() {
        yield Buffer.from('chunk-1');
        yield Buffer.from('chunk-2');
      }

      const result = await provider.transcribe({
        audio: audioStream(),
        languageHint: 'en',
      });

      expect(result.segments).toHaveLength(1);
      // Verify the buffer passed to transcribeFile is a Buffer
      const [uploadable] = mock.mock.calls[0] as [unknown];
      expect(Buffer.isBuffer(uploadable)).toBe(true);
    });

    it('returns empty segments for async-callback (accepted) response', async () => {
      const provider = new DeepgramAsrProvider('test-api-key');
      const mock = getTranscribeFileMock();

      // AcceptedResponse — no results property (HttpResponsePromise resolves to T directly)
      mock.mockResolvedValueOnce({ request_id: 'cb-req', created: new Date().toISOString() });

      const result = await provider.transcribe({
        audio: Buffer.from('fake'),
        languageHint: 'en',
      });

      expect(result.segments).toHaveLength(0);
      expect(result.speakers).toHaveLength(0);
    });
  });

  // ── F-005 — error classification ───────────────────────────────────────────
  //
  // Before this, `new DeepgramAsrError` was constructed exactly ONCE in
  // production code — for a missing API key. `transcribe()` had no try/catch, so
  // a 429 or a 5xx propagated as a raw SDK error, `isTransientAsrError` returned
  // false for it, and the entire RQ-015 / RC-UC-200 FR-001 retry design was dead
  // code on the ASR branch.
  //
  // SCOPE: this covers only the half of F-005 that is provider-independent —
  // 408, 429, 5xx, timeouts and transport failures. 404 and in-HTTP-200-envelope
  // classification are deliberately NOT touched: F-005's non-goal forbids
  // copying the kie.ai conclusion across without live probes, because Deepgram
  // carries the model in a query parameter (so its 404 may genuinely mean
  // "unknown model") whereas kie.ai carries it in the body.
  describe('error classification (F-005, probe-independent half)', () => {
    function rejectWith(err: unknown) {
      // Construct the provider FIRST — getTranscribeFileMock() reads the mock off
      // the DeepgramClient constructor's recorded result.
      const provider = new DeepgramAsrProvider('test-api-key');
      getTranscribeFileMock().mockRejectedValueOnce(err);
      return provider;
    }

    async function classify(err: unknown): Promise<{ wrapped: boolean; transient: boolean }> {
      const provider = rejectWith(err);
      try {
        await provider.transcribe({ audio: Buffer.from('x'), languageHint: 'en' });
        throw new Error('expected transcribe() to reject');
      } catch (caught) {
        return {
          wrapped: caught instanceof DeepgramAsrError,
          transient: isTransientAsrError(caught),
        };
      }
    }

    /* MUTATION PROOF for every case below: remove the try/catch around
     * transcribeFile in deepgram-adapter.ts -> the raw SDK error propagates,
     * `wrapped` is false and `transient` is false -> RED. */

    it.each([
      ['429 rate limit', 429],
      ['408 request timeout', 408],
      ['500 internal', 500],
      ['503 unavailable', 503],
    ])('classifies %s as transient', async (_label, statusCode) => {
      const res = await classify(Object.assign(new Error('dg'), { statusCode }));
      expect(res.wrapped).toBe(true);
      expect(res.transient).toBe(true);
    });

    it.each([
      ['401 unauthorized', 401],
      ['400 bad request', 400],
      ['413 payload too large', 413],
    ])('classifies %s as permanent', async (_label, statusCode) => {
      const res = await classify(Object.assign(new Error('dg'), { statusCode }));
      expect(res.wrapped).toBe(true);
      expect(res.transient).toBe(false);
    });

    it('classifies the request-timeout abort as transient', async () => {
      // The 570s budget firing is a transport-level failure, not a rejection of
      // the request; retrying is correct.
      const err = Object.assign(new Error('Timeout exceeded'), {
        name: 'DeepgramTimeoutError',
      });
      const res = await classify(err);
      expect(res.wrapped).toBe(true);
      expect(res.transient).toBe(true);
    });

    it('classifies a transport failure (no statusCode) as transient', async () => {
      const res = await classify(Object.assign(new TypeError('fetch failed'), {
        cause: Object.assign(new Error('connect ECONNRESET'), { code: 'ECONNRESET' }),
      }));
      expect(res.wrapped).toBe(true);
      expect(res.transient).toBe(true);
    });

    it('404 stays PERMANENT pending live probes (F-005 non-goal)', async () => {
      /* Deliberate: kie.ai's "404 is transient" rationale does NOT transfer —
       * Deepgram puts the model in a query parameter, so a 404 may legitimately
       * mean "unknown model". Flipping this requires probe evidence + a DEC. */
      const res = await classify(Object.assign(new Error('dg'), { statusCode: 404 }));
      expect(res.wrapped).toBe(true);
      expect(res.transient).toBe(false);
    });
  });

  // ── Request timeout ────────────────────────────────────────────────────────
  //
  // @deepgram/sdk@5 defaults `timeoutInSeconds` to 60 for transcribeFile:
  //   media/client/Client.mjs:241
  //   timeoutMs: (requestOptions?.timeoutInSeconds
  //               ?? this._options?.timeoutInSeconds ?? 60) * 1000
  // The AbortController is armed BEFORE fetch and cleared only after the fetch
  // promise settles, so those 60 seconds cover uploading the WAV body AND
  // Deepgram's entire processing time. Production's longest recording (4429 s of
  // audio -> ~142 MB WAV) fits with only a few seconds of headroom; the next
  // longer meeting aborts mid-flight.
  describe('request timeout', () => {
    /* MUTATION PROOF: drop the `requestOptions` argument in
     * deepgram-adapter.ts -> transcribeFile is called with 2 args -> the third
     * element is undefined -> RED. That is the pre-fix state. */
    it('passes an explicit timeout instead of inheriting the SDK 60s default', async () => {
      const provider = new DeepgramAsrProvider('test-api-key');
      const mock = getTranscribeFileMock();
      mock.mockResolvedValueOnce({ request_id: 'timeout-probe' });

      await provider.transcribe({ audio: Buffer.from('fake'), languageHint: 'en' });

      const call = mock.mock.calls[0] as unknown[];
      const requestOptions = call[2] as { timeoutInSeconds?: number } | undefined;

      expect(requestOptions).toBeDefined();
      expect(requestOptions?.timeoutInSeconds).toBeGreaterThan(60);
      // Must stay under Deepgram's own 600 s sync-processing cap so we surface a
      // clean client-side abort rather than waiting for their 504.
      expect(requestOptions?.timeoutInSeconds).toBeLessThan(600);
    });
  });
});
