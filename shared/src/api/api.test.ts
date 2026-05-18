import { describe, it, expect } from 'vitest';
import { MeetingListItem, MeetingListResponse } from './uc001.js';
import { MeetingDetailResponse, MeetingStatusEvent } from './uc002.js';
import { MeetingDeletedEvent, PingEvent, SseEvent, meetingChannel } from './sse-events.js';
import { MeetingDeleteResponse } from './uc003.js';
import { UploadCreateRequest, UploadFinalizeResponse } from './uc100.js';
import { TranscriptionJobPayload, TranscriptionResult } from './uc200.js';
import { TranscriptResponse } from './uc201.js';
import { ProtocolGenerationJobPayload } from './uc300.js';
import { ProtocolResponse, ProtocolSaveRequest, ProtocolSaveResponse } from './uc301.js';
import { PdfExportError } from './uc302.js';

const now = new Date().toISOString();
const uuid = '00000000-0000-4000-8000-000000000001';

// ─── UC-001 ───────────────────────────────────────────────────────────────────

describe('MeetingListItem', () => {
  const valid = {
    id: uuid,
    title: 'Demo',
    filename: 'demo.mp4',
    status: 'CREATED' as const,
    language: 'RU' as const,
    uploaded_at: now,
    updated_at: now,
    duration_sec: 60,
  };

  it('round-trips a valid item', () => {
    expect(MeetingListItem.parse(valid)).toEqual(valid);
  });

  it('accepts null title and duration_sec', () => {
    expect(MeetingListItem.parse({ ...valid, title: null, duration_sec: null })).toMatchObject({
      title: null,
      duration_sec: null,
    });
  });

  it('rejects missing filename', () => {
    const { filename: _f, ...rest } = valid;
    expect(() => MeetingListItem.parse(rest)).toThrow();
  });
});

describe('MeetingListResponse', () => {
  it('round-trips an empty list', () => {
    expect(MeetingListResponse.parse({ items: [] })).toEqual({ items: [] });
  });
});

// ─── UC-002 ───────────────────────────────────────────────────────────────────

describe('MeetingDetailResponse', () => {
  const valid = {
    meeting: {
      id: uuid,
      title: 'Demo',
      language: 'EN' as const,
      status: 'TRANSCRIBING' as const,
      uploaded_at: now,
      updated_at: now,
    },
    recording: {
      filename: 'demo.mp4',
      size_bytes: 5_000_000,
      mime_type: 'VIDEO_MP4' as const,
      duration_sec: null,
    },
    latest_transcription_job: {
      status: 'PROCESSING' as const,
      started_at: now,
      completed_at: null,
      error_reason: null,
    },
    latest_protocol_job: null,
    transcript_exists: false,
    protocol_exists: false,
  };

  it('round-trips a valid response', () => {
    expect(MeetingDetailResponse.parse(valid)).toEqual(valid);
  });

  it('accepts null jobs', () => {
    expect(
      MeetingDetailResponse.parse({
        ...valid,
        latest_transcription_job: null,
        latest_protocol_job: null,
      }),
    ).toMatchObject({ latest_transcription_job: null, latest_protocol_job: null });
  });
});

describe('MeetingStatusEvent', () => {
  it('round-trips a valid event', () => {
    const event = {
      type: 'meeting.status' as const,
      meeting_id: uuid,
      status: 'PROTOCOL_READY' as const,
    };
    expect(MeetingStatusEvent.parse(event)).toMatchObject(event);
  });

  it('rejects wrong type literal', () => {
    expect(() =>
      MeetingStatusEvent.parse({ type: 'other', meeting_id: uuid, status: 'CREATED' }),
    ).toThrow();
  });
});

// ─── UC-003 ───────────────────────────────────────────────────────────────────

describe('MeetingDeleteResponse', () => {
  it('round-trips', () => {
    expect(MeetingDeleteResponse.parse({ deleted: true, in_flight_failed: false })).toEqual({
      deleted: true,
      in_flight_failed: false,
    });
  });

  it('rejects deleted: false', () => {
    expect(() => MeetingDeleteResponse.parse({ deleted: false, in_flight_failed: false })).toThrow();
  });
});

