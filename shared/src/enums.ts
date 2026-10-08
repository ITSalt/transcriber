import { z } from 'zod';

// ─── MeetingStatus ────────────────────────────────────────────────────────────

export const MeetingStatus = z.enum([
  'CREATED',
  'UPLOADING',
  'UPLOADED',
  // FR-004 / D-9: uploaded, waiting for POST /api/meetings/:id/start (contract v1)
  'AWAITING_START',
  'TRANSCRIBING',
  'TRANSCRIBED',
  // FR-004 / D-38: recognised, waiting for the author to confirm speakers (PUT /api/meetings/:id/speakers)
  'AWAITING_SPEAKERS',
  'GENERATING_PROTOCOL',
  'PROTOCOL_READY',
  'EDITED',
  'FAILED',
]);
export type MeetingStatus = z.infer<typeof MeetingStatus>;

// ─── MeetingLanguage ──────────────────────────────────────────────────────────

export const MeetingLanguage = z.enum(['RU', 'EN', 'AUTO']);
export type MeetingLanguage = z.infer<typeof MeetingLanguage>;

// ─── JobStatus ────────────────────────────────────────────────────────────────

export const JobStatus = z.enum(['PENDING', 'PROCESSING', 'DONE', 'FAILED']);
export type JobStatus = z.infer<typeof JobStatus>;

// ─── VideoMimeType ────────────────────────────────────────────────────────────

export const VideoMimeType = z.enum([
  'VIDEO_MP4',
  'VIDEO_WEBM',
  'VIDEO_MOV',
  'VIDEO_AVI',
  'VIDEO_MKV',
]);
export type VideoMimeType = z.infer<typeof VideoMimeType>;
