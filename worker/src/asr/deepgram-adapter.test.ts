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
import { DeepgramAsrProvider, DeepgramAsrError } from './deepgram-adapter.js';

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
});
