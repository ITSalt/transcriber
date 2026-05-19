import { z } from 'zod';
import { MeetingLanguage } from '../enums.js';

// UC-200 — Process transcription pipeline (BullMQ worker)

// BullMQ queue: 'transcriptionJob'
export const TranscriptionJobPayload = z.object({
  transcription_job_id: z.string().uuid(),
  // Optional user-supplied speaker count hint, propagated from the upload form.
  // When present, the worker pins Deepgram diarization to exactly this value.
  speaker_count: z.number().int().min(1).max(10).nullable().optional(),
});
export type TranscriptionJobPayload = z.infer<typeof TranscriptionJobPayload>;

// Internal worker result (not exposed via HTTP)
export const TranscriptionResult = z.object({
  transcript_id: z.string().uuid(),
  segments_count: z.number().int(),
  speakers_count: z.number().int(),
  language: MeetingLanguage,
  speaker_map: z.record(z.string(), z.string().nullable()).nullable(),
});
export type TranscriptionResult = z.infer<typeof TranscriptionResult>;
