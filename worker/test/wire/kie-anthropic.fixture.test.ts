import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FIXTURE_PATH = join(__dirname, '..', 'fixtures', 'kie-anthropic-claude-response.json');

describe('wire-evidence:fixture: kie-anthropic-claude-response', () => {
  const raw = JSON.parse(readFileSync(FIXTURE_PATH, 'utf-8'));

  it('envelope matches Anthropic Messages API shape (NOT OpenAI shape)', () => {
    expect(raw.type).toBe('message');
    expect(raw.role).toBe('assistant');
    expect(raw.model).toBe('claude-sonnet-4-6');
    expect(raw.content).toBeInstanceOf(Array);
    expect(raw.content[0].type).toBe('text');
    expect(raw.content[0].text).toBeTypeOf('string');
    expect(raw.content[0].text.length).toBeGreaterThan(0);
  });

  it('OpenAI-shape parse path (response.choices[0].message.content) MUST NOT exist (postmortem class)', () => {
    expect(raw.choices).toBeUndefined();
  });

  it('usage block tracks token counts for cost surfacing', () => {
    expect(typeof raw.usage.input_tokens).toBe('number');
    expect(typeof raw.usage.output_tokens).toBe('number');
  });

  it('extracted markdown begins with the canonical protocol heading', () => {
    const markdown: string = raw.content[0].text;
    expect(markdown).toMatch(/^# Протокол встречи/);
  });
});
