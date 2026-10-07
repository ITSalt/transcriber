import { z } from 'zod';
import { MeetingListItem } from './uc001.js';

// FR-003 — workspaces and the meeting list of a workspace (contract v1; logic: WP-BACKEND-01).
//
//   GET /api/meetings?workspace_id=<uuid>   → 200 WorkspaceMeetingListResponse
//        workspace_id is required once WP-BACKEND-01 ships (400 WORKSPACE_REQUIRED);
//        not a member → 404 NOT_FOUND. Until then the route keeps today's unfiltered list.
//
// Every meeting-scoped route (detail, transcript, protocol, PDF, SSE, delete, retry, …)
// answers the same 404 NOT_FOUND for someone else's and for a nonexistent meeting.
// Upload init/complete/abort take `workspace_id` (see uc100.ts); new S3 keys are
// `ws/<workspaceId>/...`.

/** D-7: the legacy personal workspace that owns every pre-program meeting. */
export const LEGACY_WORKSPACE_ID = '00000000-0000-4000-8000-000000000001';
export const LEGACY_WORKSPACE_NAME = 'Роман';

export const WorkspaceSummary = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  /** D-6: true = the user's own workspace */
  personal: z.boolean(),
});
export type WorkspaceSummary = z.infer<typeof WorkspaceSummary>;

export const WorkspaceMeetingListQuery = z.object({
  workspace_id: z.string().uuid(),
  /** optional filter: meetings of one project */
  project_id: z.string().uuid().optional(),
});
export type WorkspaceMeetingListQuery = z.infer<typeof WorkspaceMeetingListQuery>;

/** MeetingListItem plus ownership; A-2: shown as «Задачи» in the UI. */
export const WorkspaceMeetingListItem = MeetingListItem.extend({
  workspace_id: z.string().uuid(),
  project_id: z.string().uuid().nullable(),
  project_name: z.string().nullable(),
});
export type WorkspaceMeetingListItem = z.infer<typeof WorkspaceMeetingListItem>;

export const WorkspaceMeetingListResponse = z.object({
  items: z.array(WorkspaceMeetingListItem),
});
export type WorkspaceMeetingListResponse = z.infer<typeof WorkspaceMeetingListResponse>;
