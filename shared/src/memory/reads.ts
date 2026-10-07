/**
 * FR-006 — read queries of the memory registry (API: WP-API-MEMORY-01; worker: prompt
 * memory, candidates). Every query runs through readScoped → filtered by workspaceId AND
 * projectId; a foreign workspaceId simply matches nothing.
 */
import type {
  DecisionListResponse,
  MeetingMemoryRefsResponse,
  MemoryDecision,
  MemoryTask,
  MemoryTaskStatus,
  ProjectMemoryResponse,
  ReviewQueueResponse,
  TaskDetailResponse,
  TaskListQuery,
} from '../api/memory.js';
import { OPEN_TASK_STATUSES } from './fold.js';
import { byCodeNumber, toMemoryDecision, toMemoryTask, toTaskEvent, toTaskMention } from './mappers.js';
import { readScoped, MemoryScopeError, type MemoryGraph, type MemoryScope, type ScopedTx } from './scope.js';
import { toNum, toStr } from './values.js';

type Props = Record<string, unknown>;

const TASK_RETURN = `properties(t) AS t,
  COUNT { (pe:TaskEvent {workspaceId: $workspaceId, projectId: $projectId, reviewState: 'PENDING'})-[:OF_TASK]->(t) } AS pending`;

/** Registry list, ordered by code. `assignee` = participant id or a name (case-insensitive). */
export async function listTasks(graph: MemoryGraph, scope: MemoryScope, query: TaskListQuery = {}): Promise<MemoryTask[]> {
  return readScoped(graph, scope, (tx) => listTasksTx(tx, query));
}

export async function listTasksTx(tx: ScopedTx, query: TaskListQuery & { statuses?: readonly MemoryTaskStatus[] } = {}): Promise<MemoryTask[]> {
  const res = await tx.run(
    `MATCH (t:Task {workspaceId: $workspaceId, projectId: $projectId})
     WHERE ($status IS NULL OR t.status = $status)
       AND ($statuses IS NULL OR t.status IN $statuses)
       AND ($assignee IS NULL OR t.assigneeParticipantId = $assignee OR toLower(t.assigneeName) = toLower($assignee))
     RETURN ${TASK_RETURN}
     ORDER BY t.seq`,
    { status: query.status ?? null, statuses: query.statuses ?? null, assignee: query.assignee ?? null },
  );
  return res.records.map((r) => toMemoryTask(r.get('t') as Props, r.get('pending')));
}

/** Open tasks (OPEN / IN_PROGRESS / POSTPONED) that were not merged into another task. */
export async function listOpenTasks(graph: MemoryGraph, scope: MemoryScope): Promise<MemoryTask[]> {
  const tasks = await readScoped(graph, scope, (tx) => listTasksTx(tx, { statuses: OPEN_TASK_STATUSES }));
  return tasks.filter((t) => t.merged_into === null);
}

/** One task with its mentions (meeting order) and full event history (chronological). */
export async function getTaskDetail(graph: MemoryGraph, scope: MemoryScope, code: string): Promise<TaskDetailResponse | null> {
  return readScoped(graph, scope, (tx) => getTaskDetailTx(tx, code));
}

export async function getTaskDetailTx(tx: ScopedTx, code: string): Promise<TaskDetailResponse | null> {
  const res = await tx.run(
    `MATCH (t:Task {workspaceId: $workspaceId, projectId: $projectId, code: $code})
     CALL (t) {
       OPTIONAL MATCH (t)-[r:MENTIONED_IN]->(m:Meeting {workspaceId: $workspaceId, projectId: $projectId})
       WITH r, m ORDER BY m.seq, r.startMs
       RETURN [x IN collect(CASE WHEN r IS NULL THEN NULL ELSE {r: properties(r), m: properties(m)} END) WHERE x IS NOT NULL] AS mentions
     }
     CALL (t) {
       OPTIONAL MATCH (e:TaskEvent {workspaceId: $workspaceId, projectId: $projectId})-[:OF_TASK]->(t)
       WITH e ORDER BY e.validAt, e.recordedAt, e.ordinal
       RETURN [x IN collect(properties(e)) WHERE x IS NOT NULL] AS events
     }
     RETURN ${TASK_RETURN}, mentions, events`,
    { code },
  );
  const r = res.records[0];
  if (!r) return null;
  return {
    task: toMemoryTask(r.get('t') as Props, r.get('pending')),
    mentions: (r.get('mentions') as Array<{ r: Props; m: Props }>).map((x) => toTaskMention(x.r, x.m)),
    events: (r.get('events') as Props[]).map((e) => toTaskEvent(e, code)),
  };
}

