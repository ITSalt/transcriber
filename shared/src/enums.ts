import { z } from 'zod';

// ─── MeetingStatus ────────────────────────────────────────────────────────────

export const MeetingStatus = z.enum([
  'CREATED',
  'UPLOADING',
  'UPLOADED',
  'TRANSCRIBING',
  'TRANSCRIBED',
  'GENERATING_PROTOCOL',
  'PROTOCOL_READY',
  'EDITED',
  'ERROR',
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
