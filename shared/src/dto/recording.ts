import { z } from 'zod';
import { VideoMimeType } from '../enums.js';

// ─── RecordingDto ─────────────────────────────────────────────────────────────

export const RecordingDto = z.object({
  id: z.string().uuid(),
  meetingId: z.string().uuid(),
  /** s3://bucket/key — ADR-004 */
  storageUri: z.string().startsWith('s3://'),
  mimeType: VideoMimeType,
  sizeBytes: z.number().int().positive(),
  durationSec: z.number().nullable(),
  uploadedAt: z.string().datetime(),
});
export type RecordingDto = z.infer<typeof RecordingDto>;
