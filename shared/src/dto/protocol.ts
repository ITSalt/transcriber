import { z } from 'zod';

// ─── ProtocolDto ──────────────────────────────────────────────────────────────

export const ProtocolDto = z.object({
  id: z.string().uuid(),
  meetingId: z.string().uuid(),
  contentMd: z.string(),
  version: z.number().int().min(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type ProtocolDto = z.infer<typeof ProtocolDto>;