const DECISION_RETURN = `properties(d) AS d,
  [(d)-[:LEADS_TO]->(lt:Task {workspaceId: $workspaceId, projectId: $projectId}) | lt.code] AS leadsTo,
  head([(d)-[mr:MENTIONED_IN]->(mm:Meeting {workspaceId: $workspaceId, projectId: $projectId})
        WHERE mm.id = d.createdInMeetingId | {meetingId: mm.id, quote: mr.quote}]) AS mention`;

/** Decisions, newest first. */
export async function listDecisions(graph: MemoryGraph, scope: MemoryScope, limit?: number): Promise<DecisionListResponse['items']> {
  return readScoped(graph, scope, async (tx) => {
    const res = await tx.run(
      `MATCH (d:Decision {workspaceId: $workspaceId, projectId: $projectId})
       RETURN ${DECISION_RETURN}
       ORDER BY d.seq DESC
       LIMIT toInteger($limit)`,
      { limit: limit ?? 10_000 },
    );
    return res.records.map(toDecision);
  });
}

function toDecision(r: { get(key: string): unknown }): MemoryDecision {
  const mention = r.get('mention') as { meetingId: unknown; quote: unknown } | null;
  return toMemoryDecision(r.get('d') as Props, mention, r.get('leadsTo') as unknown[]);
}

/** Current summary + all versions (newest first). */
export async function getProjectMemory(graph: MemoryGraph, scope: MemoryScope): Promise<ProjectMemoryResponse> {
  return readScoped(graph, scope, async (tx) => {
    const res = await tx.run(
      `MATCH (pm:ProjectMemory {workspaceId: $workspaceId, projectId: $projectId})
       RETURN properties(pm) AS pm ORDER BY pm.version DESC`,
    );
    const versions = res.records.map((r) => r.get('pm') as Props);
    const toVersion = (p: Props) => ({
      version: toNum(p['version']) ?? 0,
      source_meeting_id: toStr(p['sourceMeetingId']),
      created_at: String(p['createdAt']),
    });
    const latest = versions[0];
    return {
      current: latest ? { ...toVersion(latest), summary_md: toStr(latest['summaryMd']) ?? '' } : null,
      versions: versions.map(toVersion),
    };
  });
}

/** PENDING events of the project, oldest first. */
export async function getReviewQueue(graph: MemoryGraph, scope: MemoryScope): Promise<ReviewQueueResponse> {
  return readScoped(graph, scope, async (tx) => {
    const res = await tx.run(
      `MATCH (e:TaskEvent {workspaceId: $workspaceId, projectId: $projectId, reviewState: 'PENDING'})
             -[:OF_TASK]->(t:Task {workspaceId: $workspaceId, projectId: $projectId})
       OPTIONAL MATCH (e)-[:IN_MEETING]->(m:Meeting {workspaceId: $workspaceId, projectId: $projectId})
       RETURN properties(e) AS e, t.id AS id, t.code AS code, t.title AS title, t.status AS status, m.title AS meetingTitle
       ORDER BY e.recordedAt, e.ordinal`,
    );
    const items = res.records.map((r) => ({
      event: toTaskEvent(r.get('e') as Props, String(r.get('code'))),
      task: {
        id: String(r.get('id')),
        code: String(r.get('code')),
        title: toStr(r.get('title')) ?? '',
        status: String(r.get('status')) as MemoryTaskStatus,
      },
      meeting_title: toStr(r.get('meetingTitle')),
    }));
    return { items, count: items.length };
  });
}

/** T-n / D-n mentioned in one meeting of the project (links from the protocol page). */
export async function getMeetingMemoryRefs(
  graph: MemoryGraph,
  scope: MemoryScope,
  meetingId: string,
): Promise<MeetingMemoryRefsResponse> {
  return readScoped(graph, scope, async (tx) => {
    const res = await tx.run(
      `OPTIONAL MATCH (m:Meeting {id: $meetingId, workspaceId: $workspaceId, projectId: $projectId})
       RETURN
         [(t:Task {workspaceId: $workspaceId, projectId: $projectId})-[:MENTIONED_IN]->(m) | {code: t.code, title: t.title, status: t.status}] AS tasks,
         [(d:Decision {workspaceId: $workspaceId, projectId: $projectId})-[:MENTIONED_IN]->(m) | {code: d.code, text: d.text}] AS decisions`,
      { meetingId },
    );
    const r = res.records[0];
    const uniq = (xs: Props[]): Props[] => [...new Map(xs.map((x) => [String(x['code']), x])).values()];
    const tasks = uniq((r?.get('tasks') as Props[] | null) ?? []).map((t) => ({
      code: String(t['code']),
      title: toStr(t['title']) ?? '',
      status: String(t['status']) as MemoryTaskStatus,
    }));
    const decisions = uniq((r?.get('decisions') as Props[] | null) ?? []).map((d) => ({
      code: String(d['code']),
      text: toStr(d['text']) ?? '',
    }));
    return {
      project_id: scope.projectId,
      tasks: tasks.sort((a, b) => byCodeNumber(a.code, b.code)),
      decisions: decisions.sort((a, b) => byCodeNumber(a.code, b.code)),
    };
  });
}

