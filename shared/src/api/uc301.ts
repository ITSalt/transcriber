import { z } from 'zod';

// UC-301 — Review and edit protocol

export const ProtocolResponse = z.object({
  id: z.string().uuid(),
  meeting_id: z.string().uuid(),
  markdown_content: z.string(),
  version: z.number().int().min(1),
  edit_count: z.number().int().min(0),
  generated_at: z.string().datetime(),
  last_edited_at: z.string().datetime().nullable(),
});
export type ProtocolResponse = z.infer<typeof ProtocolResponse>;

export const ProtocolSaveRequest = z.object({
  markdown_content: z.string().min(1), // canonical Markdown per BRQ-018
});
export type ProtocolSaveRequest = z.infer<typeof ProtocolSaveRequest>;

export const ProtocolSaveResponse = z.object({
  version: z.number().int().min(2), // initial = 1, first save = 2
  edit_count: z.number().int().min(1),
  last_edited_at: z.string().datetime(),
  meeting_status: z.literal('EDITED'),
});
export type ProtocolSaveResponse = z.infer<typeof ProtocolSaveResponse>;
