/**
 * TECH-011 — KieAiLlmProvider unit tests
 *
 * All HTTP calls (fetch) are mocked so no live KIE_API_KEY is required.
 *
 * Acceptance tests (from test-spec.md):
 *  - generate({prompt:'test', language:'EN'}) returns non-empty text
 *  - Switching model='gpt-5-4' routes to GPT endpoint (model alias in request)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Mock global fetch ────────────────────────────────────────────────────────

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// ─── Import module under test AFTER mock ─────────────────────────────────────

import { KieAiLlmProvider, KieAiLlmError } from './kieai.js';

// ─── Test helpers ─────────────────────────────────────────────────────────────

function makeKieAiResponse(opts: {
  content?: string;
  model?: string;
  promptTokens?: number;
  completionTokens?: number;
}) {
  const {
    content = 'Generated protocol text',
    model = 'claude-sonnet-4-6',
    promptTokens = 100,
    completionTokens = 50,
  } = opts;

  return {
    id: 'test-completion-id',
    type: 'message',
    role: 'assistant',
    model,
    stop_reason: 'end_turn',
    content: [{ type: 'text', text: content }],
    usage: {
      input_tokens: promptTokens,
      output_tokens: completionTokens,
    },
  };
}

function mockFetchOk(body: unknown) {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => body,
  });
}

function mockFetchError(status: number, body: unknown) {
  mockFetch.mockResolvedValueOnce({
    ok: false,
    status,
    statusText: 'Error',
    json: async () => body,
    text: async () => JSON.stringify(body),
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('KieAiLlmProvider', () => {
  const savedKey = process.env['KIE_API_KEY'];

  beforeEach(() => {
    vi.clearAllMocks();
    process.env['KIE_API_KEY'] = 'test-kie-api-key';
  });

  afterEach(() => {
    if (savedKey !== undefined) {
      process.env['KIE_API_KEY'] = savedKey;
    } else {
      delete process.env['KIE_API_KEY'];
    }
  });

  // ── Constructor ──────────────────────────────────────────────────────────

  describe('constructor', () => {
    it('throws KieAiLlmError when no API key is provided', () => {
      delete process.env['KIE_API_KEY'];
      expect(() => new KieAiLlmProvider()).toThrowError(KieAiLlmError);
    });

    it('throws KieAiLlmError with descriptive message when no key', () => {
      delete process.env['KIE_API_KEY'];
      expect(() => new KieAiLlmProvider()).toThrowError(/KIE_API_KEY/);
    });

    it('accepts an explicit API key without reading process.env', () => {
      delete process.env['KIE_API_KEY'];
      expect(() => new KieAiLlmProvider({ apiKey: 'explicit-key' })).not.toThrow();
    });

    it('reads KIE_API_KEY from process.env when no explicit key given', () => {
      process.env['KIE_API_KEY'] = 'env-key';
      expect(() => new KieAiLlmProvider()).not.toThrow();
    });
  });

  // ── Acceptance test 1: generate returns non-empty text ───────────────────

  describe('generate', () => {
    it('returns non-empty text for EN input (acceptance test 1)', async () => {
      const provider = new KieAiLlmProvider({ apiKey: 'test-key' });
      mockFetchOk(
        makeKieAiResponse({
          content:
            '## Participants\nAlice, Bob\n\n## Discussion\nBudget planning.\n\n## Decisions\nApproved Q3 budget.\n\n## Action Items\n- Alice: Prepare report (deadline: 2026-06-01)',
        }),
      );

      const result = await provider.generate({ prompt: 'test', language: 'EN' });

      expect(result.text.trim().length).toBeGreaterThan(0);
      expect(result.model).toBe('claude-sonnet-4-6');
    });

    // ── Acceptance test 2: gpt-5-4 is rejected with a typed error ─────────
    // kie.ai exposes GPT-style models on a different endpoint family which
    // we have not wired up. The provider must fail fast on model=gpt-5-4
    // rather than send the request and get a 404 from kie.ai.

    it('throws KieAiLlmError when model=gpt-5-4 (not wired yet)', async () => {
      const provider = new KieAiLlmProvider({ apiKey: 'test-key' });

      await expect(
        provider.generate({ prompt: 'test', language: 'EN', model: 'gpt-5-4' }),
      ).rejects.toThrowError(/gpt-5-4|claude-sonnet-4-6/);

      // Must not have attempted any network call
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('defaults to claude-sonnet-4-6 when model is omitted', async () => {
      const provider = new KieAiLlmProvider({ apiKey: 'test-key' });
      mockFetchOk(makeKieAiResponse({}));

      await provider.generate({ prompt: 'test', language: 'EN' });

      const [, fetchInit] = mockFetch.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(fetchInit.body as string) as { model: string };
      expect(body.model).toBe('claude-sonnet-4-6');
    });

    it('sends claude-sonnet-4-6 model alias for claude-sonnet-4-6 model', async () => {
      const provider = new KieAiLlmProvider({ apiKey: 'test-key' });
      mockFetchOk(makeKieAiResponse({}));

      await provider.generate({ prompt: 'test', language: 'EN', model: 'claude-sonnet-4-6' });

      const [, fetchInit] = mockFetch.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(fetchInit.body as string) as { model: string };
      expect(body.model).toBe('claude-sonnet-4-6');
    });

    it('sends Authorization header with Bearer token', async () => {
      const provider = new KieAiLlmProvider({ apiKey: 'my-secret-key' });
      mockFetchOk(makeKieAiResponse({}));

      await provider.generate({ prompt: 'test', language: 'EN' });

      const [, fetchInit] = mockFetch.mock.calls[0] as [string, RequestInit];
      const headers = fetchInit.headers as Record<string, string>;
      expect(headers['Authorization']).toBe('Bearer my-secret-key');
    });

    it('sends system at top level and only user message in messages array', async () => {
      const provider = new KieAiLlmProvider({ apiKey: 'test-key' });
      mockFetchOk(makeKieAiResponse({}));

      await provider.generate({ prompt: 'transcript content', language: 'EN' });

      const [, fetchInit] = mockFetch.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(fetchInit.body as string) as {
        system: string;
        messages: Array<{ role: string; content: string }>;
        stream: boolean;
        max_tokens: number;
      };

      expect(typeof body.system).toBe('string');
      expect(body.system.length).toBeGreaterThan(0);
      expect(body.messages).toHaveLength(1);
      expect(body.messages[0]?.role).toBe('user');
      expect(body.messages[0]?.content).toBe('transcript content');
      expect(body.stream).toBe(false);
      expect(body.max_tokens).toBeGreaterThan(0);
    });

    it('uses RU prompt template when language=RU', async () => {
      const provider = new KieAiLlmProvider({ apiKey: 'test-key' });
      mockFetchOk(makeKieAiResponse({ content: 'Протокол совещания' }));

      await provider.generate({ prompt: 'транскрипция', language: 'RU' });

      const [, fetchInit] = mockFetch.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(fetchInit.body as string) as { system: string };
      // RU prompt template should mention Russian section names
      expect(body.system).toMatch(/Участники|совещани/i);
    });

    it('returns tokensIn and tokensOut from API usage', async () => {
      const provider = new KieAiLlmProvider({ apiKey: 'test-key' });
      mockFetchOk(
        makeKieAiResponse({ promptTokens: 250, completionTokens: 75, content: 'Protocol' }),
      );

      const result = await provider.generate({ prompt: 'test', language: 'EN' });

      expect(result.tokensIn).toBe(250);
      expect(result.tokensOut).toBe(75);
    });

    it('returns tokensIn=0 and tokensOut=0 when usage is missing', async () => {
      const provider = new KieAiLlmProvider({ apiKey: 'test-key' });
      const responseWithoutUsage = makeKieAiResponse({ content: 'Protocol' });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (responseWithoutUsage as any).usage;
      mockFetchOk(responseWithoutUsage);

      const result = await provider.generate({ prompt: 'test', language: 'EN' });

      expect(result.tokensIn).toBe(0);
      expect(result.tokensOut).toBe(0);
    });

    it('throws KieAiLlmError on HTTP error response', async () => {
      const provider = new KieAiLlmProvider({ apiKey: 'test-key' });
      mockFetchError(401, { error: 'Unauthorized' });

      await expect(provider.generate({ prompt: 'test', language: 'EN' })).rejects.toThrowError(
        KieAiLlmError,
      );
    });

    it('KieAiLlmError includes HTTP status on error', async () => {
      const provider = new KieAiLlmProvider({ apiKey: 'test-key' });
      mockFetchError(429, { error: 'Rate limit exceeded' });

      let caught: KieAiLlmError | undefined;
      try {
        await provider.generate({ prompt: 'test', language: 'EN' });
      } catch (err) {
        caught = err as KieAiLlmError;
      }

      expect(caught).toBeInstanceOf(KieAiLlmError);
      expect(caught?.status).toBe(429);
    });

    it('throws KieAiLlmError when fetch rejects (network error)', async () => {
      const provider = new KieAiLlmProvider({ apiKey: 'test-key' });
      mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));

      await expect(provider.generate({ prompt: 'test', language: 'EN' })).rejects.toThrowError(
        KieAiLlmError,
      );
    });

    it('throws KieAiLlmError when content array is empty', async () => {
      const provider = new KieAiLlmProvider({ apiKey: 'test-key' });
      mockFetchOk({ content: [], usage: { input_tokens: 10, output_tokens: 0 } });

      await expect(provider.generate({ prompt: 'test', language: 'EN' })).rejects.toThrowError(
        KieAiLlmError,
      );
    });

    it('throws KieAiLlmError when content is empty string', async () => {
      const provider = new KieAiLlmProvider({ apiKey: 'test-key' });
      mockFetchOk(makeKieAiResponse({ content: '   ' }));

      await expect(provider.generate({ prompt: 'test', language: 'EN' })).rejects.toThrowError(
        KieAiLlmError,
      );
    });

    it('uses custom baseUrl when provided', async () => {
      const provider = new KieAiLlmProvider({
        apiKey: 'test-key',
        baseUrl: 'https://custom.kie.ai/v2',
      });
      mockFetchOk(makeKieAiResponse({}));

      await provider.generate({ prompt: 'test', language: 'EN' });

      const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toContain('https://custom.kie.ai/v2');
    });
  });
});