/**
 * The only lookup not keyed by a project: an event by id (POST /api/task-events/:id/…),
 * restricted to the caller's workspaces (RQ-055). Returns the scope to use for everything
 * after it, or null when the event does not exist in those workspaces.
 */
export async function findTaskEventScope(
  graph: MemoryGraph,
  eventId: string,
  callerWorkspaceIds: readonly string[],
): Promise<MemoryScope | null> {
  if (!Array.isArray(callerWorkspaceIds) || callerWorkspaceIds.length === 0) {
    throw new MemoryScopeError('task event lookup without caller workspaces');
  }
  const session = graph.driver.session({ database: graph.database, defaultAccessMode: 'READ' });
  try {
    const res = await session.executeRead((tx) =>
      tx.run(
        `MATCH (e:TaskEvent {id: $eventId}) WHERE e.workspaceId IN $workspaceIds
         RETURN e.workspaceId AS workspaceId, e.projectId AS projectId`,
        { eventId, workspaceIds: [...callerWorkspaceIds] },
      ),
    );
    const r = res.records[0];
    return r ? { workspaceId: String(r.get('workspaceId')), projectId: String(r.get('projectId')) } : null;
  } finally {
    await session.close();
  }
}

// ─── Prompt memory (worker: ProjectMemoryProvider) ─────────────────────────────

export interface PromptMemoryData {
  summaryMd: string | null;
  /** open tasks with the meeting number their current status dates from */
  openTasks: Array<MemoryTask & { status_since_meeting_seq: number | null }>;
  /** newest first */
  recentDecisions: Array<MemoryDecision & { meeting_seq: number | null }>;
}

export async function getPromptMemoryData(
  graph: MemoryGraph,
  scope: MemoryScope,
  opts: { decisionLimit?: number } = {},
): Promise<PromptMemoryData> {
  return readScoped(graph, scope, async (tx) => {
    const summary = await tx.run(
      `MATCH (pm:ProjectMemory {workspaceId: $workspaceId, projectId: $projectId})
       RETURN pm.summaryMd AS summaryMd ORDER BY pm.version DESC LIMIT 1`,
    );
    const tasks = await tx.run(
      `MATCH (t:Task {workspaceId: $workspaceId, projectId: $projectId})
       WHERE t.status IN $open AND t.mergedInto IS NULL
       OPTIONAL MATCH (se:TaskEvent {workspaceId: $workspaceId, projectId: $projectId, field: 'status'})-[:OF_TASK]->(t)
       WHERE se.reviewState IN ['AUTO', 'CONFIRMED'] AND se.newValue = t.status
       WITH t, se ORDER BY se.appliedAt DESC, se.ordinal DESC
       WITH t, head(collect(se.meetingId)) AS sinceMeetingId
       OPTIONAL MATCH (sm:Meeting {workspaceId: $workspaceId, projectId: $projectId})
       WHERE sm.id = coalesce(sinceMeetingId, t.createdInMeetingId)
       RETURN ${TASK_RETURN}, sm.seq AS sinceSeq
       ORDER BY t.seq`,
      { open: [...OPEN_TASK_STATUSES] },
    );
    const decisions = await tx.run(
      `MATCH (d:Decision {workspaceId: $workspaceId, projectId: $projectId})
       WHERE d.supersededBy IS NULL
       OPTIONAL MATCH (dm:Meeting {workspaceId: $workspaceId, projectId: $projectId}) WHERE dm.id = d.createdInMeetingId
       RETURN ${DECISION_RETURN}, dm.seq AS meetingSeq
       ORDER BY d.seq DESC LIMIT toInteger($limit)`,
      { limit: opts.decisionLimit ?? 20 },
    );
    return {
      summaryMd: toStr(summary.records[0]?.get('summaryMd')),
      openTasks: tasks.records.map((r) => ({
        ...toMemoryTask(r.get('t') as Props, r.get('pending')),
        status_since_meeting_seq: toNum(r.get('sinceSeq')),
      })),
      recentDecisions: decisions.records.map((r) => ({ ...toDecision(r), meeting_seq: toNum(r.get('meetingSeq')) })),
    };
  });
}

/** Recent decisions offered to MEMORY_RESOLVE (code + text), newest first. */
export async function listRecentDecisions(graph: MemoryGraph, scope: MemoryScope, limit = 50): Promise<MemoryDecision[]> {
  return listDecisions(graph, scope, limit);
}
