/** Graph properties → wire DTOs of shared/src/api/memory.ts (snake_case). */
import type { MemoryDecision, MemoryTask, TaskEvent, TaskMention, TaskMentionKind } from '../api/memory.js';
import { toNum, toStatus, toStr, toStoredTaskEvent } from './values.js';

type Props = Record<string, unknown>;

export function toMemoryTask(t: Props, pendingCount: unknown): MemoryTask {
  const assigneeName = toStr(t['assigneeName']);
  return {
    id: String(t['id']),
    code: String(t['code']),
    title: toStr(t['title']) ?? '',
    description: toStr(t['description']),
    status: toStatus(t['status']),
    assignee: assigneeName === null ? null : { participant_id: toStr(t['assigneeParticipantId']), name: assigneeName },
    due_date: toStr(t['dueDate']),
    merged_into: toStr(t['mergedInto']),
    created_in_meeting_id: toStr(t['createdInMeetingId']),
    pending_count: toNum(pendingCount) ?? 0,
    updated_at: String(t['updatedAt'] ?? t['createdAt']),
  };
}

export function toTaskEvent(e: Props, taskCode: string): TaskEvent {
  const s = toStoredTaskEvent(e);
  return {
    id: s.id,
    task_code: taskCode,
    field: s.field,
    old_value: s.oldValue,
    new_value: s.newValue,
    valid_at: s.validAt,
    recorded_at: s.recordedAt,
    superseded_at: s.supersededAt,
    source: s.source,
    confidence: s.confidence,
    reason: s.reason,
    review_state: s.reviewState,
    meeting_id: s.meetingId,
    quote: s.quote,
    author_user_id: s.authorUserId,
  };
}

export function toTaskMention(r: Props, meeting: Props): TaskMention {
  return {
    meeting_id: String(meeting['id']),
    meeting_title: toStr(meeting['title']) ?? '',
    kind: String(r['kind']) as TaskMentionKind,
    quote: toStr(r['quote']) ?? '',
    start_ms: toNum(r['startMs']),
    end_ms: toNum(r['endMs']),
    speaker_label: toStr(r['speakerLabel']),
  };
}

export function toMemoryDecision(
  d: Props,
  mention: { meetingId: unknown; quote: unknown } | null,
  leadsTo: unknown[],
): MemoryDecision {
  return {
    id: String(d['id']),
    code: String(d['code']),
    text: toStr(d['text']) ?? '',
    superseded_by: toStr(d['supersededBy']),
    meeting_id: mention ? toStr(mention.meetingId) : toStr(d['createdInMeetingId']),
    quote: mention ? toStr(mention.quote) : null,
    leads_to: leadsTo.map(String).sort(byCodeNumber),
    created_at: String(d['createdAt']),
  };
}

/** 'T-2' < 'T-10' */
export function byCodeNumber(a: string, b: string): number {
  return Number(a.slice(2)) - Number(b.slice(2));
}
