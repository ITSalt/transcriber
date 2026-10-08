/**
 * Transcript text for the protocol prompt: "[MM:SS] Name|Speaker N: text" per ASR segment.
 * Shared by the transcription job (initial raw_text) and the protocol job (rebuilt from the
 * speaker_map the author confirmed — WP-WORKER-06).
 */
import type { AsrSegment } from '@transcrib/shared'

/**
 * Build full_text markdown from ASR segments and resolved speaker_map.
 * Format: "[MM:SS] SpeakerName: text"
 * Unresolved labels remain as 'Speaker N' (BRQ-021).
 */
export function buildFullText(
  segments: AsrSegment[],
  speakerMap: Record<string, string | null>,
): string {
  return segments
    .map((seg) => {
      const resolvedName = speakerMap[seg.speaker]
      // Map SPEAKER_0 → Speaker 1, SPEAKER_1 → Speaker 2, etc. when unresolved
      const displayLabel = resolvedName ?? speakerLabelToDisplay(seg.speaker)
      const minutes = Math.floor(seg.start / 60)
      const seconds = Math.floor(seg.start % 60)
      const timestamp = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
      return `[${timestamp}] ${displayLabel}: ${seg.text}`
    })
    .join('\n')
}

function speakerLabelToDisplay(label: string): string {
  // SPEAKER_0 → Speaker 1, SPEAKER_1 → Speaker 2
  const match = /SPEAKER_(\d+)/i.exec(label)
  if (match?.[1] !== undefined) {
    return `Speaker ${parseInt(match[1], 10) + 1}`
  }
  return label
}
