import { describe, it, expect } from 'vitest';
import { MeetingStatus } from '../enums.js';
import { MeetingStatusEvent } from './uc002.js';
import { PROGRAM_ERRORS, PROGRAM_ERROR_MESSAGES } from './errors.js';
import { SpeakersPutRequest, SpeakersPutResponse, SpeakersResponse } from './speakers.js';

const uuid = '123e4567-e89b-42d3-a456-426614174000';

describe('speakers contract v1 (D-38)', () => {
  it('AWAITING_SPEAKERS is a MeetingStatus and a valid SSE status', () => {
    expect(MeetingStatus.parse('AWAITING_SPEAKERS')).toBe('AWAITING_SPEAKERS');
    expect(MeetingStatusEvent.safeParse({ type: 'meeting.status', meeting_id: uuid, status: 'AWAITING_SPEAKERS' }).success).toBe(true);
  });

  it('SpeakersResponse round-trips a card with 3 samples', () => {
    const body = {
      meeting_id: uuid,
      status: 'AWAITING_SPEAKERS',
      project_id: null,
      participants: [{ id: uuid, name: 'Анна', role: null, organization: 'ACME' }],
      labels: [{
        label: 'SPEAKER_0', display: 'Speaker 1', duration_sec: 12.5, segment_count: 3,
        samples: [{ start_ms: 0, text: 'a' }, { start_ms: 1, text: 'b' }, { start_ms: 2, text: 'c' }],
        name: null, participant_id: null,
      }],
      confirmed_at: null,
    };
    expect(SpeakersResponse.parse(body)).toEqual(body);
    expect(SpeakersResponse.safeParse({ ...body, labels: [{ ...body.labels[0], samples: [...body.labels[0]!.samples, { start_ms: 3, text: 'd' }] }] }).success).toBe(false);
    expect(SpeakersResponse.safeParse({ ...body, labels: [{ ...body.labels[0], samples: [{ start_ms: 0, text: 'x'.repeat(201) }] }] }).success).toBe(false);
  });

  it('SpeakersPutRequest: merge entries, name-only entries, skip without mapping', () => {
    const ok = SpeakersPutRequest.parse({
      action: 'confirm',
      mapping: [{ label: 'SPEAKER_0', participant_id: uuid }, { label: 'SPEAKER_2', participant_id: uuid }, { label: 'SPEAKER_1', name: ' Гость ' }, { label: 'SPEAKER_3' }],
    });
    expect(ok.mapping[2]!.name).toBe('Гость');
    expect(SpeakersPutRequest.parse({ action: 'skip' }).mapping).toEqual([]);
  });

  it('SpeakersPutRequest rejects a bad action, label or participant id', () => {
    expect(SpeakersPutRequest.safeParse({ action: 'maybe' }).success).toBe(false);
    expect(SpeakersPutRequest.safeParse({ action: 'confirm', mapping: [{ label: 'Speaker 1' }] }).success).toBe(false);
    expect(SpeakersPutRequest.safeParse({ action: 'confirm', mapping: [{ label: 'SPEAKER_0', participant_id: 'x' }] }).success).toBe(false);
  });

  it('PUT answers GENERATING_PROTOCOL only; the 409 code is in PROGRAM_ERRORS', () => {
    expect(SpeakersPutResponse.parse({ meeting_id: uuid, status: 'GENERATING_PROTOCOL' }).status).toBe('GENERATING_PROTOCOL');
    expect(SpeakersPutResponse.safeParse({ meeting_id: uuid, status: 'TRANSCRIBED' }).success).toBe(false);
    expect(PROGRAM_ERRORS.MEETING_NOT_AWAITING_SPEAKERS).toBe(409);
    expect(PROGRAM_ERROR_MESSAGES.MEETING_NOT_AWAITING_SPEAKERS.length).toBeGreaterThan(0);
  });
});
