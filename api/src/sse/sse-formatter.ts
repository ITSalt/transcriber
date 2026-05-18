/**
 * TECH-012 — SSE frame formatter
 * Converts a JS object to the SSE wire format:
 *   data: <JSON>\n\n
 *
 * Only the `data` field is used — event IDs and named events are not
 * required by ADR-010 for this MVP.
 */

/**
 * Formats `payload` as a single SSE data frame terminated by a blank line.
 * The caller writes the returned string directly to the raw response stream.
 */
export function formatSseFrame(payload: unknown): string {
  const json = JSON.stringify(payload)
  return `data: ${json}\n\n`
}
