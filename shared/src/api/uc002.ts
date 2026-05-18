import { z } from 'zod';
import { MeetingStatus, MeetingLanguage, JobStatus, VideoMimeType } from '../enums.js';

// UC-002 — View meeting detail

export const MeetingDetailResponse = z.object({
  meeting: z.object({
    id: z.string().uuid(),
    title: z.string().nullable(),
    language: MeetingLanguage.nullable(),
    status: MeetingStatus,
    uploaded_at: z.string().datetime(),
    updated_at: z.string().datetime(),
  }),
  recording: z.object({
    filename: z.string(),
    size_bytes: z.number().int(),
    mime_type: VideoMimeType,
    duration_sec: z.number().int().nullable(),
  }),
  latest_transcription_job: z
    .object({
      status: JobStatus,
      started_at: z.string().datetime().nullable(),
      completed_at: z.string().datetime().nullable(),
      error_reason: z.string().nullable(),
    })
    .nullable(),
  latest_protocol_job: z
    .object({
      status: JobStatus,
      started_at: z.string().datetime().nullable(),
      completed_at: z.string().datetime().nullable(),
      error_reason: z.string().nullable(),
    })
    .nullable(),
  transcript_exists: z.boolean(),
  protocol_exists: z.boolean(),
});
export type MeetingDetailResponse = z.infer<typeof MeetingDetailResponse>;

// SSE event payload (consumed by FE, emitted by BE via TECH-012)
export const MeetingStatusEvent = z.object({
  type: z.literal('meeting.status'),
  meeting_id: z.string().uuid(),
  status: MeetingStatus,
  error_reason: z.string().nullable().optional(),
});
export type MeetingStatusEvent = z.infer<typeof MeetingStatusEvent>;
