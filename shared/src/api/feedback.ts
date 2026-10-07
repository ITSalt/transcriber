import { z } from 'zod';
import { AuthUser } from './auth.js';

// FR-005 — protocol versions and protocol feedback (contract v1; logic: WP-API-FEEDBACK-01,
// version writes also in WP-BACKEND-01 (USER_EDIT on PUT protocol) and WP-WORKER-01
// (GENERATED with the Protocol row)).
//
//   GET  /api/meetings/:id/protocol/versions        → ProtocolVersionListResponse
//   GET  /api/meetings/:id/protocol/versions/:n     → ProtocolVersionResponse
//                                                    | 404 PROTOCOL_VERSION_NOT_FOUND
//   POST /api/meetings/:id/feedback   multipart/form-data:
//          fields FeedbackFields (kind, category?, text?) + optional part `file`
//          → 201 FeedbackCreateResponse
//          | 400 FEEDBACK_TEXT_REQUIRED | FEEDBACK_FILE_REQUIRED
//          | 413 FEEDBACK_FILE_TOO_LARGE | 415 FEEDBACK_FILE_TYPE
//   GET  /api/meetings/:id/feedback                 → FeedbackListResponse
//   GET  /api/meetings/:id/feedback/:feedbackId/file → the stored file (attachment)
// Feedback is bound to the CURRENT version (protocol_version_n) at submit time.
// Files: s3://<bucket>/ws/<workspaceId>/feedback/<feedbackId>/<fileName>.

// ─── Versions ─────────────────────────────────────────────────────────────────

/** LEGACY = backfilled pre-program protocol that had been edited (original lost). */
export const ProtocolVersionKind = z.enum(['GENERATED', 'USER_EDIT', 'LEGACY']);
export type ProtocolVersionKind = z.infer<typeof ProtocolVersionKind>;

export const ProtocolVersionSummary = z.object({
  n: z.number().int().min(1),
  kind: ProtocolVersionKind,
  /** null for GENERATED / LEGACY */
  author: AuthUser.nullable(),
  generation_id: z.string().uuid().nullable(),
  created_at: z.string().datetime(),
});
export type ProtocolVersionSummary = z.infer<typeof ProtocolVersionSummary>;

export const ProtocolVersionListResponse = z.object({
  /** ascending by n */
  items: z.array(ProtocolVersionSummary),
  current_n: z.number().int().min(1).nullable(),
});
export type ProtocolVersionListResponse = z.infer<typeof ProtocolVersionListResponse>;

export const ProtocolVersionResponse = ProtocolVersionSummary.extend({
  markdown: z.string(),
});
export type ProtocolVersionResponse = z.infer<typeof ProtocolVersionResponse>;

// ─── Feedback ─────────────────────────────────────────────────────────────────

export const FeedbackKind = z.enum(['COMMENT', 'CORRECTED_PROTOCOL', 'DOCX_REVIEW']);
export type FeedbackKind = z.infer<typeof FeedbackKind>;

/** «атрибуция спикеров / пропущено решение / неверная задача / выдумано / термины-имена / стиль / другое» */
export const FeedbackCategory = z.enum([
  'SPEAKER_ATTRIBUTION',
  'MISSED_DECISION',
  'WRONG_TASK',
  'FABRICATED',
  'TERMS_NAMES',
  'STYLE',
  'OTHER',
]);
export type FeedbackCategory = z.infer<typeof FeedbackCategory>;

export const FEEDBACK_TEXT_MAX = 200_000;
export const FEEDBACK_FILE_MAX_BYTES = 20 * 1024 * 1024; // 20 MB, every kind
export const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
/** Accepted file extensions → MIME types per kind (extension, mime AND zip signature are checked). */
export const FEEDBACK_FILE_TYPES = {
  COMMENT: {},
  CORRECTED_PROTOCOL: {
    '.md': ['text/markdown', 'text/plain', 'application/octet-stream'],
    '.txt': ['text/plain', 'application/octet-stream'],
    '.docx': [DOCX_MIME, 'application/octet-stream'],
  },
  DOCX_REVIEW: {
    '.docx': [DOCX_MIME, 'application/octet-stream'],
  },
} as const satisfies Record<FeedbackKind, Record<string, readonly string[]>>;
/** "PK\x03\x04" — every .docx is a zip */
export const ZIP_SIGNATURE = [0x50, 0x4b, 0x03, 0x04] as const;

/** Non-file multipart fields of POST /api/meetings/:id/feedback. */
export const FeedbackFields = z.object({
  kind: FeedbackKind,
  category: FeedbackCategory.nullable().optional(),
  text: z.string().trim().min(1).max(FEEDBACK_TEXT_MAX).nullable().optional(),
});
export type FeedbackFields = z.infer<typeof FeedbackFields>;

