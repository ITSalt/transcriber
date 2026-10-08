/**
 * WP-WORKER-07 — deterministic guard against project memory / card participants leaking
 * into the protocol. The prompt already forbids it, but the model still lists people who
 * are in the project card and not in the transcript, so the "## Участники" section is
 * checked after the LLM answered.
 *
 * Name matching is deliberately simple and errs on keeping a line (a stray extra
 * participant is cheaper than deleting a real one):
 *   - lower-case, ё → е, split into words of ≥ 3 letters/digits;
 *   - a word is reduced to a stem: its first max(3, length − 2) characters, which folds the
 *     common Russian case endings (Павел/Павла/Павлу, Ильнур/Ильнура, Мария/Марии/Марию);
 *   - a participant line is kept when ANY word of its name has the same stem as ANY word of
 *     the transcript text or of a speaker_map value;
 *   - lines whose name is a bare "Speaker N" label are never touched.
 */

const PARTICIPANTS_HEADING = /^##\s+(Участники|Participants)\s*$/i
const ANY_HEADING = /^##\s+\S/
const BULLET = /^\s*[-*•]\s+(.*)$/
const SPEAKER_LABEL = /^speaker\s*\d+\b/i

const stemOf = (word: string): string => word.slice(0, Math.max(3, word.length - 2))

function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/ё/g, 'е')
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length >= 3)
}

/** The name part of a participant bullet: up to " — ", " - ", " – " or " (". */
function nameOf(bullet: string): string {
  const cleaned = bullet.replace(/[*_`]/g, '').trim()
  return cleaned.split(/\s+[—–-]\s+|\s*\(/)[0]?.trim() ?? ''
}

export interface ProtocolGuardResult {
  markdown: string
  /** Participant lines removed because their name is nowhere in the transcript. */
  removed: string[]
}

export function guardProtocolParticipants(
  markdown: string,
  transcriptText: string,
  speakerMap: Record<string, string | null> | null | undefined,
): ProtocolGuardResult {
  const known = new Set(
    words([transcriptText, ...Object.values(speakerMap ?? {}).filter((v): v is string => !!v)].join('\n')).map(stemOf),
  )

  const removed: string[] = []
  const out: string[] = []
  let inParticipants = false
  for (const line of markdown.split('\n')) {
    if (ANY_HEADING.test(line)) inParticipants = PARTICIPANTS_HEADING.test(line)
    const bullet = inParticipants ? BULLET.exec(line) : null
    if (bullet) {
      const name = nameOf(bullet[1] ?? '')
      const nameWords = words(name)
      if (!SPEAKER_LABEL.test(name) && nameWords.length > 0 && !nameWords.some((w) => known.has(stemOf(w)))) {
        removed.push(line.trim())
        continue
      }
    }
    out.push(line)
  }
  return removed.length === 0 ? { markdown, removed } : { markdown: out.join('\n'), removed }
}
