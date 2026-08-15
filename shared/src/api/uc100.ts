import { z } from 'zod';
import { MeetingLanguage, VideoMimeType } from '../enums.js';

// UC-100 — Upload meeting video

// ── Limits and accepted formats ────────────────────────────────────────────────
// Centralised so api/, worker/, web/ all agree without copy-pasting magic
// numbers. RQ-008 originally pinned this to 500 MB, then 1 GiB, and 1.5 GiB by
// DEC-004 / FR-002.
export const MAX_UPLOAD_BYTES = 1_610_612_736; // 1.5 GiB (RQ-008)

/**
 * Maximum accepted recording duration, in seconds (RQ-039, DEC-004).
 *
 * The byte cap protects upload and storage; THIS is what protects the processing
 * pipeline — peak worker memory, the Deepgram request budget and the LLM context
 * for the protocol all scale with duration, not with file size. Bytes are a poor
 * proxy: 1.5 GiB is ~5.5 h at the 656 kbps observed in production but only ~71
 * minutes at 1080p/3 Mbps, so for typical meeting bitrates this gate binds first.
 */
export const MAX_UPLOAD_DURATION_SEC = 14_400; // 4 hours (RQ-039)

export const ACCEPTED_UPLOAD_MIME_TYPES = [
  'video/mp4',
  'video/x-matroska',
  'video/quicktime',
  'video/webm',
] as const;
export const AcceptedUploadMime = z.enum(ACCEPTED_UPLOAD_MIME_TYPES);
export type AcceptedUploadMime = z.infer<typeof AcceptedUploadMime>;

// Upload transport is direct S3 presigned multipart (ADR-012, which supersedes
// ADR-005's TUS): POST /api/uploads/init -> browser PUTs parts straight to object
// storage -> POST /api/uploads/complete. Server validates RQ-008/009/010/039.

export const UploadFinalizeResponse = z.object({
  meeting_id: z.string().uuid(),
  status: z.literal('TRANSCRIBING'),
});
export type UploadFinalizeResponse = z.infer<typeof UploadFinalizeResponse>;

// TUS-era leftover: referenced only by shared/src/api/api.test.ts, not by any
// production code path. The live shapes are UploadInitRequest / UploadCompleteRequest.
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
