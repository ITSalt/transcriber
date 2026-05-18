import { z } from 'zod';
import { MeetingLanguage } from '../enums.js';

// UC-201 — View and download transcript

export const TranscriptResponse = z.object({
  id: z.string().uuid(),
  meeting_id: z.string().uuid(),
  full_text: z.string(),
  segments_count: z.number().int(),
  speakers_count: z.number().int(),
  language: MeetingLanguage,
  speaker_map: z.record(z.string(), z.string().nullable()).nullable(),
  created_at: z.string().datetime(),
});
export type TranscriptResponse = z.infer<typeof TranscriptResponse>;
