/**
 * FR-006 / RQ-054 — the current state of a task is the fold of its APPLIED events.
 *
 * Applied = reviewState AUTO (the gate let it through) or CONFIRMED (a person confirmed a
 * PENDING event, or a USER edit). PENDING and REJECTED events never change the task.
 * Events apply in the order they took effect (appliedAt, then their ordinal inside one
 * write), so a closure confirmed today wins over an older automatic update. The worker
 * (meeting update, deletions) and the API (confirm, reject, manual edit) share this one
 * function, so the task's stored properties never drift from its history.
 */
import type { MemoryTaskStatus, TaskEventField, TaskEventReviewState, TaskEventSource } from '../api/memory.js';

/** A TaskEvent as stored in the graph (camelCase properties). */
export interface StoredTaskEvent {
  id: string;
  field: TaskEventField;
  oldValue: string | null;
  newValue: string | null;
  /** assignee events: ProjectParticipant id of the old / new assignee when resolved */
  oldParticipantId: string | null;
  newParticipantId: string | null;
  /** when it became true in the world (the meeting time; USER edits: the edit time) */
  validAt: string;
  recordedAt: string;
  /** when it was applied to the task (AUTO: recordedAt; CONFIRMED: the review time) */
  appliedAt: string | null;
  /** position inside the write that created / applied it — orders events with one appliedAt */
  ordinal: number;
  supersededAt: string | null;
  source: TaskEventSource;
  confidence: number | null;
  reason: string | null;
  reviewState: TaskEventReviewState;
  quote: string | null;
  authorUserId: string | null;
  meetingId: string | null;
}

export interface TaskState {
  title: string;
  description: string | null;
  status: MemoryTaskStatus;
  assigneeName: string | null;
  assigneeParticipantId: string | null;
  dueDate: string | null;
  mergedInto: string | null;
}

export const EMPTY_TASK_STATE: TaskState = {
  title: '',
  description: null,
  status: 'OPEN',
  assigneeName: null,
  assigneeParticipantId: null,
  dueDate: null,
  mergedInto: null,
};

export function isAppliedEvent(e: Pick<StoredTaskEvent, 'reviewState'>): boolean {
  return e.reviewState === 'AUTO' || e.reviewState === 'CONFIRMED';
}

function byApplication(a: StoredTaskEvent, b: StoredTaskEvent): number {
  const ta = a.appliedAt ?? a.recordedAt;
  const tb = b.appliedAt ?? b.recordedAt;
  if (ta !== tb) return ta < tb ? -1 : 1;
  return a.ordinal - b.ordinal;
}

export interface FoldResult {
  state: TaskState;
  /** supersededAt every event must carry: an applied event is superseded by the next applied event of the same field */
  supersededAt: Map<string, string | null>;
}

export function foldTaskEvents(events: readonly StoredTaskEvent[]): FoldResult {
  const state: TaskState = { ...EMPTY_TASK_STATE };
  const supersededAt = new Map<string, string | null>();
  const lastByField = new Map<TaskEventField, StoredTaskEvent>();

  for (const e of events) supersededAt.set(e.id, null);

  for (const e of events.filter(isAppliedEvent).sort(byApplication)) {
    const previous = lastByField.get(e.field);
    if (previous) supersededAt.set(previous.id, e.appliedAt ?? e.recordedAt);
    lastByField.set(e.field, e);
    switch (e.field) {
      case 'title':
        state.title = e.newValue ?? '';
        break;
      case 'description':
        state.description = e.newValue;
        break;
      case 'status':
        state.status = (e.newValue as MemoryTaskStatus | null) ?? 'OPEN';
        break;
      case 'assignee':
        state.assigneeName = e.newValue;
        state.assigneeParticipantId = e.newValue === null ? null : e.newParticipantId;
        break;
      case 'due_date':
        state.dueDate = e.newValue;
        break;
      case 'merged_into':
        state.mergedInto = e.newValue;
        break;
    }
  }
  return { state, supersededAt };
}

/** Task statuses that count as "open" for the registry, candidates and the prompt. */
export const OPEN_TASK_STATUSES: readonly MemoryTaskStatus[] = ['OPEN', 'IN_PROGRESS', 'POSTPONED'];
