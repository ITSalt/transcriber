import { z } from 'zod';

// FR-006 — project memory: task & decision registry, review queue, summary (contract v1;
// API: WP-API-MEMORY-01, pipeline + Neo4j layer: WP-WORKER-MEMORY-01, ADR-013 / D-11, D-13, D-14).
// Storage is Neo4j (.tl/external-contracts/neo4j.md); every graph query is parameterised by
// workspaceId AND projectId. Neo4j down → 503 MEMORY_UNAVAILABLE, the rest of the app works.
//
//   GET   /api/projects/:projectId/tasks?status=&assignee=   → TaskListResponse
//   GET   /api/projects/:projectId/tasks/:code              → TaskDetailResponse (history)
//   PATCH /api/projects/:projectId/tasks/:code   TaskPatchRequest → TaskDetailResponse
//         manual edit, event source USER; invalid transition → 400 TASK_STATUS_TRANSITION
//   GET   /api/projects/:projectId/decisions                → DecisionListResponse
//   GET   /api/projects/:projectId/memory                   → ProjectMemoryResponse
//   GET   /api/projects/:projectId/review-queue             → ReviewQueueResponse
//   POST  /api/task-events/:eventId/confirm                 → ReviewDecisionResponse
//   POST  /api/task-events/:eventId/reject                  → ReviewDecisionResponse
//         repeat → 409 TASK_EVENT_ALREADY_REVIEWED; the event is looked up by id AND
//         workspaceId ∈ the caller's workspaces (TaskEvent carries workspaceId, projectId).
//   GET   /api/meetings/:id/memory-refs                     → MeetingMemoryRefsResponse
//         T-n / D-n mentioned in this meeting (links from the protocol page)

/** Graph task status (Task.status). */
export const MemoryTaskStatus = z.enum(['OPEN', 'IN_PROGRESS', 'DONE', 'CANCELLED', 'POSTPONED']);
export type MemoryTaskStatus = z.infer<typeof MemoryTaskStatus>;

/**
 * Allowed manual/LLM status transitions. Same-status is not a transition.
 * DONE / CANCELLED can be reopened (→ OPEN) only — closing mistakes happen.
 */
export const TASK_STATUS_TRANSITIONS: Record<MemoryTaskStatus, readonly MemoryTaskStatus[]> = {
  OPEN: ['IN_PROGRESS', 'DONE', 'CANCELLED', 'POSTPONED'],
  IN_PROGRESS: ['OPEN', 'DONE', 'CANCELLED', 'POSTPONED'],
  POSTPONED: ['OPEN', 'IN_PROGRESS', 'DONE', 'CANCELLED'],
  DONE: ['OPEN'],
  CANCELLED: ['OPEN'],
};

export function canTransitionTaskStatus(from: MemoryTaskStatus, to: MemoryTaskStatus): boolean {
  return TASK_STATUS_TRANSITIONS[from].includes(to);
}

/** `T-42` / `D-7` — per-project sequential codes. */
export const TaskCode = z.string().regex(/^T-[1-9]\d*$/);
export const DecisionCode = z.string().regex(/^D-[1-9]\d*$/);

/** Kind of a (:Task)-[:MENTIONED_IN]->(:Meeting) edge. */
export const TaskMentionKind = z.enum(['CREATED', 'STATUS_UPDATE', 'REASSIGNED', 'DUE_CHANGED', 'MENTIONED']);
export type TaskMentionKind = z.infer<typeof TaskMentionKind>;

/** Field a TaskEvent changes. */
export const TaskEventField = z.enum(['title', 'description', 'status', 'assignee', 'due_date', 'merged_into']);
export type TaskEventField = z.infer<typeof TaskEventField>;

export const TaskEventSource = z.enum(['LLM', 'USER']);
export type TaskEventSource = z.infer<typeof TaskEventSource>;

/** D-14: AUTO = applied automatically; PENDING = waits in the review queue. */
export const TaskEventReviewState = z.enum(['AUTO', 'PENDING', 'CONFIRMED', 'REJECTED']);
export type TaskEventReviewState = z.infer<typeof TaskEventReviewState>;

export const MemoryAssignee = z.object({
  /** ProjectParticipant id when resolved, else null (free-text name from the meeting) */
  participant_id: z.string().uuid().nullable(),
  name: z.string(),
});
export type MemoryAssignee = z.infer<typeof MemoryAssignee>;

/** ISO date (YYYY-MM-DD). */
export const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const MemoryTask = z.object({
  id: z.string().uuid(),
  code: TaskCode,
  title: z.string(),
  description: z.string().nullable(),
  status: MemoryTaskStatus,
  assignee: MemoryAssignee.nullable(),
  due_date: IsoDate.nullable(),
  /** code of the task this one was merged into (DUPLICATE_OF) */
  merged_into: TaskCode.nullable(),
  created_in_meeting_id: z.string().uuid().nullable(),
  /** PENDING events of this task */
  pending_count: z.number().int().min(0),
  updated_at: z.string().datetime(),
});
export type MemoryTask = z.infer<typeof MemoryTask>;

export const TaskMention = z.object({
  meeting_id: z.string().uuid(),
  meeting_title: z.string(),
  kind: TaskMentionKind,
  /** verbatim quote from the transcript */
  quote: z.string(),
  start_ms: z.number().int().min(0).nullable(),
  end_ms: z.number().int().min(0).nullable(),
  speaker_label: z.string().nullable(),
});
export type TaskMention = z.infer<typeof TaskMention>;

