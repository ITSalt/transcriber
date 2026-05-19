import { z } from 'zod';
import { MeetingLanguage, VideoMimeType } from '../enums.js';

// UC-100 — Upload meeting video

// ── Limits and accepted formats ────────────────────────────────────────────────
// Centralised so api/, worker/, web/ all agree without copy-pasting magic
// numbers. RQ-008 originally pinned this to 500 MB; bumped to 1 GiB after we
// started receiving full-meeting WebM recordings.
export const MAX_UPLOAD_BYTES = 1_073_741_824; // 1 GiB
export const ACCEPTED_UPLOAD_MIME_TYPES = [
  'video/mp4',
  'video/x-matroska',
  'video/quicktime',
  'video/webm',
] as const;
export const AcceptedUploadMime = z.enum(ACCEPTED_UPLOAD_MIME_TYPES);
export type AcceptedUploadMime = z.infer<typeof AcceptedUploadMime>;

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
  size_bytes: z.number().int().positive().max(MAX_UPLOAD_BYTES), // RQ-008
  mime_type: VideoMimeType, // RQ-009
  title: z.string().optional(),
  language: MeetingLanguage.optional(), // omit/null -> auto-detect per RQ-012
});
export type UploadCreateRequest = z.infer<typeof UploadCreateRequest>;

// ── Direct S3 multipart upload ────────────────────────────────────────────────

export const UploadInitRequest = z.object({
  filename: z.string().min(1),
  size_bytes: z.number().int().positive().max(MAX_UPLOAD_BYTES), // RQ-008
  filetype: AcceptedUploadMime, // RQ-009
  title: z.string().min(1).max(255),
  language: z.enum(['RU', 'EN']).nullable(), // null = auto-detect (RQ-012)
});
export type UploadInitRequest = z.infer<typeof UploadInitRequest>;

export const UploadInitResponse = z.object({
  s3_key: z.string(),
  s3_upload_id: z.string(),
  part_size: z.number().int(),
  parts: z.array(z.object({ part_number: z.number().int(), url: z.string() })),
});
export type UploadInitResponse = z.infer<typeof UploadInitResponse>;

export const UploadCompleteRequest = z.object({
  s3_key: z.string().min(1),
  s3_upload_id: z.string().min(1),
  filename: z.string().min(1),
  size_bytes: z.number().int().positive().max(MAX_UPLOAD_BYTES), // RQ-008
  filetype: AcceptedUploadMime,
  title: z.string().min(1).max(255),
  language: z.enum(['RU', 'EN']).nullable(),
  // Optional ASR hint: if provided, pins Deepgram diarization to exactly N
  // speakers (min_speakers = max_speakers = N). Null/omitted = auto-detect.
  // Range bounded to keep accidental UI values in a sane space.
  speaker_count: z.number().int().min(1).max(10).nullable().optional(),
  parts: z.array(z.object({
    part_number: z.number().int().positive(),
    etag: z.string().min(1),
  })).min(1),
});
export type UploadCompleteRequest = z.infer<typeof UploadCompleteRequest>;

export const UploadAbortRequest = z.object({
  s3_key: z.string().min(1),
  s3_upload_id: z.string().min(1),
});
export type UploadAbortRequest = z.infer<typeof UploadAbortRequest>;
