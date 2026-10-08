import { z } from 'zod';
import { MeetingStatus } from '../enums.js';

// FR-004 / D-38 — speaker confirmation (contract v1; logic: WP-BACKEND-07,
// full description for worker and web: .tl/external-contracts/speakers-confirmation.md).
//
//   GET /api/meetings/:id/speakers → SpeakersResponse
//        statuses AWAITING_SPEAKERS and later (earlier → 409 MEETING_NOT_AWAITING_SPEAKERS)
//   PUT /api/meetings/:id/speakers  SpeakersPutRequest → SpeakersPutResponse
//        only in AWAITING_SPEAKERS (else 409 MEETING_NOT_AWAITING_SPEAKERS); writes
//        transcripts.speaker_map, moves the meeting to GENERATING_PROTOCOL and enqueues
//        protocol generation. Labels can be merged (many → one person), never split.

/** `SPEAKER_n` — the label Deepgram diarization produced (transcripts.segments_blob[].speaker). */
export const SpeakerLabelId = z.string().regex(/^SPEAKER_\d+$/);

export const SPEAKER_SAMPLES_MAX = 3;
export const SPEAKER_SAMPLE_TEXT_MAX = 200;
export const SPEAKER_NAME_MAX = 200;

export const SpeakerSample = z.object({
  start_ms: z.number().int().nonnegative(),
  /** ≤ 200 characters */
  text: z.string().max(SPEAKER_SAMPLE_TEXT_MAX),
});
export type SpeakerSample = z.infer<typeof SpeakerSample>;

export const SpeakerLabel = z.object({
  label: SpeakerLabelId,
  /** 'Speaker N' — the prompt's neutral name, N = label index + 1 */
  display: z.string(),
  duration_sec: z.number().nonnegative(),
  segment_count: z.number().int().nonnegative(),
  /** the 3 longest utterances (≤ 200 characters each), in time order */
  samples: z.array(SpeakerSample).max(SPEAKER_SAMPLES_MAX),
  /** current name in transcripts.speaker_map (worker pre-fill or the confirmation); null = «Speaker N» */
  name: z.string().nullable(),
  /** set after a confirmation that picked a project participant */
  participant_id: z.string().uuid().nullable(),
});
export type SpeakerLabel = z.infer<typeof SpeakerLabel>;

export const SpeakerParticipant = z.object({
  id: z.string().uuid(),
  name: z.string(),
  role: z.string().nullable(),
  organization: z.string().nullable(),
});
export type SpeakerParticipant = z.infer<typeof SpeakerParticipant>;

export const SpeakersResponse = z.object({
  meeting_id: z.string().uuid(),
  status: MeetingStatus,
  project_id: z.string().uuid().nullable(),
  /** participants of the meeting's project (empty without a project) */
  participants: z.array(SpeakerParticipant),
  labels: z.array(SpeakerLabel),
  /** null until confirmed or skipped */
  confirmed_at: z.string().datetime().nullable(),
});
export type SpeakersResponse = z.infer<typeof SpeakersResponse>;

export const SpeakerMappingEntry = z.object({
  label: SpeakerLabelId,
  /** a participant of the meeting's project; its name goes to speaker_map */
  participant_id: z.string().uuid().nullable().optional(),
  /** a free-form name when participant_id is absent; empty / null = keep «Speaker N» */
  name: z.string().trim().max(SPEAKER_NAME_MAX).nullable().optional(),
});
export type SpeakerMappingEntry = z.infer<typeof SpeakerMappingEntry>;

export const SpeakersPutRequest = z.object({
  action: z.enum(['confirm', 'skip']),
  /** ignored for 'skip' */
  mapping: z.array(SpeakerMappingEntry).max(100).default([]),
});
export type SpeakersPutRequest = z.infer<typeof SpeakersPutRequest>;

export const SpeakersPutResponse = z.object({
  meeting_id: z.string().uuid(),
  status: z.literal('GENERATING_PROTOCOL'),
});
export type SpeakersPutResponse = z.infer<typeof SpeakersPutResponse>;
