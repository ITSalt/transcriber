/**
 * Driver value → JS value. Integers may come back as neo4j Integer (default driver config)
 * or as numbers (disableLosslessIntegers); all counters here are far below 2^53.
 * Temporal values are stored as ISO strings, so no driver temporal types appear.
 */
import { isInt } from 'neo4j-driver';
import type { MemoryTaskStatus, TaskEventField, TaskEventReviewState, TaskEventSource } from '../api/memory.js';
import type { StoredTaskEvent } from './fold.js';

export function toNum(v: unknown): number | null {
  if (v == null) return null;
  if (isInt(v)) return (v as { toNumber(): number }).toNumber();
  if (typeof v === 'number') return v;
  if (typeof v === 'bigint') return Number(v);
  return null;
}

export function toStr(v: unknown): string | null {
  return v == null ? null : String(v);
}

type Props = Record<string, unknown>;

export function toStoredTaskEvent(p: Props): StoredTaskEvent {
  return {
    id: String(p['id']),
    field: p['field'] as TaskEventField,
    oldValue: toStr(p['oldValue']),
    newValue: toStr(p['newValue']),
    oldParticipantId: toStr(p['oldParticipantId']),
    newParticipantId: toStr(p['newParticipantId']),
    validAt: String(p['validAt']),
    recordedAt: String(p['recordedAt']),
    appliedAt: toStr(p['appliedAt']),
    ordinal: toNum(p['ordinal']) ?? 0,
    supersededAt: toStr(p['supersededAt']),
    source: p['source'] as TaskEventSource,
    confidence: toNum(p['confidence']),
    reason: toStr(p['reason']),
    reviewState: p['reviewState'] as TaskEventReviewState,
    quote: toStr(p['quote']),
    authorUserId: toStr(p['authorUserId']),
    meetingId: toStr(p['meetingId']),
  };
}

export function toStatus(v: unknown): MemoryTaskStatus {
  return (toStr(v) ?? 'OPEN') as MemoryTaskStatus;
}
