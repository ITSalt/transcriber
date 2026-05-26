import { z } from 'zod';
import { MeetingStatus, MeetingLanguage } from '../enums.js';

// UC-004 — Retry failed meeting processing

/**
 * Full meeting shape returned on 200 (status is the broader MeetingStatus
 * for serializer compatibility).
 */
export const RetryMeetingFullResponse = z.object({
  id: z.string().uuid(),
  title: z.string(),
  status: MeetingStatus,
  language: MeetingLanguage,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type RetryMeetingFullResponse = z.infer<typeof RetryMeetingFullResponse>;
