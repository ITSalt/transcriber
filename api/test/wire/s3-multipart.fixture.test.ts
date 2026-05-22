import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FIXTURE_PATH = join(__dirname, '..', 'fixtures', 's3-multipart-init-response.json');

describe('wire-evidence:fixture: s3-multipart-init-response', () => {
  const raw = JSON.parse(readFileSync(FIXTURE_PATH, 'utf-8'));

  it('init response carries the four load-bearing fields consumed by upload coordinator', () => {
    expect(raw.s3_key).toBeTypeOf('string');
    expect(raw.s3_key).toMatch(/^pending\//);
    expect(raw.s3_upload_id).toBeTypeOf('string');
    expect(raw.part_size).toBe(10485760);
    expect(raw.parts).toBeInstanceOf(Array);
  });

  it('parts list is consecutive 1-indexed, each carrying a presigned PUT URL', () => {
    for (let i = 0; i < raw.parts.length; i++) {
      expect(raw.parts[i].part_number).toBe(i + 1);
      expect(raw.parts[i].url).toMatch(/^https?:\/\//);
      expect(raw.parts[i].url).toContain('X-Amz-Algorithm=AWS4-HMAC-SHA256');
    }
  });

  it('presigned URLs use https scheme (browser-facing per § 7 of contract)', () => {
    for (const part of raw.parts) {
      expect(part.url.startsWith('https://')).toBe(true);
    }
  });
});
