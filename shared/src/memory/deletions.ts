/**
 * FR-006 / UC-605 — deletions mirrored from Postgres (GraphOutbox). Idempotent: deleting
 * what is already gone is a no-op. One scoped write transaction per operation.
 */
import { writeScoped, type MemoryGraph, type MemoryScope } from './scope.js';
import { materializeTask } from './tasks.js';
import { toNum } from './values.js';

export interface MeetingDeletionResult {
  meetingFound: boolean;
  deletedTasks: number;
  deletedDecisions: number;
  deletedEvents: number;
  /** surviving tasks whose state was recomputed without this meeting's events */
  recomputedTasks: string[];
}

/**
 * Removes a meeting from the memory graph: the :Meeting projection and its mentions, its
 * TaskEvents, and the tasks / decisions that were created in it and mentioned nowhere
 * else. Surviving tasks keep their creation events (detached from the meeting, quote
 * cleared) and get their state re-folded without the meeting's updates. Summary versions
 * are kept (sourceMeetingId cleared) — the summary text is not rewritten. A tombstone
 * blocks a late memory update of the deleted meeting.
 */
export async function deleteMeetingFromGraph(
  graph: MemoryGraph,
  scope: MemoryScope,
  meetingId: string,
  now: string = new Date().toISOString(),
): Promise<MeetingDeletionResult> {
  return writeScoped(graph, scope, async (tx) => {
    const found = await tx.run(
      `OPTIONAL MATCH (m:Meeting {id: $meetingId, workspaceId: $workspaceId, projectId: $projectId})
       RETURN m IS NOT NULL AS found`,
      { meetingId },
    );
    const meetingFound = found.records[0]?.get('found') === true;

    // tasks created here and mentioned in no other meeting go with it (with all their events)
    const orphanTasks = await tx.run(
      `MATCH (t:Task {workspaceId: $workspaceId, projectId: $projectId, createdInMeetingId: $meetingId})
       WHERE NOT EXISTS {
         MATCH (t)-[:MENTIONED_IN]->(o:Meeting {workspaceId: $workspaceId, projectId: $projectId}) WHERE o.id <> $meetingId
       }
       OPTIONAL MATCH (e:TaskEvent {workspaceId: $workspaceId, projectId: $projectId})-[:OF_TASK]->(t)
       DETACH DELETE e
       WITH DISTINCT t
       DETACH DELETE t
       RETURN count(t) AS n`,
      { meetingId },
    );

    const orphanDecisions = await tx.run(
      `MATCH (d:Decision {workspaceId: $workspaceId, projectId: $projectId, createdInMeetingId: $meetingId})
       WHERE NOT EXISTS {
         MATCH (d)-[:MENTIONED_IN]->(o:Meeting {workspaceId: $workspaceId, projectId: $projectId}) WHERE o.id <> $meetingId
       }
       OPTIONAL MATCH (old:Decision {workspaceId: $workspaceId, projectId: $projectId, supersededBy: d.code})
       SET old.supersededBy = null
       WITH DISTINCT d
       DETACH DELETE d
       RETURN count(d) AS n`,
      { meetingId },
    );

    // surviving tasks with events from this meeting → re-fold after the events are gone
    const touched = await tx.run(
      `MATCH (e:TaskEvent {workspaceId: $workspaceId, projectId: $projectId, meetingId: $meetingId})
             -[:OF_TASK]->(t:Task {workspaceId: $workspaceId, projectId: $projectId})
       RETURN DISTINCT t.code AS code`,
      { meetingId },
    );
    // a surviving task keeps its creation events (title, initial status, …) — otherwise it
    // would re-fold to an empty task; they are only detached from the deleted meeting
    await tx.run(
      `MATCH (e:TaskEvent {workspaceId: $workspaceId, projectId: $projectId, meetingId: $meetingId, creation: true})
       SET e.meetingId = null, e.quote = null
       WITH e
       OPTIONAL MATCH (e)-[r:IN_MEETING]->()
       DELETE r`,
      { meetingId },
    );
    const events = await tx.run(
      `MATCH (e:TaskEvent {workspaceId: $workspaceId, projectId: $projectId, meetingId: $meetingId})
       DETACH DELETE e
       RETURN count(e) AS n`,
      { meetingId },
    );

    await tx.run(
      `MATCH (t:Task {workspaceId: $workspaceId, projectId: $projectId, createdInMeetingId: $meetingId})
       SET t.createdInMeetingId = null`,
      { meetingId },
    );
    await tx.run(
      `MATCH (d:Decision {workspaceId: $workspaceId, projectId: $projectId, createdInMeetingId: $meetingId})
       SET d.createdInMeetingId = null`,
      { meetingId },
    );
    await tx.run(
      `MATCH (pm:ProjectMemory {workspaceId: $workspaceId, projectId: $projectId, sourceMeetingId: $meetingId})
       SET pm.sourceMeetingId = null`,
      { meetingId },
    );
    await tx.run(
      `MATCH (m:Meeting {id: $meetingId, workspaceId: $workspaceId, projectId: $projectId})
       DETACH DELETE m`,
      { meetingId },
    );
    // a memory update of this meeting still in flight must not bring it back (writeMeetingUpdate checks)
    await tx.run(
      `MERGE (x:Tombstone {id: 'MEETING:' + $meetingId})
       ON CREATE SET x.kind = 'MEETING', x.targetId = $meetingId, x.workspaceId = $workspaceId,
                     x.projectId = $projectId, x.deletedAt = $now`,
      { meetingId, now },
    );

    const recomputedTasks = touched.records.map((r) => String(r.get('code')));
    for (const code of recomputedTasks) await materializeTask(tx, code, now);

    return {
      meetingFound,
      deletedTasks: toNum(orphanTasks.records[0]?.get('n')) ?? 0,
      deletedDecisions: toNum(orphanDecisions.records[0]?.get('n')) ?? 0,
      deletedEvents: toNum(events.records[0]?.get('n')) ?? 0,
      recomputedTasks,
    };
  });
}

/**
 * Removes every node of the project (any label but :Tombstone) from the memory graph and
 * leaves a project tombstone, so an update in flight cannot re-create the project.
 */
export async function deleteProjectFromGraph(
  graph: MemoryGraph,
  scope: MemoryScope,
  now: string = new Date().toISOString(),
): Promise<{ deletedNodes: number }> {
  return writeScoped(graph, scope, async (tx) => {
    const res = await tx.run(
      `MATCH (n) WHERE n.workspaceId = $workspaceId AND n.projectId = $projectId AND NOT n:Tombstone
       DETACH DELETE n
       RETURN count(n) AS n`,
    );
    await tx.run(
      `MERGE (x:Tombstone {id: 'PROJECT:' + $projectId})
       ON CREATE SET x.kind = 'PROJECT', x.targetId = $projectId, x.workspaceId = $workspaceId,
                     x.projectId = $projectId, x.deletedAt = $now`,
      { now },
    );
    return { deletedNodes: toNum(res.records[0]?.get('n')) ?? 0 };
  });
}
