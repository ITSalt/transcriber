/**
 * FR-006 / UC-602, UC-603 — human decisions on the registry (used by WP-API-MEMORY-01).
 *
 *  - confirmTaskEvent: PENDING → CONFIRMED, the change is applied (fold), history kept.
 *  - rejectTaskEvent:  PENDING → REJECTED, the task is unchanged, history kept.
 *  - patchTask:        manual edit → one USER event per changed field, applied at once.
 *
 * Status changes are checked with canTransitionTaskStatus — the same function the worker
 * gate uses (RQ-057). Every call is one scoped write transaction.
 */
import {
  canTransitionTaskStatus,
  type MemoryTaskStatus,
  type ReviewDecisionResponse,
  type TaskDetailResponse,
  type TaskEventField,
} from '../api/memory.js';
import { MemoryInvalidEventError, MemoryNotFoundError, TaskEventAlreadyReviewedError, TaskStatusTransitionError } from './errors.js';
import { getTaskDetailTx } from './reads.js';
import { writeScoped, type MemoryGraph, type MemoryScope, type ScopedTx } from './scope.js';
import { materializeTask, readTaskEvents } from './tasks.js';
import { foldTaskEvents } from './fold.js';
import { toStoredTaskEvent } from './values.js';

/** Node 20 global WebCrypto (shared has no @types/node). */
const randomUUID = (): string => (globalThis as unknown as { crypto: { randomUUID(): string } }).crypto.randomUUID();

export interface ReviewActor {
  userId: string;
  /** ISO time of the decision (default: now) */
  now?: string;
}

async function loadEvent(tx: ScopedTx, eventId: string) {
  const res = await tx.run(
    `MATCH (e:TaskEvent {id: $eventId, workspaceId: $workspaceId, projectId: $projectId})
           -[:OF_TASK]->(t:Task {workspaceId: $workspaceId, projectId: $projectId})
     RETURN properties(e) AS e, t.code AS code`,
    { eventId },
  );
  const r = res.records[0];
  if (!r) throw new MemoryNotFoundError(`task event ${eventId}`);
  return { event: toStoredTaskEvent(r.get('e') as Record<string, unknown>), code: String(r.get('code')) };
}

async function review(
  graph: MemoryGraph,
  scope: MemoryScope,
  eventId: string,
  actor: ReviewActor,
  decision: 'CONFIRMED' | 'REJECTED',
): Promise<ReviewDecisionResponse> {
  const now = actor.now ?? new Date().toISOString();
  return writeScoped(graph, scope, async (tx) => {
    const { event, code } = await loadEvent(tx, eventId);
    if (event.reviewState !== 'PENDING') throw new TaskEventAlreadyReviewedError(eventId, event.reviewState);

    if (decision === 'CONFIRMED') {
      const current = foldTaskEvents(await readTaskEvents(tx, code)).state;
      if (event.field === 'status' && event.newValue !== current.status) {
        const to = event.newValue as MemoryTaskStatus;
        if (!canTransitionTaskStatus(current.status, to)) throw new TaskStatusTransitionError(current.status, to);
      }
      if (event.field === 'merged_into' && event.newValue) {
        const target = await tx.run(
          `MATCH (o:Task {workspaceId: $workspaceId, projectId: $projectId, code: $target}) RETURN o.code AS code`,
          { target: event.newValue },
        );
        if (target.records.length === 0 || event.newValue === code) {
          throw new MemoryInvalidEventError(`cannot merge ${code} into ${event.newValue}`);
        }
      }
    }

    await tx.run(
      `MATCH (e:TaskEvent {id: $eventId, workspaceId: $workspaceId, projectId: $projectId})
       SET e.reviewState = $decision, e.reviewedAt = $now, e.reviewedBy = $userId,
           e.appliedAt = CASE WHEN $decision = 'CONFIRMED' THEN $now ELSE null END,
           e.ordinal = toInteger(0)`,
      { eventId, decision, now, userId: actor.userId },
    );
    if (decision === 'CONFIRMED') await materializeTask(tx, code, now);

    const detail = (await getTaskDetailTx(tx, code))!;
    return { event: detail.events.find((e) => e.id === eventId)!, task: detail.task };
  });
}

