/**
 * FR-006 / UC-600 — writes one meeting's memory update in ONE Neo4j write transaction:
 * projections (:Project, :Meeting, :Participant), new T-n / D-n, MENTIONED_IN edges,
 * TaskEvents (AUTO applied, PENDING waiting), the new ProjectMemory version.
 *
 * The worker plans everything (codes included) from getProjectMemoryState(); the write
 * re-checks the project's counters and fails with MemoryConcurrencyError if another update
 * landed in between, so codes are never reused. A meeting that already produced a
 * ProjectMemory version is skipped (re-delivered job).
 */
import type { TaskEventField, TaskMentionKind } from '../api/memory.js';
import { MemoryConcurrencyError } from './errors.js';
import { readScoped, writeScoped, type MemoryGraph, type MemoryScope, type ScopedTx } from './scope.js';
import { materializeTask } from './tasks.js';
import { toNum, toStr } from './values.js';

export interface MentionInput {
  /** verbatim quote, verified against the transcript segments */
  quote: string;
  startMs: number | null;
  endMs: number | null;
  speakerLabel: string | null;
}

export interface TaskMentionInput extends MentionInput {
  kind: TaskMentionKind;
}

export interface NewTaskEventInput {
  id: string;
  field: TaskEventField;
  oldValue: string | null;
  newValue: string | null;
  oldParticipantId?: string | null;
  newParticipantId?: string | null;
  reviewState: 'AUTO' | 'PENDING';
  confidence: number | null;
  reason: string | null;
  quote: string | null;
}

export interface MeetingUpdatePlan {
  meeting: { id: string; title: string; occurredAt: string };
  /** ProjectParticipant projections (id + name) */
  participants: Array<{ id: string; name: string }>;
  /** counters read by the planner; the write fails if they moved */
  expected: { taskSeq: number; decisionSeq: number; meetingSeq: number; memoryVersion: number };
  newTasks: Array<{ id: string; code: string; seq: number; mention: TaskMentionInput; events: NewTaskEventInput[] }>;
  taskUpdates: Array<{ code: string; mentions: TaskMentionInput[]; events: NewTaskEventInput[] }>;
  newDecisions: Array<{
    id: string;
    code: string;
    seq: number;
    text: string;
    mention: MentionInput;
    /** task codes (new or existing) */
    leadsTo: string[];
    /** code of an older decision this one replaces */
    supersedes: string | null;
  }>;
  decisionMentions: Array<{ code: string; mention: MentionInput }>;
  memory: { id: string; summaryMd: string };
  /** recordedAt of everything written */
  now: string;
}

export interface ProjectMemoryState {
  taskSeq: number;
  decisionSeq: number;
  meetingSeq: number;
  /** 0 = no summary yet */
  memoryVersion: number;
  summaryMd: string | null;
  /** this meeting already produced a ProjectMemory version */
  meetingAlreadyApplied: boolean;
}

export async function getProjectMemoryState(
  graph: MemoryGraph,
  scope: MemoryScope,
  meetingId: string,
): Promise<ProjectMemoryState> {
  return readScoped(graph, scope, (tx) => readState(tx, meetingId));
}

async function readState(tx: ScopedTx, meetingId: string): Promise<ProjectMemoryState> {
  const res = await tx.run(
    `OPTIONAL MATCH (p:Project {id: $projectId, workspaceId: $workspaceId})
     OPTIONAL MATCH (m:ProjectMemory {workspaceId: $workspaceId, projectId: $projectId})
     WITH p, m ORDER BY m.version DESC
     WITH p, collect(m)[0] AS latest
     OPTIONAL MATCH (done:ProjectMemory {workspaceId: $workspaceId, projectId: $projectId, sourceMeetingId: $meetingId})
     RETURN p.taskSeq AS taskSeq, p.decisionSeq AS decisionSeq, p.meetingSeq AS meetingSeq,
            latest.version AS version, latest.summaryMd AS summaryMd, count(done) > 0 AS applied`,
    { meetingId },
  );
  const r = res.records[0];
  return {
    taskSeq: toNum(r?.get('taskSeq')) ?? 0,
    decisionSeq: toNum(r?.get('decisionSeq')) ?? 0,
    meetingSeq: toNum(r?.get('meetingSeq')) ?? 0,
    memoryVersion: toNum(r?.get('version')) ?? 0,
    summaryMd: toStr(r?.get('summaryMd')),
    meetingAlreadyApplied: Boolean(r?.get('applied')),
  };
}

export type MeetingUpdateResult =
  | { status: 'ALREADY_APPLIED' }
  /** the meeting or its project was deleted from memory (tombstone) — nothing written */
  | { status: 'DELETED' }
  | { status: 'APPLIED'; memoryVersion: number; meetingSeq: number; createdTasks: number; events: number; createdDecisions: number };

