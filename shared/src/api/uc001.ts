import { z } from 'zod';
import { MeetingStatus, MeetingLanguage } from '../enums.js';

// UC-001 — View meeting catalog

export const MeetingListItem = z.object({
  id: z.string().uuid(),
  title: z.string().nullable(),
  filename: z.string(), // fallback when title is null
  status: MeetingStatus,
  language: MeetingLanguage.nullable(),
  uploaded_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  duration_sec: z.number().int().nullable(),
});
export type MeetingListItem = z.infer<typeof MeetingListItem>;

export const MeetingListResponse = z.object({
  items: z.array(MeetingListItem),
});
export type MeetingListResponse = z.infer<typeof MeetingListResponse>;