export interface FeedbackFileMeta {
  fileName: string;
  mime: string;
  sizeBytes: number;
}

export type FeedbackSubmissionError =
  | 'FEEDBACK_TEXT_REQUIRED'
  | 'FEEDBACK_FILE_REQUIRED'
  | 'FEEDBACK_FILE_TYPE'
  | 'FEEDBACK_FILE_TOO_LARGE';

/**
 * Kind-specific rules (AF): COMMENT = text (+ category), no file; CORRECTED_PROTOCOL = text
 * OR a .md/.txt/.docx file; DOCX_REVIEW = a .docx file. Returns null when acceptable.
 * The zip-signature check of .docx bytes is the caller's (it needs the bytes).
 */
export function checkFeedbackSubmission(
  fields: FeedbackFields,
  file: FeedbackFileMeta | null,
): FeedbackSubmissionError | null {
  const hasText = typeof fields.text === 'string' && fields.text.length > 0;
  if (fields.kind === 'COMMENT') {
    if (file) return 'FEEDBACK_FILE_TYPE';
    return hasText ? null : 'FEEDBACK_TEXT_REQUIRED';
  }
  if (!file) {
    if (fields.kind === 'CORRECTED_PROTOCOL') return hasText ? null : 'FEEDBACK_TEXT_REQUIRED';
    return 'FEEDBACK_FILE_REQUIRED';
  }
  if (file.sizeBytes > FEEDBACK_FILE_MAX_BYTES) return 'FEEDBACK_FILE_TOO_LARGE';
  const dot = file.fileName.lastIndexOf('.');
  const ext = dot >= 0 ? file.fileName.slice(dot).toLowerCase() : '';
  const allowed = (FEEDBACK_FILE_TYPES[fields.kind] as Record<string, readonly string[]>)[ext];
  // `text/markdown; charset=utf-8` → `text/markdown`
  const mime = file.mime.split(';')[0]!.trim().toLowerCase();
  if (!allowed || !allowed.includes(mime)) return 'FEEDBACK_FILE_TYPE';
  return null;
}

/** D-12: a Word comment with the text it is anchored to. */
export const DocxComment = z.object({
  id: z.string(),
  author: z.string().nullable(),
  date: z.string().nullable(),
  text: z.string(),
  anchored_text: z.string(),
});
export type DocxComment = z.infer<typeof DocxComment>;

/** D-12: a tracked change (w:ins / w:del). */
export const DocxRevision = z.object({
  type: z.enum(['ins', 'del']),
  author: z.string().nullable(),
  date: z.string().nullable(),
  text: z.string(),
});
export type DocxRevision = z.infer<typeof DocxRevision>;

/**
 * ProtocolFeedback.extracted (JSONB).
 * DOCX_REVIEW: comments + revisions + accepted_text (all insertions kept, deletions dropped)
 *   + original_text (insertions dropped, deletions kept).
 * CORRECTED_PROTOCOL from .docx: plain_text only. .md/.txt: plain_text = file text.
 * Parse failure: the file is still stored and `error` is set.
 */
export const FeedbackExtract = z.object({
  comments: z.array(DocxComment).default([]),
  revisions: z.array(DocxRevision).default([]),
  accepted_text: z.string().nullable().default(null),
  original_text: z.string().nullable().default(null),
  plain_text: z.string().nullable().default(null),
  error: z.string().nullable().default(null),
});
export type FeedbackExtract = z.infer<typeof FeedbackExtract>;

export const FeedbackFile = z.object({
  name: z.string(),
  mime: z.string(),
  size_bytes: z.number().int().min(0),
  /** relative API path: /api/meetings/:id/feedback/:feedbackId/file */
  download_path: z.string(),
});
export type FeedbackFile = z.infer<typeof FeedbackFile>;

export const FeedbackItem = z.object({
  id: z.string().uuid(),
  meeting_id: z.string().uuid(),
  protocol_version_n: z.number().int().min(1),
  kind: FeedbackKind,
  category: FeedbackCategory.nullable(),
  text: z.string().nullable(),
  file: FeedbackFile.nullable(),
  /** counts for the list; null when nothing was extracted */
  extracted_counts: z
    .object({ comments: z.number().int().min(0), revisions: z.number().int().min(0), error: z.boolean() })
    .nullable(),
  author: AuthUser,
  created_at: z.string().datetime(),
});
export type FeedbackItem = z.infer<typeof FeedbackItem>;

export const FeedbackListResponse = z.object({
  /** newest first */
  items: z.array(FeedbackItem),
});
export type FeedbackListResponse = z.infer<typeof FeedbackListResponse>;

export const FeedbackCreateResponse = FeedbackItem.extend({
  extracted: FeedbackExtract.nullable(),
});
export type FeedbackCreateResponse = z.infer<typeof FeedbackCreateResponse>;
