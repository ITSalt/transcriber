import { describe, it, expect } from 'vitest';
import { MeetingStatus, MeetingLanguage, JobStatus, VideoMimeType } from './enums.js';

describe('MeetingStatus', () => {
  it('parses valid values', () => {
    const values = [
      'CREATED',
      'UPLOADING',
      'UPLOADED',
      'TRANSCRIBING',
      'TRANSCRIBED',
      'GENERATING_PROTOCOL',
      'PROTOCOL_READY',
      'EDITED',
      'ERROR',
    ] as const;
    for (const v of values) {
      expect(MeetingStatus.parse(v)).toBe(v);
    }
  });

  it('rejects invalid value', () => {
    expect(() => MeetingStatus.parse('UNKNOWN')).toThrow();
  });
});

describe('MeetingLanguage', () => {
  it('parses RU, EN, AUTO', () => {
    expect(MeetingLanguage.parse('RU')).toBe('RU');
    expect(MeetingLanguage.parse('EN')).toBe('EN');
    expect(MeetingLanguage.parse('AUTO')).toBe('AUTO');
  });

  it('rejects invalid value', () => {
    expect(() => MeetingLanguage.parse('FR')).toThrow();
  });
});

describe('JobStatus', () => {
  it('parses PENDING, PROCESSING, DONE, FAILED', () => {
    expect(JobStatus.parse('PENDING')).toBe('PENDING');
    expect(JobStatus.parse('PROCESSING')).toBe('PROCESSING');
    expect(JobStatus.parse('DONE')).toBe('DONE');
    expect(JobStatus.parse('FAILED')).toBe('FAILED');
  });

  it('rejects invalid value', () => {
    expect(() => JobStatus.parse('IN_PROGRESS')).toThrow();
  });
});

describe('VideoMimeType', () => {
  it('parses all supported types', () => {
    const values = ['VIDEO_MP4', 'VIDEO_WEBM', 'VIDEO_MOV', 'VIDEO_AVI', 'VIDEO_MKV'] as const;
    for (const v of values) {
      expect(VideoMimeType.parse(v)).toBe(v);
    }
  });

  it('rejects invalid value', () => {
    expect(() => VideoMimeType.parse('video/mp4')).toThrow();
    expect(() => VideoMimeType.parse('AUDIO_MP3')).toThrow();
  });
});
