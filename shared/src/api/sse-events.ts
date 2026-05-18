/**
 * TECH-012 — SSE event schemas
 * Shared between api/ (subscriber) and worker/ (publisher).
 *
 * MeetingStatusEvent is already defined in uc002.ts — re-exported here for
 * convenience. This file adds PingEvent, the SseEvent union, and the Redis
 * channel name helper.
 */
import { z } from 'zod';
export { MeetingStatusEvent } from './uc002.js';
import { MeetingStatusEvent } from './uc002.js';

// ─── ping ─────────────────────────────────────────────────────────────────────

/** Heartbeat frame — keeps the connection alive, carries no payload. */
export const PingEvent = z.object({
  type: z.literal('ping'),
});
export type PingEvent = z.infer<typeof PingEvent>;

// ─── Union ────────────────────────────────────────────────────────────────────

export const SseEvent = z.discriminatedUnion('type', [MeetingStatusEvent, PingEvent]);
export type SseEvent = z.infer<typeof SseEvent>;

// ─── Redis channel helper ─────────────────────────────────────────────────────

/** Returns the Redis pub/sub channel name for a given meeting. */
export function meetingChannel(meetingId: string): string {
  return `meeting:${meetingId}`;
}
