import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { SseEvent } from '@transcrib/shared';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FIXTURE_PATH = join(__dirname, '..', '..', '..', 'shared', 'test', 'fixtures', 'sse-event-frames.json');

interface SseFrame {
  type: string;
  raw: string;
  parsed_payload: unknown;
}

describe('wire-evidence:fixture: sse-event-frames', () => {
  const { frames } = JSON.parse(readFileSync(FIXTURE_PATH, 'utf-8')) as { frames: SseFrame[] };

  it('every frame begins with the mandatory `event: <type>` line (7f983f6 postmortem class)', () => {
    for (const frame of frames) {
      expect(frame.raw).toMatch(/^event: [a-z.]+\n/);
    }
  });

  it('every frame parses through the SseEvent discriminated union (consumer parse path)', () => {
    for (const frame of frames) {
      const parsed = SseEvent.parse(frame.parsed_payload);
      expect(parsed.type).toBe(frame.type);
    }
  });

  it('every frame ends with the mandatory blank-line frame terminator', () => {
    for (const frame of frames) {
      expect(frame.raw.endsWith('\n\n')).toBe(true);
    }
  });
});
