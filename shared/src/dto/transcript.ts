import { z } from 'zod';
import { MeetingLanguage } from '../enums.js';

// ─── TranscriptSegment ────────────────────────────────────────────────────────

/** Provider-neutral segment shape stored in the JSONB segments_blob column. */
export const TranscriptSegment = z.object({
  speaker: z.string(),
  start: z.number(),
  end: z.number(),
  text: z.string(),
});
export type TranscriptSegment = z.infer<typeof TranscriptSegment>;

// ─── TranscriptDto ────────────────────────────────────────────────────────────

export const TranscriptDto = z.object({
  id: z.string().uuid(),
  meetingId: z.string().uuid(),
  speakerMap: z.record(z.string(), z.string().nullable()),
  segments: z.array(TranscriptSegment),
  rawText: z.string().nullable(),
  language: MeetingLanguage,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type TranscriptDto = z.infer<typeof TranscriptDto>;
