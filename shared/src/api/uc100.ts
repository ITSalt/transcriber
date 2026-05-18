import { z } from 'zod';
import { MeetingLanguage, VideoMimeType } from '../enums.js';

// UC-100 — Upload meeting video

// TUS metadata header (Base64 KV pairs):
//   filename, mime_type, size_bytes, title?, language?
// Server validates per RQ-008/009/010 at pre-create.

export const UploadFinalizeResponse = z.object({
  meeting_id: z.string().uuid(),
  status: z.literal('TRANSCRIBING'),
});
export type UploadFinalizeResponse = z.infer<typeof UploadFinalizeResponse>;

// Used as request shape for client-side validation BEFORE TUS create.
export const UploadCreateRequest = z.object({
  filename: z.string().min(1),
  size_bytes: z.number().int().positive().max(524_288_000), // RQ-008
  mime_type: VideoMimeType, // RQ-009
  title: z.string().optional(),
  language: MeetingLanguage.optional(), // omit/null -> auto-detect per RQ-012
});
export type UploadCreateRequest = z.infer<typeof UploadCreateRequest>;
