/**
 * Transcript text for the protocol prompt: "[MM:SS] Name|Speaker N: text" per ASR segment.
 * Shared by the transcription job (initial raw_text) and the protocol job (rebuilt from the
 * speaker_map the author confirmed — WP-WORKER-06).
 */
import type { AsrSegment } from '@transcrib/shared'

/**
 * Build full_text markdown from ASR segments and resolved speaker_map.
 * Format: "[MM:SS] SpeakerName: text"
 * Unresolved labels remain as a neutral label (BRQ-021): «Спикер N» for RU, 'Speaker N' for EN (D-41).
 */
export function buildFullText(
  segments: AsrSegment[],
  speakerMap: Record<string, string | null>,
  language: 'RU' | 'EN' = 'RU',
): string {
  return segments
    .map((seg) => {
      const resolvedName = speakerMap[seg.speaker]
      // Map SPEAKER_0 → label N+1 when unresolved
      const displayLabel = resolvedName ?? speakerLabelToDisplay(seg.speaker, language)
      const minutes = Math.floor(seg.start / 60)
      const seconds = Math.floor(seg.start % 60)
      const timestamp = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
      return `[${timestamp}] ${displayLabel}: ${seg.text}`
    })
    .join('\n')
}

function speakerLabelToDisplay(label: string, language: 'RU' | 'EN'): string {
  // SPEAKER_0 → Спикер 1 / Speaker 1, SPEAKER_1 → Спикер 2 / Speaker 2
  const match = /SPEAKER_(\d+)/i.exec(label)
  if (match?.[1] !== undefined) {
    return `${language === 'RU' ? 'Спикер' : 'Speaker'} ${parseInt(match[1], 10) + 1}`
  }
  return label
}