export function confirmTaskEvent(graph: MemoryGraph, scope: MemoryScope, eventId: string, actor: ReviewActor) {
  return review(graph, scope, eventId, actor, 'CONFIRMED');
}

export function rejectTaskEvent(graph: MemoryGraph, scope: MemoryScope, eventId: string, actor: ReviewActor) {
  return review(graph, scope, eventId, actor, 'REJECTED');
}

/** Manual edit. The API resolves assignee_participant_id to {participantId, name} in Postgres. */
export interface TaskPatch {
  status?: MemoryTaskStatus;
  /** null = unassign */
  assignee?: { participantId: string; name: string } | null;
  /** YYYY-MM-DD or null */
  dueDate?: string | null;
}

export async function patchTask(
  graph: MemoryGraph,
  scope: MemoryScope,
  code: string,
  patch: TaskPatch,
  actor: ReviewActor,
): Promise<TaskDetailResponse> {
  const now = actor.now ?? new Date().toISOString();
  return writeScoped(graph, scope, async (tx) => {
    const current = foldTaskEvents(await readTaskEvents(tx, code)).state;
    const events: Array<{
      id: string;
      field: TaskEventField;
      oldValue: string | null;
      newValue: string | null;
      oldParticipantId: string | null;
      newParticipantId: string | null;
    }> = [];

    if (patch.status !== undefined && patch.status !== current.status) {
      if (!canTransitionTaskStatus(current.status, patch.status)) throw new TaskStatusTransitionError(current.status, patch.status);
      events.push({ id: randomUUID(), field: 'status', oldValue: current.status, newValue: patch.status, oldParticipantId: null, newParticipantId: null });
    }
    if (patch.assignee !== undefined) {
      const next = patch.assignee;
      if ((next?.participantId ?? null) !== current.assigneeParticipantId || (next?.name ?? null) !== current.assigneeName) {
        if (next) {
          // the participant projection may not exist yet (never mentioned by a meeting)
          const res = await tx.run(
            `MERGE (p:Participant {id: $id})
             ON CREATE SET p.workspaceId = $workspaceId, p.projectId = $projectId
             WITH p, p.workspaceId = $workspaceId AND p.projectId = $projectId AS own
             FOREACH (_ IN CASE WHEN own THEN [1] ELSE [] END | SET p.name = $name)
             RETURN own`,
            { id: next.participantId, name: next.name },
          );
          if (res.records[0]?.get('own') !== true) throw new MemoryNotFoundError(`participant ${next.participantId}`);
        }
        events.push({
          id: randomUUID(),
          field: 'assignee',
          oldValue: current.assigneeName,
          newValue: next?.name ?? null,
          oldParticipantId: current.assigneeParticipantId,
          newParticipantId: next?.participantId ?? null,
        });
      }
    }
    if (patch.dueDate !== undefined && patch.dueDate !== current.dueDate) {
      events.push({ id: randomUUID(), field: 'due_date', oldValue: current.dueDate, newValue: patch.dueDate, oldParticipantId: null, newParticipantId: null });
    }

    if (events.length > 0) {
      await tx.run(
        `MATCH (t:Task {workspaceId: $workspaceId, projectId: $projectId, code: $code})
         UNWIND range(0, size($events) - 1) AS i
         WITH t, i, $events[i] AS ev
         CREATE (e:TaskEvent {id: ev.id, workspaceId: $workspaceId, projectId: $projectId, field: ev.field,
                              oldValue: ev.oldValue, newValue: ev.newValue,
                              oldParticipantId: ev.oldParticipantId, newParticipantId: ev.newParticipantId,
                              validAt: $now, recordedAt: $now, appliedAt: $now, ordinal: toInteger(i),
                              source: 'USER', confidence: null, reason: null, reviewState: 'CONFIRMED',
                              quote: null, authorUserId: $userId, meetingId: null})
         CREATE (e)-[:OF_TASK]->(t)`,
        { code, now, userId: actor.userId, events },
      );
      await materializeTask(tx, code, now);
    }
    return (await getTaskDetailTx(tx, code))!;
  });
}
