import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FIXTURE_PATH = join(__dirname, '..', 'fixtures', 'protocol-sample.md');

describe('wire-evidence:fixture: protocol-sample.md (UC-302 PDF render input)', () => {
  const markdown = readFileSync(FIXTURE_PATH, 'utf-8');

  it('input markdown carries the canonical protocol heading', () => {
    expect(markdown).toMatch(/^# Протокол встречи/);
  });

  it('input markdown carries the six canonical sections (matches ru/protocol.md output template)', () => {
    expect(markdown).toContain('## Участники');
    expect(markdown).toContain('## Дата');
    expect(markdown).toContain('## Обсуждённые вопросы');
    expect(markdown).toContain('## Принятые решения');
    expect(markdown).toContain('## Открытые вопросы');
    expect(markdown).toContain('## Дальнейшие действия');
  });

  it('input markdown is non-empty and well-formed UTF-8', () => {
    expect(markdown.length).toBeGreaterThan(0);
    expect(Buffer.from(markdown).toString('utf-8')).toBe(markdown);
  });

  // Note: full md→PDF golden comparison requires chromium and is delivered as
  // the SMOKE test (§ 11 of .tl/external-contracts/puppeteer-pdf.md). This
  // fixture test exercises the INPUT side of the contract only.
});
