/**
 * TECH-011 — KieAiLlmProvider
 *
 * Implements ILlmProvider using the kie.ai HTTP API.
 * Supports Claude Sonnet 4.6 (default) and GPT-5.4 selectable per meeting.
 *
 * Reads KIE_API_KEY from process.env.
 * Uses Node 20 built-in fetch — no additional HTTP client dependency.
 *
 * Model routing:
 *   'claude-sonnet-4-6' → claude-sonnet-4-6 endpoint alias on kie.ai
 *   'gpt-5-4'           → gpt-5.4 endpoint alias on kie.ai
 *
 * Prompt templates:
 *   worker/src/llm/prompts/{en,ru}/protocol.md
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

const KIE_API_BASE_URL = 'https://api.kie.ai/v1';

/** Map our LlmModel identifiers to kie.ai model string aliases. */
const MODEL_ALIAS: Record<LlmModel, string> = {
  'claude-sonnet-4-6': 'claude-sonnet-4-6',
  'gpt-5-4': 'gpt-5.4',
};

// ─── Prompt loader ────────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROMPTS_DIR = join(__dirname, 'prompts');

function loadSystemPrompt(language: 'RU' | 'EN'): string {
  const langDir = language === 'RU' ? 'ru' : 'en';
  const promptPath = join(PROMPTS_DIR, langDir, 'protocol.md');
  return readFileSync(promptPath, 'utf-8');
}

// ─── kie.ai response shape ────────────────────────────────────────────────────

interface KieAiChoice {
  message: {
    role: string;
    content: string;
  };
  finish_reason?: string;
}

interface KieAiUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens?: number;
}

interface KieAiResponse {
  id?: string;
  model?: string;
  choices: KieAiChoice[];
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
    const modelAlias = MODEL_ALIAS[model];
    const systemPrompt = loadSystemPrompt(input.language);

    const requestBody = {
      model: modelAlias,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: input.prompt },
      ],
    };

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/chat/completions`, {
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

    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || content.trim().length === 0) {
      throw new KieAiLlmError('kie.ai API returned an empty or missing completion text', {
        reason: data,
      });
    }

    return {
      text: content,
      model,
      tokensIn: data.usage?.prompt_tokens ?? 0,
      tokensOut: data.usage?.completion_tokens ?? 0,
    };
  }
}
