import { z } from 'zod';
import { MeetingStatus, MeetingLanguage } from '../enums.js';

// UC-004 — Retry failed meeting processing

/**
 * Response shape for POST /api/meetings/:id/retry.
 * Returns the updated meeting (mirrors GET /api/meetings/:id shape).
 * status is restricted to the two valid in-progress states that a retry
 * can transition into (RQ-034).
 */
export const RetryMeetingResponse = z.object({
  id: z.string().uuid(),
  title: z.string(),
  status: z.enum(['TRANSCRIBING', 'PROTOCOL_GENERATING']),
  language: MeetingLanguage,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type RetryMeetingResponse = z.infer<typeof RetryMeetingResponse>;

/**
 * Full meeting shape returned on 200 (superset of RetryMeetingResponse;
 * status is the broader MeetingStatus for serializer compatibility).
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
