import { describe, it, expect } from 'vitest';
import { MeetingDto } from './meeting.js';
import { RecordingDto } from './recording.js';
import { TranscriptDto, TranscriptSegment } from './transcript.js';
import { TranscriptionJobDto } from './transcription-job.js';
import { ProtocolGenerationJobDto } from './protocol-generation-job.js';
import { ProtocolDto } from './protocol.js';

const now = new Date().toISOString();
const uuid = '00000000-0000-4000-8000-000000000001';

describe('MeetingDto', () => {
  const valid = {
    id: uuid,
    title: 'Standup',
    status: 'CREATED' as const,
    language: 'RU' as const,
    createdAt: now,
    updatedAt: now,
  };

  it('round-trips a valid object', () => {
    expect(MeetingDto.parse(valid)).toEqual(valid);
  });

  it('rejects missing id', () => {
    const { id: _id, ...rest } = valid;
    expect(() => MeetingDto.parse(rest)).toThrow();
  });

  it('rejects bad status', () => {
    expect(() => MeetingDto.parse({ ...valid, status: 'PROCESSING' })).toThrow();
  });
});

describe('RecordingDto', () => {
  const valid = {
    id: uuid,
    meetingId: uuid,
    storageUri: 's3://my-bucket/recordings/file.mp4',
    mimeType: 'VIDEO_MP4' as const,
    sizeBytes: 1_000_000,
    durationSec: 120.5,
    uploadedAt: now,
  };

  it('round-trips a valid object', () => {
    expect(RecordingDto.parse(valid)).toEqual(valid);
  });

  it('accepts null durationSec', () => {
    expect(RecordingDto.parse({ ...valid, durationSec: null })).toMatchObject({
      durationSec: null,
    });
  });

  it('rejects non-s3 storageUri', () => {
    expect(() => RecordingDto.parse({ ...valid, storageUri: 'https://example.com/file.mp4' })).toThrow();
  });

  it('rejects negative sizeBytes', () => {
    expect(() => RecordingDto.parse({ ...valid, sizeBytes: -1 })).toThrow();
  });
});

describe('TranscriptSegment', () => {
  const valid = { speaker: 'spk_0', start: 0.0, end: 3.5, text: 'Hello world' };

  it('round-trips a valid segment', () => {
    expect(TranscriptSegment.parse(valid)).toEqual(valid);
  });

  it('rejects missing text', () => {
    const { text: _t, ...rest } = valid;
    expect(() => TranscriptSegment.parse(rest)).toThrow();
  });
});

describe('TranscriptDto', () => {
  const valid = {
    id: uuid,
    meetingId: uuid,
    speakerMap: { spk_0: 'Alice', spk_1: null },
    segments: [{ speaker: 'spk_0', start: 0, end: 2, text: 'Hi' }],
    rawText: 'Hi',
    language: 'EN' as const,
    createdAt: now,
    updatedAt: now,
  };

  it('round-trips a valid object', () => {
    expect(TranscriptDto.parse(valid)).toEqual(valid);
  });

  it('accepts null rawText', () => {
    expect(TranscriptDto.parse({ ...valid, rawText: null })).toMatchObject({ rawText: null });
  });
});

describe('TranscriptionJobDto', () => {
  const valid = {
    id: uuid,
    meetingId: uuid,
    status: 'PENDING' as const,
    startedAt: null,
    finishedAt: null,
    errorMsg: null,
    attemptCount: 0,
    createdAt: now,
    updatedAt: now,
  };

  it('round-trips a valid object', () => {
    expect(TranscriptionJobDto.parse(valid)).toEqual(valid);
  });

  it('accepts startedAt as datetime string', () => {
    expect(
      TranscriptionJobDto.parse({ ...valid, status: 'PROCESSING', startedAt: now }),
    ).toMatchObject({ status: 'PROCESSING', startedAt: now });
  });

  it('accepts attemptCount >= 0', () => {
    expect(TranscriptionJobDto.parse({ ...valid, attemptCount: 3 })).toMatchObject({ attemptCount: 3 });
  });

  it('rejects negative attemptCount', () => {
    expect(() => TranscriptionJobDto.parse({ ...valid, attemptCount: -1 })).toThrow();
  });

  it('rejects non-integer attemptCount', () => {
    expect(() => TranscriptionJobDto.parse({ ...valid, attemptCount: 1.5 })).toThrow();
  });
});

describe('ProtocolGenerationJobDto', () => {
  const valid = {
    id: uuid,
    meetingId: uuid,
    status: 'DONE' as const,
    startedAt: now,
    finishedAt: now,
    errorMsg: null,
    attemptCount: 0,
    createdAt: now,
    updatedAt: now,
  };

  it('round-trips a valid object', () => {
    expect(ProtocolGenerationJobDto.parse(valid)).toEqual(valid);
  });

  it('accepts attemptCount >= 0', () => {
    expect(ProtocolGenerationJobDto.parse({ ...valid, attemptCount: 5 })).toMatchObject({ attemptCount: 5 });
  });

  it('rejects negative attemptCount', () => {
    expect(() => ProtocolGenerationJobDto.parse({ ...valid, attemptCount: -1 })).toThrow();
  });

  it('rejects non-integer attemptCount', () => {
    expect(() => ProtocolGenerationJobDto.parse({ ...valid, attemptCount: 2.7 })).toThrow();
  });
});

describe('ProtocolDto', () => {
  const valid = {
    id: uuid,
    meetingId: uuid,
    contentMd: '# Meeting\n\nSome notes.',
    version: 1,
    createdAt: now,
    updatedAt: now,
  };

  it('round-trips a valid object', () => {
    expect(ProtocolDto.parse(valid)).toEqual(valid);
  });

  it('rejects version < 1', () => {
    expect(() => ProtocolDto.parse({ ...valid, version: 0 })).toThrow();
  });
});
