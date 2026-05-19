/**
 * TECH-012 — SSE frame formatter
 *
 * Wire format:
 *   event: <type>\n
 *   data: <JSON>\n
 *   \n
 *
 * The `event:` line is the EventSource event name. Without it, the browser
 * dispatches everything as the default 'message' event, and
 * `source.addEventListener('meeting.status', ...)` never fires (observed
 * production bug: meeting detail page wouldn't auto-refresh when worker
 * finished — clients had to F5).
 *
 * The payload type is whatever the caller passes; we read `payload.type`
 * for the event name if it's a non-empty string, otherwise fall back to
 * 'message' (default EventSource event).
 */

/**
 * Formats `payload` as a single SSE frame terminated by a blank line.
 * The caller writes the returned string directly to the raw response stream.
 */
export function formatSseFrame(payload: unknown): string {
  const eventName =
    typeof payload === 'object' &&
    payload !== null &&
    'type' in payload &&
    typeof (payload as { type: unknown }).type === 'string' &&
    (payload as { type: string }).type.length > 0
      ? (payload as { type: string }).type
      : 'message'
  const json = JSON.stringify(payload)
  return `event: ${eventName}\ndata: ${json}\n\n`
}
