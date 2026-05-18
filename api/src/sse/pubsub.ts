/**
 * TECH-012 — Redis pub/sub adapter
 *
 * Provides two thin wrappers over ioredis:
 *  - `publishMeetingEvent`  — publish a typed SseEvent to the meeting's channel
 *  - `subscribeMeetingEvents` — subscribe to a meeting channel; returns an
 *    unsubscribe function that callers MUST invoke on client disconnect.
 *
 * Each subscription creates a **dedicated** ioredis subscriber connection.
 * ioredis does not allow commands other than subscribe/psubscribe on a
 * connection that is in subscriber mode, so we cannot share the main client.
 */
import { Redis } from 'ioredis'
import { type SseEvent, meetingChannel } from '@transcrib/shared'

export type SseEventCallback = (event: SseEvent) => void

/**
 * Subscribe to SSE events for `meetingId`.
 * Returns a cleanup function — call it when the SSE client disconnects.
 */
export function subscribeMeetingEvents(
  redisUrl: string,
  meetingId: string,
  onEvent: SseEventCallback,
): () => void {
  const subscriber = new Redis(redisUrl, {
    lazyConnect: false,
    enableReadyCheck: false,
    // Avoid unhandled-rejection noise on transient disconnect
    maxRetriesPerRequest: null,
  })

  const channel = meetingChannel(meetingId)

  subscriber.subscribe(channel, (err: Error | null | undefined) => {
    if (err) {
      subscriber.disconnect()
    }
  })

  subscriber.on('message', (_chan: string, message: string) => {
    try {
      const raw: unknown = JSON.parse(message)
      onEvent(raw as SseEvent)
    } catch {
      // Malformed message — ignore
    }
  })

  return () => {
    subscriber.unsubscribe(channel).catch(() => {/* best-effort */})
    subscriber.disconnect()
  }
}

/**
 * Publish a typed SseEvent to the meeting's Redis channel.
 * Uses a transient publisher connection.
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
