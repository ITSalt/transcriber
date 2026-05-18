import { z } from 'zod';

// UC-300 — Generate protocol pipeline (BullMQ worker)

// BullMQ queue: 'protocolGenerationJob'
export const ProtocolGenerationJobPayload = z.object({
  protocol_generation_job_id: z.string().uuid(),
});
export type ProtocolGenerationJobPayload = z.infer<typeof ProtocolGenerationJobPayload>;