export async function writeMeetingUpdate(
  graph: MemoryGraph,
  scope: MemoryScope,
  plan: MeetingUpdatePlan,
): Promise<MeetingUpdateResult> {
  return writeScoped(graph, scope, async (tx) => {
    const tomb = await tx.run(
      `OPTIONAL MATCH (x:Tombstone {workspaceId: $workspaceId, projectId: $projectId})
       WHERE x.kind = 'PROJECT' OR (x.kind = 'MEETING' AND x.targetId = $meetingId)
       RETURN count(x) > 0 AS deleted`,
      { meetingId: plan.meeting.id },
    );
    if (tomb.records[0]?.get('deleted') === true) return { status: 'DELETED' } as const;
    const state = await readState(tx, plan.meeting.id);
    if (state.meetingAlreadyApplied) return { status: 'ALREADY_APPLIED' } as const;
    const { expected } = plan;
    if (
      state.taskSeq !== expected.taskSeq ||
      state.decisionSeq !== expected.decisionSeq ||
      state.meetingSeq !== expected.meetingSeq ||
      state.memoryVersion !== expected.memoryVersion
    ) {
      throw new MemoryConcurrencyError(
        `project memory changed while planning meeting ${plan.meeting.id}: ` +
          `expected ${JSON.stringify(expected)}, found ${JSON.stringify({ ...state, summaryMd: undefined })}`,
      );
    }
    const now = plan.now;
    const meetingSeq = expected.meetingSeq + 1;
    const taskSeq = Math.max(expected.taskSeq, ...plan.newTasks.map((t) => t.seq));
    const decisionSeq = Math.max(expected.decisionSeq, ...plan.newDecisions.map((d) => d.seq));

    // projections — MERGE on id AND tenant: a node of the same id under another workspace /
    // project hits the id uniqueness constraint and fails the job instead of being adopted
    await tx.run(
      `MERGE (p:Project {id: $projectId, workspaceId: $workspaceId, projectId: $projectId})
       ON CREATE SET p.createdAt = $now
       SET p.taskSeq = toInteger($taskSeq), p.decisionSeq = toInteger($decisionSeq),
           p.meetingSeq = toInteger($meetingSeq), p.updatedAt = $now
       MERGE (m:Meeting {id: $meetingId, workspaceId: $workspaceId, projectId: $projectId})
       ON CREATE SET m.seq = toInteger($meetingSeq)
       SET m.title = $title, m.occurredAt = $occurredAt
       MERGE (m)-[:OF_PROJECT]->(p)
       WITH p
       UNWIND $participants AS pp
       MERGE (x:Participant {id: pp.id, workspaceId: $workspaceId, projectId: $projectId})
       SET x.name = pp.name
       MERGE (x)-[:OF_PROJECT]->(p)`,
      {
        now,
        taskSeq,
        decisionSeq,
        meetingSeq,
        meetingId: plan.meeting.id,
        title: plan.meeting.title,
        occurredAt: plan.meeting.occurredAt,
        participants: plan.participants,
      },
    );

    // new tasks + their CREATED mention
    await tx.run(
      `MATCH (m:Meeting {id: $meetingId, workspaceId: $workspaceId, projectId: $projectId})
       UNWIND $tasks AS nt
       CREATE (t:Task {id: nt.id, workspaceId: $workspaceId, projectId: $projectId, code: nt.code,
                       seq: toInteger(nt.seq), title: '', status: 'OPEN', createdInMeetingId: $meetingId,
                       createdAt: $now, updatedAt: $now})
       CREATE (t)-[:MENTIONED_IN {quote: nt.mention.quote, startMs: toInteger(nt.mention.startMs),
                                  endMs: toInteger(nt.mention.endMs), speakerLabel: nt.mention.speakerLabel,
                                  kind: nt.mention.kind}]->(m)`,
      { meetingId: plan.meeting.id, now, tasks: plan.newTasks },
    );

    // mentions of existing tasks
    const mentions = plan.taskUpdates.flatMap((u) => u.mentions.map((m) => ({ code: u.code, ...m })));
    await tx.run(
      `MATCH (m:Meeting {id: $meetingId, workspaceId: $workspaceId, projectId: $projectId})
       UNWIND $mentions AS mm
       MATCH (t:Task {workspaceId: $workspaceId, projectId: $projectId, code: mm.code})
       CREATE (t)-[:MENTIONED_IN {quote: mm.quote, startMs: toInteger(mm.startMs), endMs: toInteger(mm.endMs),
                                  speakerLabel: mm.speakerLabel, kind: mm.kind}]->(m)`,
      { meetingId: plan.meeting.id, mentions },
    );

    // events (new tasks first, so creation events precede updates in the fold)
    const events = [
      ...plan.newTasks.flatMap((t) => t.events.map((e) => ({ ...e, code: t.code }))),
      ...plan.taskUpdates.flatMap((u) => u.events.map((e) => ({ ...e, code: u.code }))),
    ].map((e, ordinal) => ({
      id: e.id,
      // AUTO events of a task created by this meeting = its creation; they survive the meeting's deletion
      creation: e.reviewState === 'AUTO' && plan.newTasks.some((t) => t.code === e.code),
      code: e.code,
      field: e.field,
      oldValue: e.oldValue,
      newValue: e.newValue,
      oldParticipantId: e.oldParticipantId ?? null,
      newParticipantId: e.newParticipantId ?? null,
      reviewState: e.reviewState,
      appliedAt: e.reviewState === 'AUTO' ? now : null,
      confidence: e.confidence,
      reason: e.reason,
      quote: e.quote,
      ordinal,
    }));
    await tx.run(
      `MATCH (m:Meeting {id: $meetingId, workspaceId: $workspaceId, projectId: $projectId})
       UNWIND $events AS ev
       MATCH (t:Task {workspaceId: $workspaceId, projectId: $projectId, code: ev.code})
       CREATE (e:TaskEvent {id: ev.id, workspaceId: $workspaceId, projectId: $projectId, field: ev.field,
                            creation: ev.creation,
                            oldValue: ev.oldValue, newValue: ev.newValue,
                            oldParticipantId: ev.oldParticipantId, newParticipantId: ev.newParticipantId,
                            validAt: $validAt, recordedAt: $now, appliedAt: ev.appliedAt,
                            ordinal: toInteger(ev.ordinal), source: 'LLM', confidence: ev.confidence,
                            reason: ev.reason, reviewState: ev.reviewState, quote: ev.quote,
                            meetingId: $meetingId})
       CREATE (e)-[:OF_TASK]->(t)
       CREATE (e)-[:IN_MEETING]->(m)`,
      { meetingId: plan.meeting.id, validAt: plan.meeting.occurredAt, now, events },
    );

    // decisions
    await tx.run(
      `MATCH (m:Meeting {id: $meetingId, workspaceId: $workspaceId, projectId: $projectId})
       UNWIND $decisions AS nd
       CREATE (d:Decision {id: nd.id, workspaceId: $workspaceId, projectId: $projectId, code: nd.code,
                           seq: toInteger(nd.seq), text: nd.text, supersededBy: null,
                           createdInMeetingId: $meetingId, createdAt: $now})
       CREATE (d)-[:MENTIONED_IN {quote: nd.mention.quote, startMs: toInteger(nd.mention.startMs),
                                  endMs: toInteger(nd.mention.endMs), speakerLabel: nd.mention.speakerLabel}]->(m)
       WITH d, nd
       CALL (d, nd) {
         UNWIND nd.leadsTo AS code
         MATCH (t:Task {workspaceId: $workspaceId, projectId: $projectId, code: code})
         MERGE (d)-[:LEADS_TO]->(t)
       }
       CALL (d, nd) {
         MATCH (old:Decision {workspaceId: $workspaceId, projectId: $projectId, code: nd.supersedes})
         WHERE old <> d
         SET old.supersededBy = d.code
         MERGE (d)-[:SUPERSEDES]->(old)
       }`,
      { meetingId: plan.meeting.id, now, decisions: plan.newDecisions },
    );
    await tx.run(
      `MATCH (m:Meeting {id: $meetingId, workspaceId: $workspaceId, projectId: $projectId})
       UNWIND $mentions AS dm
       MATCH (d:Decision {workspaceId: $workspaceId, projectId: $projectId, code: dm.code})
       CREATE (d)-[:MENTIONED_IN {quote: dm.mention.quote, startMs: toInteger(dm.mention.startMs),
                                  endMs: toInteger(dm.mention.endMs), speakerLabel: dm.mention.speakerLabel}]->(m)`,
      { meetingId: plan.meeting.id, mentions: plan.decisionMentions },
    );

    // summary version
    const memoryVersion = expected.memoryVersion + 1;
    await tx.run(
      `MATCH (p:Project {id: $projectId, workspaceId: $workspaceId})
       CREATE (pm:ProjectMemory {id: $id, workspaceId: $workspaceId, projectId: $projectId,
                                 version: toInteger($version), summaryMd: $summaryMd,
                                 sourceMeetingId: $meetingId, createdAt: $now})
       CREATE (pm)-[:OF_PROJECT]->(p)
       WITH pm
       OPTIONAL MATCH (prev:ProjectMemory {workspaceId: $workspaceId, projectId: $projectId, version: toInteger($prevVersion)})
       FOREACH (_ IN CASE WHEN prev IS NULL THEN [] ELSE [1] END | CREATE (pm)-[:PREVIOUS]->(prev))`,
      {
        id: plan.memory.id,
        version: memoryVersion,
        prevVersion: expected.memoryVersion,
        summaryMd: plan.memory.summaryMd,
        meetingId: plan.meeting.id,
        now,
      },
    );

    // current state of every touched task = fold of its events
    const touched = new Set([...plan.newTasks.map((t) => t.code), ...plan.taskUpdates.filter((u) => u.events.length > 0).map((u) => u.code)]);
    for (const code of touched) await materializeTask(tx, code, now);

    return {
      status: 'APPLIED',
      memoryVersion,
      meetingSeq,
      createdTasks: plan.newTasks.length,
      events: events.length,
      createdDecisions: plan.newDecisions.length,
    } as const;
  });
}
