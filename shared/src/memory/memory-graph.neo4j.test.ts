/**
 * Integration tests of the memory access layer against a real Neo4j (CI service of
 * WP-INFRA-01, or `docker compose up -d memory-neo4j` locally with MEMORY_NEO4J_URI set).
 * Skipped when MEMORY_NEO4J_URI is unset. Every test works in fresh random workspace /
 * project ids and removes them afterwards, so runs never collide.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import neo4j, { type Driver } from 'neo4j-driver';
import {
  applyMemoryGraphMigrations,
  confirmTaskEvent,
  deleteMeetingFromGraph,
  deleteProjectFromGraph,
  findTaskEventScope,
  getMeetingMemoryRefs,
  getProjectMemory,
  getProjectMemoryState,
  getPromptMemoryData,
  getReviewQueue,
  getTaskDetail,
  listDecisions,
  listTasks,
  MemoryConcurrencyError,
  patchTask,
  rejectTaskEvent,
  TaskEventAlreadyReviewedError,
  TaskStatusTransitionError,
  writeMeetingUpdate,
  type MeetingUpdatePlan,
  type MemoryGraph,
  type MemoryScope,
} from './index.js';

const URI = process.env['MEMORY_NEO4J_URI'];
const uuid = () => (globalThis as unknown as { crypto: { randomUUID(): string } }).crypto.randomUUID();

describe.skipIf(!URI)('memory graph on Neo4j', { timeout: 60_000 }, () => {
  let driver: Driver;
  let graph: MemoryGraph;
  const scope: MemoryScope = { workspaceId: uuid(), projectId: uuid() };
  const foreign: MemoryScope = { workspaceId: uuid(), projectId: scope.projectId };
  const m1 = uuid();
  const m2 = uuid();
  const ivanov = uuid();

  beforeAll(async () => {
    driver = neo4j.driver(
      URI!,
      neo4j.auth.basic(process.env['MEMORY_NEO4J_USER'] ?? 'neo4j', process.env['MEMORY_NEO4J_PASSWORD'] ?? ''),
    );
    graph = { driver, database: process.env['MEMORY_NEO4J_DATABASE'] || undefined };
    await applyMemoryGraphMigrations(graph);
  }, 60_000);

  afterAll(async () => {
    await deleteProjectFromGraph(graph, scope);
    await driver.close();
  }, 60_000);

  const mention = (quote: string, kind: 'CREATED' | 'STATUS_UPDATE' | 'MENTIONED' = 'CREATED') => ({
    quote,
    startMs: 1000,
    endMs: 4000,
    speakerLabel: 'Speaker 1',
    kind,
  });

  function meeting1Plan(): MeetingUpdatePlan {
    const created = (field: 'title' | 'status' | 'assignee', newValue: string, extra = {}) => ({
      id: uuid(),
      field,
      oldValue: null,
      newValue,
      reviewState: 'AUTO' as const,
      confidence: 0.9,
      reason: 'new task',
      quote: 'Иванов отправит договор до пятнадцатого',
      ...extra,
    });
    return {
      meeting: { id: m1, title: 'Встреча 1', occurredAt: '2026-10-01T10:00:00.000Z' },
      participants: [{ id: ivanov, name: 'Иванов' }],
      expected: { taskSeq: 0, decisionSeq: 0, meetingSeq: 0, memoryVersion: 0 },
      newTasks: [
        {
          id: uuid(),
          code: 'T-1',
          seq: 1,
          mention: mention('Иванов отправит договор до пятнадцатого'),
          events: [
            created('title', 'Отправить договор'),
            created('status', 'OPEN'),
            created('assignee', 'Иванов', { newParticipantId: ivanov }),
          ],
        },
        {
          id: uuid(),
          code: 'T-2',
          seq: 2,
          mention: mention('нужно подготовить смету'),
          events: [created('title', 'Подготовить смету'), created('status', 'OPEN')],
        },
      ],
      taskUpdates: [],
      newDecisions: [
        {
          id: uuid(),
          code: 'D-1',
          seq: 1,
          text: 'Работаем по договору подряда',
          mention: { quote: 'решили работать по договору подряда', startMs: 5000, endMs: 7000, speakerLabel: 'Speaker 2' },
          leadsTo: ['T-1'],
          supersedes: null,
        },
      ],
      decisionMentions: [],
      memory: { id: uuid(), summaryMd: '# Сводка\nДоговор подряда.' },
      now: '2026-10-01T12:00:00.000Z',
    };
  }

  it('graph:migrate is idempotent — the second run applies nothing', async () => {
    const constraints = async () => {
      const s = driver.session({ database: graph.database });
      try {
        return (await s.run('SHOW CONSTRAINTS YIELD name RETURN name ORDER BY name')).records.map((r) => r.get('name'));
      } finally {
        await s.close();
      }
    };
    const before = await constraints();
    const second = await applyMemoryGraphMigrations(graph);
    expect(second.applied).toEqual([]);
    expect(second.from).toBe(second.to);
    expect(await constraints()).toEqual(before);
  });

  it('writes meeting 1 in one transaction: T-1, T-2, D-1, summary v1; re-delivery is a no-op', async () => {
    const res = await writeMeetingUpdate(graph, scope, meeting1Plan());
    expect(res).toMatchObject({ status: 'APPLIED', memoryVersion: 1, meetingSeq: 1, createdTasks: 2, createdDecisions: 1 });

    const tasks = await listTasks(graph, scope);
    expect(tasks.map((t) => [t.code, t.title, t.status])).toEqual([
      ['T-1', 'Отправить договор', 'OPEN'],
      ['T-2', 'Подготовить смету', 'OPEN'],
    ]);
    expect(tasks[0]!.assignee).toEqual({ participant_id: ivanov, name: 'Иванов' });
    expect(tasks[0]!.created_in_meeting_id).toBe(m1);

    const decisions = await listDecisions(graph, scope);
    expect(decisions).toMatchObject([{ code: 'D-1', leads_to: ['T-1'], meeting_id: m1, quote: 'решили работать по договору подряда' }]);

    expect(await writeMeetingUpdate(graph, scope, meeting1Plan())).toEqual({ status: 'ALREADY_APPLIED' });
    expect((await getProjectMemoryState(graph, scope, m1)).meetingAlreadyApplied).toBe(true);
  });

  it('a foreign workspaceId sees nothing (same projectId)', async () => {
    expect(await listTasks(graph, foreign)).toEqual([]);
    expect(await listDecisions(graph, foreign)).toEqual([]);
    expect(await getTaskDetail(graph, foreign, 'T-1')).toBeNull();
    expect((await getProjectMemory(graph, foreign)).current).toBeNull();
    expect((await getReviewQueue(graph, foreign)).count).toBe(0);
  });

  it('never adopts a meeting projection of another project (same id → the write fails, nothing written)', async () => {
    const other: MemoryScope = { workspaceId: scope.workspaceId, projectId: uuid() }
    await expect(writeMeetingUpdate(graph, other, meeting1Plan())).rejects.toThrow()
    expect(await listTasks(graph, other)).toEqual([])
    expect((await getProjectMemory(graph, other)).versions).toEqual([])
    await deleteProjectFromGraph(graph, other)
  })

  it('refuses a plan whose counters are stale (codes are never reused)', async () => {
    const stale = { ...meeting1Plan(), meeting: { id: uuid(), title: 'x', occurredAt: '2026-10-01T10:00:00.000Z' } };
    await expect(writeMeetingUpdate(graph, scope, stale)).rejects.toThrow(MemoryConcurrencyError);
    expect(await listTasks(graph, scope)).toHaveLength(2);
  });

  let closeEventId = '';

  it('meeting 2: a PENDING closure leaves T-1 open; T-2 gets no events', async () => {
    closeEventId = uuid();
    const plan: MeetingUpdatePlan = {
      meeting: { id: m2, title: 'Встреча 2', occurredAt: '2026-10-08T10:00:00.000Z' },
      participants: [{ id: ivanov, name: 'Иванов' }],
      expected: { taskSeq: 2, decisionSeq: 1, meetingSeq: 1, memoryVersion: 1 },
      newTasks: [],
      taskUpdates: [
        {
          code: 'T-1',
          mentions: [mention('договор отправил', 'STATUS_UPDATE')],
          events: [
            {
              id: closeEventId,
              field: 'status',
              oldValue: 'OPEN',
              newValue: 'DONE',
              reviewState: 'PENDING',
              confidence: 0.95,
              reason: 'Иванов сказал, что отправил договор',
              quote: 'договор отправил',
            },
          ],
        },
      ],
      newDecisions: [],
      decisionMentions: [{ code: 'D-1', mention: { quote: 'по договору подряда', startMs: 0, endMs: 1000, speakerLabel: null } }],
      memory: { id: uuid(), summaryMd: '# Сводка v2' },
      now: '2026-10-08T12:00:00.000Z',
    };
    await writeMeetingUpdate(graph, scope, plan);

    const t1 = (await getTaskDetail(graph, scope, 'T-1'))!;
    expect(t1.task.status).toBe('OPEN');
    expect(t1.task.pending_count).toBe(1);
    expect(t1.mentions.map((m) => [m.meeting_title, m.kind])).toEqual([
      ['Встреча 1', 'CREATED'],
      ['Встреча 2', 'STATUS_UPDATE'],
    ]);
    const t2 = (await getTaskDetail(graph, scope, 'T-2'))!;
    expect(t2.events.filter((e) => e.meeting_id === m2)).toEqual([]);
    expect(t2.mentions).toHaveLength(1);

    const queue = await getReviewQueue(graph, scope);
    expect(queue.count).toBe(1);
    expect(queue.items[0]).toMatchObject({ event: { id: closeEventId, review_state: 'PENDING', quote: 'договор отправил' }, task: { code: 'T-1' }, meeting_title: 'Встреча 2' });

    const memory = await getProjectMemory(graph, scope);
    expect(memory.current).toMatchObject({ version: 2, summary_md: '# Сводка v2', source_meeting_id: m2 });
    expect(memory.versions.map((v) => v.version)).toEqual([2, 1]);

    const refs = await getMeetingMemoryRefs(graph, scope, m2);
    expect(refs.tasks.map((t) => t.code)).toEqual(['T-1']);
    expect(refs.decisions.map((d) => d.code)).toEqual(['D-1']);

    const prompt = await getPromptMemoryData(graph, scope);
    expect(prompt.summaryMd).toBe('# Сводка v2');
    expect(prompt.openTasks.map((t) => [t.code, t.status_since_meeting_seq])).toEqual([
      ['T-1', 1],
      ['T-2', 1],
    ]);
  });

  it('confirm applies the closure once; a repeat is refused; the event is found only from its workspace', async () => {
    expect(await findTaskEventScope(graph, closeEventId, [foreign.workspaceId])).toBeNull();
    expect(await findTaskEventScope(graph, closeEventId, [scope.workspaceId])).toEqual(scope);

    const user = uuid();
    const res = await confirmTaskEvent(graph, scope, closeEventId, { userId: user, now: '2026-10-09T09:00:00.000Z' });
    expect(res.event.review_state).toBe('CONFIRMED');
    expect(res.task).toMatchObject({ code: 'T-1', status: 'DONE', pending_count: 0 });
    await expect(confirmTaskEvent(graph, scope, closeEventId, { userId: user })).rejects.toThrow(TaskEventAlreadyReviewedError);
    await expect(rejectTaskEvent(graph, scope, closeEventId, { userId: user })).rejects.toThrow(TaskEventAlreadyReviewedError);
  });

  it('manual edit: invalid transition refused, valid edit adds a USER event', async () => {
    const user = uuid();
    await expect(patchTask(graph, scope, 'T-1', { status: 'IN_PROGRESS' }, { userId: user })).rejects.toThrow(TaskStatusTransitionError);
    const detail = await patchTask(graph, scope, 'T-2', { status: 'IN_PROGRESS', dueDate: '2026-10-20' }, { userId: user });
    expect(detail.task).toMatchObject({ status: 'IN_PROGRESS', due_date: '2026-10-20' });
    const userEvents = detail.events.filter((e) => e.source === 'USER');
    expect(userEvents.map((e) => [e.field, e.old_value, e.new_value, e.review_state, e.author_user_id])).toEqual([
      ['status', 'OPEN', 'IN_PROGRESS', 'CONFIRMED', user],
      ['due_date', null, '2026-10-20', 'CONFIRMED', user],
    ]);
    // the older status event is superseded by the edit
    const creationStatus = detail.events.find((e) => e.field === 'status' && e.source === 'LLM')!;
    expect(creationStatus.superseded_at).not.toBeNull();
  });

  it('deleting meeting 2 removes its events and re-folds T-1 back to OPEN; deleting meeting 1 removes what only it created', async () => {
    const r2 = await deleteMeetingFromGraph(graph, scope, m2);
    expect(r2).toMatchObject({ meetingFound: true, deletedTasks: 0, deletedEvents: 1, recomputedTasks: ['T-1'] });
    expect((await getTaskDetail(graph, scope, 'T-1'))!.task.status).toBe('OPEN');
    expect(await deleteMeetingFromGraph(graph, scope, m2)).toMatchObject({ meetingFound: false, deletedEvents: 0 });

    const r1 = await deleteMeetingFromGraph(graph, scope, m1);
    expect(r1).toMatchObject({ meetingFound: true, deletedTasks: 2, deletedDecisions: 1 });
    expect(await listTasks(graph, scope)).toEqual([]);
    expect(await listDecisions(graph, scope)).toEqual([]);
  });

  it('deleting the project removes every node of it', async () => {
    const res = await deleteProjectFromGraph(graph, scope);
    expect(res.deletedNodes).toBeGreaterThan(0);
    expect((await getProjectMemory(graph, scope)).versions).toEqual([]);
    expect((await deleteProjectFromGraph(graph, scope)).deletedNodes).toBe(0);
  });
});
