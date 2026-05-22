import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FIXTURE_PATH = join(__dirname, '..', 'fixtures', 'deepgram-nova3-utterances.json');

describe('wire-evidence:fixture: deepgram-nova3-utterances', () => {
  const raw = JSON.parse(readFileSync(FIXTURE_PATH, 'utf-8'));

  it('exposes the load-bearing parsing path used by deepgram-adapter.ts', () => {
    expect(raw.results.channels[0].alternatives[0].transcript).toBeTypeOf('string');
    expect(raw.results.channels[0].detected_language).toBe('ru');
    expect(raw.results.utterances).toBeInstanceOf(Array);
    expect(raw.results.utterances.length).toBeGreaterThan(0);
  });

  it('every utterance carries the four required fields (speaker, transcript, start, end)', () => {
    for (const u of raw.results.utterances as Array<Record<string, unknown>>) {
      expect(u).toHaveProperty('speaker');
      expect(u).toHaveProperty('transcript');
      expect(u).toHaveProperty('start');
      expect(u).toHaveProperty('end');
      expect(typeof u.start).toBe('number');
      expect(typeof u.end).toBe('number');
    }
  });

  it('speaker ids are 0-indexed integers (matches AsrSegment normalisation to "Speaker N")', () => {
    const speakers = new Set(
      (raw.results.utterances as Array<{ speaker: number }>).map((u) => u.speaker),
    );
    for (const s of speakers) {
      expect(Number.isInteger(s)).toBe(true);
      expect(s).toBeGreaterThanOrEqual(0);
    }
  });
});