// ─── UC-100 ───────────────────────────────────────────────────────────────────

describe('UploadCreateRequest', () => {
  const valid = {
    filename: 'video.mp4',
    size_bytes: 100_000,
    mime_type: 'VIDEO_MP4' as const,
  };

  it('round-trips a minimal request', () => {
    expect(UploadCreateRequest.parse(valid)).toMatchObject(valid);
  });

  it('accepts optional title and language', () => {
    expect(
      UploadCreateRequest.parse({ ...valid, title: 'Meeting', language: 'RU' }),
    ).toMatchObject({ title: 'Meeting', language: 'RU' });
  });

  it('rejects size_bytes > 524_288_000', () => {
    expect(() => UploadCreateRequest.parse({ ...valid, size_bytes: 600_000_000 })).toThrow();
  });

  it('rejects empty filename', () => {
    expect(() => UploadCreateRequest.parse({ ...valid, filename: '' })).toThrow();
  });

  it('rejects invalid mime_type', () => {
    expect(() => UploadCreateRequest.parse({ ...valid, mime_type: 'audio/mp3' })).toThrow();
  });
});

describe('UploadFinalizeResponse', () => {
  it('round-trips', () => {
    const r = { meeting_id: uuid, status: 'TRANSCRIBING' as const };
    expect(UploadFinalizeResponse.parse(r)).toEqual(r);
  });
});

// ─── UC-200 ───────────────────────────────────────────────────────────────────

describe('TranscriptionJobPayload', () => {
  it('round-trips', () => {
    const p = { transcription_job_id: uuid };
    expect(TranscriptionJobPayload.parse(p)).toEqual(p);
  });

  it('rejects non-uuid', () => {
    expect(() => TranscriptionJobPayload.parse({ transcription_job_id: 'not-a-uuid' })).toThrow();
  });
});

describe('TranscriptionResult', () => {
  const valid = {
    transcript_id: uuid,
    segments_count: 10,
    speakers_count: 2,
    language: 'RU' as const,
    speaker_map: { spk_0: 'Alice', spk_1: null },
  };

  it('round-trips', () => {
    expect(TranscriptionResult.parse(valid)).toEqual(valid);
  });

  it('accepts null speaker_map', () => {
    expect(TranscriptionResult.parse({ ...valid, speaker_map: null })).toMatchObject({
      speaker_map: null,
    });
  });
});

// ─── UC-201 ───────────────────────────────────────────────────────────────────

describe('TranscriptResponse', () => {
  const valid = {
    id: uuid,
    meeting_id: uuid,
    full_text: 'Hello world.',
    segments_count: 1,
    speakers_count: 1,
    language: 'EN' as const,
    speaker_map: { spk_0: 'Bob' },
    created_at: now,
  };

  it('round-trips', () => {
    expect(TranscriptResponse.parse(valid)).toEqual(valid);
  });

  it('accepts null speaker_map', () => {
    expect(TranscriptResponse.parse({ ...valid, speaker_map: null })).toMatchObject({
      speaker_map: null,
    });
  });
});

// ─── UC-300 ───────────────────────────────────────────────────────────────────

describe('ProtocolGenerationJobPayload', () => {
  it('round-trips', () => {
    const p = { protocol_generation_job_id: uuid };
    expect(ProtocolGenerationJobPayload.parse(p)).toEqual(p);
  });

  it('rejects non-uuid', () => {
    expect(() =>
      ProtocolGenerationJobPayload.parse({ protocol_generation_job_id: 'bad' }),
    ).toThrow();
  });
});

// ─── UC-301 ───────────────────────────────────────────────────────────────────

describe('ProtocolResponse', () => {
  const valid = {
    id: uuid,
    meeting_id: uuid,
    markdown_content: '# Protocol\n\nContent here.',
    version: 1,
    edit_count: 0,
    generated_at: now,
    last_edited_at: null,
  };

  it('round-trips', () => {
    expect(ProtocolResponse.parse(valid)).toEqual(valid);
  });

  it('rejects version < 1', () => {
    expect(() => ProtocolResponse.parse({ ...valid, version: 0 })).toThrow();
  });

  it('rejects negative edit_count', () => {
    expect(() => ProtocolResponse.parse({ ...valid, edit_count: -1 })).toThrow();
  });
});