/** A bitemporal change of one task field. */
export const TaskEvent = z.object({
  id: z.string().uuid(),
  task_code: TaskCode,
  field: TaskEventField,
  old_value: z.string().nullable(),
  new_value: z.string().nullable(),
  /** when it became true in the world (the meeting time) */
  valid_at: z.string().datetime(),
  recorded_at: z.string().datetime(),
  superseded_at: z.string().datetime().nullable(),
  source: TaskEventSource,
  /** 0..1, LLM events only */
  confidence: z.number().min(0).max(1).nullable(),
  reason: z.string().nullable(),
  review_state: TaskEventReviewState,
  meeting_id: z.string().uuid().nullable(),
  quote: z.string().nullable(),
  /** USER events: who */
  author_user_id: z.string().uuid().nullable(),
});
export type TaskEvent = z.infer<typeof TaskEvent>;

export const TaskListQuery = z.object({
  status: MemoryTaskStatus.optional(),
  /** participant id or a name (case-insensitive match) */
  assignee: z.string().min(1).optional(),
});
export type TaskListQuery = z.infer<typeof TaskListQuery>;

export const TaskListResponse = z.object({
  items: z.array(MemoryTask),
});
export type TaskListResponse = z.infer<typeof TaskListResponse>;

export const TaskDetailResponse = z.object({
  task: MemoryTask,
  mentions: z.array(TaskMention),
  /** chronological */
  events: z.array(TaskEvent),
});
export type TaskDetailResponse = z.infer<typeof TaskDetailResponse>;

export const TaskPatchRequest = z
  .object({
    status: MemoryTaskStatus,
    /** participant id, or null to unassign */
    assignee_participant_id: z.string().uuid().nullable(),
    due_date: IsoDate.nullable(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'nothing to update' });
export type TaskPatchRequest = z.infer<typeof TaskPatchRequest>;

export const MemoryDecision = z.object({
  id: z.string().uuid(),
  code: DecisionCode,
  text: z.string(),
  superseded_by: DecisionCode.nullable(),
  meeting_id: z.string().uuid().nullable(),
  quote: z.string().nullable(),
  /** (:Decision)-[:LEADS_TO]->(:Task) */
  leads_to: z.array(TaskCode),
  created_at: z.string().datetime(),
});
export type MemoryDecision = z.infer<typeof MemoryDecision>;

export const DecisionListResponse = z.object({
  items: z.array(MemoryDecision),
});
export type DecisionListResponse = z.infer<typeof DecisionListResponse>;

export const ProjectMemoryVersion = z.object({
  version: z.number().int().min(1),
  source_meeting_id: z.string().uuid().nullable(),
  created_at: z.string().datetime(),
});
export type ProjectMemoryVersion = z.infer<typeof ProjectMemoryVersion>;

export const ProjectMemoryResponse = z.object({
  current: ProjectMemoryVersion.extend({ summary_md: z.string() }).nullable(),
  /** newest first */
  versions: z.array(ProjectMemoryVersion),
});
export type ProjectMemoryResponse = z.infer<typeof ProjectMemoryResponse>;

export const ReviewQueueItem = z.object({
  event: TaskEvent,
  task: MemoryTask.pick({ id: true, code: true, title: true, status: true }),
  meeting_title: z.string().nullable(),
});
export type ReviewQueueItem = z.infer<typeof ReviewQueueItem>;

export const ReviewQueueResponse = z.object({
  /** oldest first */
  items: z.array(ReviewQueueItem),
  /** header counter */
  count: z.number().int().min(0),
});
export type ReviewQueueResponse = z.infer<typeof ReviewQueueResponse>;

export const ReviewDecisionResponse = z.object({
  event: TaskEvent,
  task: MemoryTask,
});
export type ReviewDecisionResponse = z.infer<typeof ReviewDecisionResponse>;

export const MeetingMemoryRefsResponse = z.object({
  project_id: z.string().uuid().nullable(),
  tasks: z.array(MemoryTask.pick({ code: true, title: true, status: true })),
  decisions: z.array(MemoryDecision.pick({ code: true, text: true })),
});
export type MeetingMemoryRefsResponse = z.infer<typeof MeetingMemoryRefsResponse>;

// ─── GraphOutbox (Postgres → Neo4j) ───────────────────────────────────────────

/** GraphOutbox.op + payload. Inserted in the same Postgres transaction as the change. */
export const GraphOutboxEntry = z.discriminatedUnion('op', [
  z.object({
    op: z.literal('DELETE_MEETING'),
    payload: z.object({
      meeting_id: z.string().uuid(),
      project_id: z.string().uuid(),
      workspace_id: z.string().uuid(),
    }),
  }),
  z.object({
    op: z.literal('DELETE_PROJECT'),
    payload: z.object({
      project_id: z.string().uuid(),
      workspace_id: z.string().uuid(),
    }),
  }),
]);
export type GraphOutboxEntry = z.infer<typeof GraphOutboxEntry>;
export type GraphOutboxOp = GraphOutboxEntry['op'];

// ─── Worker queue ─────────────────────────────────────────────────────────────

/** BullMQ queue owned by worker/src/memory (declared by the module itself). */
export const PROJECT_MEMORY_QUEUE = 'project-memory';

export const ProjectMemoryJobPayload = z.object({
  meeting_id: z.string().uuid(),
  project_id: z.string().uuid(),
  workspace_id: z.string().uuid(),
});
export type ProjectMemoryJobPayload = z.infer<typeof ProjectMemoryJobPayload>;
