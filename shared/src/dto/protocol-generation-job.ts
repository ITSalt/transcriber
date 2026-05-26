import { z } from 'zod';
import { JobStatus } from '../enums.js';

// ─── ProtocolGenerationJobDto ─────────────────────────────────────────────────

export const ProtocolGenerationJobDto = z.object({
  id: z.string().uuid(),
  meetingId: z.string().uuid(),
  status: JobStatus,
  startedAt: z.string().datetime().nullable(),
  finishedAt: z.string().datetime().nullable(),
  errorMsg: z.string().nullable(),
  attemptCount: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type ProtocolGenerationJobDto = z.infer<typeof ProtocolGenerationJobDto>;
