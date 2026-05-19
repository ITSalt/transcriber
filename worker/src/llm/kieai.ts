/**
 * TECH-011 — KieAiLlmProvider
 *
 * Implements ILlmProvider against the kie.ai Anthropic-compatible endpoint
 * for Claude Sonnet 4.6. Reads KIE_API_KEY from process.env. Uses Node 20
 * built-in fetch — no additional HTTP client dependency.
 *
 * Request shape (per https://docs.kie.ai/market/claude/claude-sonnet-4-6.md):
 *   POST {baseUrl}/messages
 *   Authorization: Bearer {KIE_API_KEY}
 *   { model, system, messages:[{role:'user'|'assistant', content}],
 *     stream:false, max_tokens }
 *
 * Response shape:
 *   { content:[{type:'text', text:'…'}],
 *     usage:{ input_tokens, output_tokens }, stop_reason, model, id }
 *
 * Prompt templates: worker/src/llm/prompts/{en,ru}/protocol.md
 *
 * GPT-5.4 is intentionally not wired here yet — kie.ai exposes a separate
 * endpoint family for OpenAI-style models, and the spec was not provided.
 * If model='gpt-5-4' is requested, we throw a typed error so the caller
 * (and any future model-router) gets a clean signal instead of a 404.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import type { ILlmProvider, LlmInput, LlmResult, LlmModel } from '@transcrib/shared';
import { LLM_MODEL_DEFAULT } from '@transcrib/shared';

// ─── Error type ───────────────────────────────────────────────────────────────

export class KieAiLlmError extends Error {
  public readonly status?: number;
  public readonly reason?: unknown;

  constructor(message: string, opts?: { status?: number; reason?: unknown }) {
    super(message);
    this.name = 'KieAiLlmError';
    this.status = opts?.status;
    this.reason = opts?.reason;
  }
}

// ─── kie.ai API constants ─────────────────────────────────────────────────────

/** Base URL for kie.ai Claude messages endpoint. The full endpoint is `${BASE}/messages`. */
const KIE_API_BASE_URL = 'https://api.kie.ai/claude/v1';

/** Model alias to send in the kie.ai request body. */
const MODEL_ALIAS: Record<LlmModel, string> = {
  'claude-sonnet-4-6': 'claude-sonnet-4-6',
  // GPT-5.4 lives on a different (OpenAI-style) endpoint family on kie.ai
  // and is not wired up yet. See the file header for details.
  'gpt-5-4': 'gpt-5.4',
};

/** Max output tokens. kie.ai default is 4096; we keep that explicitly. */
const DEFAULT_MAX_TOKENS = 4096;

// ─── Prompt loader ────────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROMPTS_DIR = join(__dirname, 'prompts');

function loadSystemPrompt(language: 'RU' | 'EN'): string {
  const langDir = language === 'RU' ? 'ru' : 'en';
  const promptPath = join(PROMPTS_DIR, langDir, 'protocol.md');
  return readFileSync(promptPath, 'utf-8');
}

// ─── kie.ai response shape (Anthropic-compatible) ─────────────────────────────

interface KieAiContentBlock {
  type: string;
  text?: string;
}

interface KieAiUsage {
  input_tokens?: number;
  output_tokens?: number;
}

interface KieAiResponse {
  id?: string;
  model?: string;
  role?: string;
  type?: string;
  stop_reason?: string;
  content: KieAiContentBlock[];
  usage?: KieAiUsage;
}

// ─── KieAiLlmProvider ─────────────────────────────────────────────────────────

export class KieAiLlmProvider implements ILlmProvider {
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(opts?: { apiKey?: string; baseUrl?: string }) {
    const key = opts?.apiKey ?? process.env['KIE_API_KEY'];
    if (!key) {
      throw new KieAiLlmError(
        'KIE_API_KEY is not set. Provide it as a constructor option or via process.env.',
      );
    }
    this.apiKey = key;
    this.baseUrl = opts?.baseUrl ?? KIE_API_BASE_URL;
  }

  async generate(input: LlmInput): Promise<LlmResult> {
    const model: LlmModel = input.model ?? LLM_MODEL_DEFAULT;
    if (model !== 'claude-sonnet-4-6') {
      throw new KieAiLlmError(
        `kie.ai integration currently supports only claude-sonnet-4-6; got model=${model}`,
      );
    }
    const modelAlias = MODEL_ALIAS[model];
    const systemPrompt = loadSystemPrompt(input.language);

    const requestBody = {
      model: modelAlias,
      system: systemPrompt,
      messages: [{ role: 'user', content: input.prompt }],
      stream: false,
      max_tokens: DEFAULT_MAX_TOKENS,
    };

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(requestBody),
      });
    } catch (err) {
      throw new KieAiLlmError('Network error calling kie.ai API', { reason: err });
    }

    if (!response.ok) {
      let body: unknown;
      try {
        body = await response.json();
      } catch {
        body = await response.text();
      }
      throw new KieAiLlmError(
        `kie.ai API error: HTTP ${response.status} ${response.statusText}`,
        { status: response.status, reason: body },
      );
    }

    let data: KieAiResponse;
    try {
      data = (await response.json()) as KieAiResponse;
    } catch (err) {
      throw new KieAiLlmError('Failed to parse kie.ai API response as JSON', { reason: err });
    }

    // Concatenate all text blocks. kie.ai mirrors Anthropic's structure where
    // a response may contain multiple content blocks (text + tool_use, etc).
    // We only care about text here — tool_use is not requested in our body.
    const textPieces =
      data.content
        ?.filter((block) => block.type === 'text' && typeof block.text === 'string')
        .map((block) => block.text as string) ?? [];
    const text = textPieces.join('').trim();

    if (text.length === 0) {
      throw new KieAiLlmError('kie.ai API returned an empty or missing completion text', {
        reason: data,
      });
    }

    return {
      text,
      model,
      tokensIn: data.usage?.input_tokens ?? 0,
      tokensOut: data.usage?.output_tokens ?? 0,
    };
  }
}
