import { describe, expect, it } from 'vitest';
import { foldTaskEvents, type StoredTaskEvent } from './fold.js';

let n = 0;
function ev(p: Partial<StoredTaskEvent> & Pick<StoredTaskEvent, 'field' | 'newValue'>): StoredTaskEvent {
  n += 1;
  return {
    id: `e${n}`,
    oldValue: null,
    oldParticipantId: null,
    newParticipantId: null,
    validAt: '2026-10-01T10:00:00.000Z',
    recordedAt: '2026-10-01T12:00:00.000Z',
    appliedAt: '2026-10-01T12:00:00.000Z',
    ordinal: n,
    supersededAt: null,
    source: 'LLM',
    confidence: 0.9,
    reason: null,
    reviewState: 'AUTO',
    quote: 'q',
    authorUserId: null,
    meetingId: 'm1',
    ...p,
  };
}

describe('foldTaskEvents', () => {
  it('applies AUTO and CONFIRMED events, ignores PENDING and REJECTED', () => {
    const events = [
      ev({ field: 'title', newValue: 'Отправить договор' }),
      ev({ field: 'status', newValue: 'OPEN' }),
      ev({ field: 'status', newValue: 'DONE', reviewState: 'PENDING', appliedAt: null }),
      ev({ field: 'due_date', newValue: '2026-10-15', reviewState: 'REJECTED', appliedAt: null }),
    ];
    const { state } = foldTaskEvents(events);
    expect(state).toMatchObject({ title: 'Отправить договор', status: 'OPEN', dueDate: null });
  });

  it('orders by application time, so a closure confirmed later wins over an older auto update', () => {
    const confirmedClose = ev({
      field: 'status',
      newValue: 'DONE',
      reviewState: 'CONFIRMED',
      validAt: '2026-10-02T10:00:00.000Z',
      appliedAt: '2026-10-05T09:00:00.000Z',
      ordinal: 0,
    });
    const laterMeetingUpdate = ev({
      field: 'status',
      newValue: 'IN_PROGRESS',
      validAt: '2026-10-03T10:00:00.000Z',
      appliedAt: '2026-10-03T12:00:00.000Z',
    });
    const { state, supersededAt } = foldTaskEvents([confirmedClose, laterMeetingUpdate]);
    expect(state.status).toBe('DONE');
    expect(supersededAt.get(laterMeetingUpdate.id)).toBe('2026-10-05T09:00:00.000Z');
    expect(supersededAt.get(confirmedClose.id)).toBeNull();
  });

  it('assignee carries the participant id; unassign clears both', () => {
    const a = ev({ field: 'assignee', newValue: 'Иванов', newParticipantId: 'p1' });
    expect(foldTaskEvents([a]).state).toMatchObject({ assigneeName: 'Иванов', assigneeParticipantId: 'p1' });
    const clear = ev({ field: 'assignee', newValue: null, newParticipantId: null, appliedAt: '2026-10-02T00:00:00.000Z' });
    expect(foldTaskEvents([a, clear]).state).toMatchObject({ assigneeName: null, assigneeParticipantId: null });
  });
});
