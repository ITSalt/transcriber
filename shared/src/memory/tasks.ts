/**
 * Task state materialisation: (:Task) properties, ASSIGNED_TO and DUPLICATE_OF edges and
 * every event's supersededAt are rewritten from foldTaskEvents(). Runs inside the caller's
 * write transaction after any change to a task's events.
 */
import { foldTaskEvents, type StoredTaskEvent, type TaskState } from './fold.js';
import { MemoryNotFoundError } from './errors.js';
import type { ScopedTx } from './scope.js';
import { toNum, toStoredTaskEvent } from './values.js';

/** All events of one task (any review state), in no particular order. */
export async function readTaskEvents(tx: ScopedTx, code: string): Promise<StoredTaskEvent[]> {
  const res = await tx.run(
    `MATCH (t:Task {workspaceId: $workspaceId, projectId: $projectId, code: $code})
     OPTIONAL MATCH (e:TaskEvent {workspaceId: $workspaceId, projectId: $projectId})-[:OF_TASK]->(t)
     RETURN count(t) AS found, [x IN collect(properties(e)) WHERE x IS NOT NULL] AS events`,
    { code },
  );
  const row = res.records[0];
  if (!row || toNum(row.get('found')) === 0) throw new MemoryNotFoundError(`task ${code}`);
  return (row.get('events') as Record<string, unknown>[]).map(toStoredTaskEvent);
}

/** Recomputes and stores the task's state from its events. Returns the new state. */
export async function materializeTask(tx: ScopedTx, code: string, now: string): Promise<TaskState> {
  const events = await readTaskEvents(tx, code);
  const { state, supersededAt } = foldTaskEvents(events);
  await tx.run(
    `MATCH (t:Task {workspaceId: $workspaceId, projectId: $projectId, code: $code})
     SET t.title = $s.title, t.description = $s.description, t.status = $s.status,
         t.assigneeName = $s.assigneeName, t.assigneeParticipantId = $s.assigneeParticipantId,
         t.dueDate = $s.dueDate, t.mergedInto = $s.mergedInto, t.updatedAt = $now
     WITH t
     OPTIONAL MATCH (t)-[r:ASSIGNED_TO|DUPLICATE_OF]->()
     DELETE r
     WITH DISTINCT t
     OPTIONAL MATCH (p:Participant {workspaceId: $workspaceId, projectId: $projectId, id: $s.assigneeParticipantId})
     FOREACH (_ IN CASE WHEN p IS NULL THEN [] ELSE [1] END | MERGE (t)-[:ASSIGNED_TO]->(p))
     WITH t
     OPTIONAL MATCH (o:Task {workspaceId: $workspaceId, projectId: $projectId, code: $s.mergedInto})
     FOREACH (_ IN CASE WHEN o IS NULL OR o = t THEN [] ELSE [1] END | MERGE (t)-[:DUPLICATE_OF]->(o))
     WITH t
     UNWIND $superseded AS s
     MATCH (e:TaskEvent {workspaceId: $workspaceId, projectId: $projectId, id: s.id})
     SET e.supersededAt = s.at`,
    {
      code,
      now,
      s: state,
      superseded: [...supersededAt].map(([id, at]) => ({ id, at })),
    },
  );
  return state;
}
