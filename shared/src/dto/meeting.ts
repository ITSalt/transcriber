import { z } from 'zod';
import { MeetingStatus, MeetingLanguage } from '../enums.js';

// ─── MeetingDto ───────────────────────────────────────────────────────────────

export const MeetingDto = z.object({
  id: z.string().uuid(),
  title: z.string(),
  status: MeetingStatus,
  language: MeetingLanguage,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type MeetingDto = z.infer<typeof MeetingDto>;