describe('ProtocolSaveRequest', () => {
  it('round-trips', () => {
    const r = { markdown_content: '# Updated\n\nContent.' };
    expect(ProtocolSaveRequest.parse(r)).toEqual(r);
  });

  it('rejects empty markdown_content', () => {
    expect(() => ProtocolSaveRequest.parse({ markdown_content: '' })).toThrow();
  });
});

describe('ProtocolSaveResponse', () => {
  const valid = {
    version: 2,
    edit_count: 1,
    last_edited_at: now,
    meeting_status: 'EDITED' as const,
  };

  it('round-trips', () => {
    expect(ProtocolSaveResponse.parse(valid)).toEqual(valid);
  });

  it('rejects version < 2', () => {
    expect(() => ProtocolSaveResponse.parse({ ...valid, version: 1 })).toThrow();
  });

  it('rejects wrong meeting_status literal', () => {
    expect(() =>
      ProtocolSaveResponse.parse({ ...valid, meeting_status: 'PROTOCOL_READY' }),
    ).toThrow();
  });
});

// ─── UC-302 ───────────────────────────────────────────────────────────────────

describe('PdfExportError', () => {
  it('round-trips', () => {
    const e = { code: 'PDF_RENDER_FAILED' as const, message: 'Puppeteer crashed' };
    expect(PdfExportError.parse(e)).toEqual(e);
  });

  it('rejects wrong code', () => {
    expect(() =>
      PdfExportError.parse({ code: 'INTERNAL_ERROR', message: 'oops' }),
    ).toThrow();
  });
});

// ─── SSE events ───────────────────────────────────────────────────────────────

describe('MeetingDeletedEvent', () => {
  const uuid = '00000000-0000-4000-8000-000000000001';

  it('round-trips', () => {
    const e = { type: 'meeting.deleted' as const, meeting_id: uuid };
    expect(MeetingDeletedEvent.parse(e)).toEqual(e);
  });

  it('rejects non-uuid meeting_id', () => {
    expect(() =>
      MeetingDeletedEvent.parse({ type: 'meeting.deleted', meeting_id: 'not-a-uuid' }),
    ).toThrow();
  });

  it('rejects wrong type literal', () => {
    expect(() =>
      MeetingDeletedEvent.parse({ type: 'meeting.status', meeting_id: uuid }),
    ).toThrow();
  });
});

describe('PingEvent', () => {
  it('round-trips', () => {
    expect(PingEvent.parse({ type: 'ping' })).toEqual({ type: 'ping' });
  });

  it('rejects non-ping type', () => {
    expect(() => PingEvent.parse({ type: 'pong' })).toThrow();
  });
});

describe('SseEvent discriminated union', () => {
  const uuid = '00000000-0000-4000-8000-000000000001';

  it('discriminates meeting.status', () => {
    const raw = { type: 'meeting.status', meeting_id: uuid, status: 'TRANSCRIBING', error_reason: null };
    const parsed = SseEvent.parse(raw);
    expect(parsed.type).toBe('meeting.status');
  });

  it('discriminates ping', () => {
    const parsed = SseEvent.parse({ type: 'ping' });
    expect(parsed.type).toBe('ping');
  });

  it('discriminates meeting.deleted', () => {
    const raw = { type: 'meeting.deleted', meeting_id: uuid };
    const parsed = SseEvent.parse(raw);
    expect(parsed.type).toBe('meeting.deleted');
  });

  it('rejects unknown type', () => {
    expect(() => SseEvent.parse({ type: 'unknown.event' })).toThrow();
  });
});

describe('meetingChannel', () => {
  it('returns meeting:<id> format', () => {
    expect(meetingChannel('abc-123')).toBe('meeting:abc-123');
  });

  it('returns meeting:<uuid> format for uuid', () => {
    const id = '00000000-0000-4000-8000-000000000001';
    expect(meetingChannel(id)).toBe(`meeting:${id}`);
  });
});
