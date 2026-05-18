import { z } from 'zod';

// UC-003 — Delete meeting

export const MeetingDeleteResponse = z.object({
  deleted: z.literal(true),
  in_flight_failed: z.boolean(), // true if any job was IN_PROGRESS at delete time (RQ-007)
});
export type MeetingDeleteResponse = z.infer<typeof MeetingDeleteResponse>;
