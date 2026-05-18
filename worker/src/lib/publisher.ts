/**
 * TECH-012 (worker-side) — ioredis publisher for meeting status events.
 *
 * The API's pubsub.ts handles subscribing (for SSE).
 * The worker uses this thin helper to publish status events after
 * each pipeline transition (TRANSCRIBING → TRANSCRIPT_READY | FAILED).
 *
 * Channel name: `meeting:<meetingId>` (mirrors meetingChannel() in shared/).
 */
import { Redis } from 'ioredis'
import { type SseEvent, meetingChannel } from '@transcrib/shared'

/**
 * Publish a typed SseEvent to the meeting's Redis channel.
 *
 * Creates a transient connection per call — acceptable for low-frequency
 * status events (one per pipeline stage transition).
 */
export async function publishMeetingEvent(
  redisUrl: string,
  event: SseEvent,
  meetingId: string,
): Promise<void> {
  const publisher = new Redis(redisUrl, { lazyConnect: true, enableReadyCheck: false })
  try {
    await publisher.connect()
    await publisher.publish(meetingChannel(meetingId), JSON.stringify(event))
  } finally {
    publisher.disconnect()
  }
}
