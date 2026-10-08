/**
 * FR-006 / RQ-063 — transcript segments for the memory pipeline: numbered rendering for
 * MEMORY_EXTRACT and verification of the quotes the LLM returns.
 *
 * A quote is accepted only if it is found in Transcript.segmentsBlob (exact after
 * normalisation, or fuzzy: ≥ 85 % of its words inside a window of 1–3 consecutive
 * segments). Timecode and speaker always come from the matched segments, never from the
 * LLM. Unverified quotes are dropped by the caller.
 */
import type { AsrSegment } from '@transcrib/shared'

export interface MemorySegment {
  index: number
  speaker: string
  /** label as shown in the transcript: resolved name or "Speaker N" */
  label: string
  startMs: number
  endMs: number
  text: string
}

export interface VerifiedQuote {
  /**
   * What is stored as the quote: the LLM's text for an exact match (same words as the
   * transcript up to case and punctuation), the matched segments' own text for a fuzzy one
   * — never words the transcript does not contain.
   */
  quote: string
  startMs: number
  endMs: number
  speakerLabel: string
  segmentIndex: number
  match: 'exact' | 'fuzzy'
  /** share of the quote's words found (1 for exact) */
  score: number
}

export const FUZZY_QUOTE_THRESHOLD = 0.85
const MIN_QUOTE_CHARS = 6
const MIN_FUZZY_TOKENS = 4
const MAX_WINDOW = 3
/** a fuzzy quote may miss a word, but never one of these: "не отправил" ≠ "отправил" */
export const NEGATIONS = new Set(['не', 'ни', 'нет', 'no', 'not', 'never', 'без'])

function speakerDisplay(label: string): string {
  const m = /SPEAKER_(\d+)/i.exec(label)
  return m?.[1] !== undefined ? `Speaker ${parseInt(m[1], 10) + 1}` : label
}

/** Parses Transcript.segmentsBlob (JSONB) defensively; malformed entries are skipped. */
export function toMemorySegments(blob: unknown, speakerMap: unknown): MemorySegment[] {
  const map = (speakerMap && typeof speakerMap === 'object' ? speakerMap : {}) as Record<string, unknown>
  if (!Array.isArray(blob)) return []
  const out: MemorySegment[] = []
  for (const raw of blob as Partial<AsrSegment>[]) {
    if (!raw || typeof raw.text !== 'string' || typeof raw.start !== 'number') continue
    const speaker = typeof raw.speaker === 'string' ? raw.speaker : 'SPEAKER_0'
    const resolved = map[speaker]
    out.push({
      index: out.length,
      speaker,
      label: typeof resolved === 'string' && resolved.trim() ? resolved : speakerDisplay(speaker),
      startMs: Math.round(raw.start * 1000),
      endMs: Math.round((typeof raw.end === 'number' ? raw.end : raw.start) * 1000),
      text: raw.text,
    })
  }
  return out
}

function mmss(ms: number): string {
  const s = Math.floor(ms / 1000)
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

/** "[#12] [03:41] Иванов: текст" — one line per segment. */
export function renderNumberedTranscript(segments: readonly MemorySegment[]): string {
  return segments.map((s) => `[#${s.index}] [${mmss(s.startMs)}] ${s.label}: ${s.text}`).join('\n')
}

export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

function tokens(text: string): string[] {
  const n = normalizeText(text)
  return n ? n.split(' ') : []
}

interface Indexed {
  /** normalised transcript, segments joined by one space */
  text: string
  /** start offset of each segment in `text` */
  offsets: number[]
}

function indexSegments(segments: readonly MemorySegment[]): Indexed {
  const offsets: number[] = []
  let text = ''
  for (const s of segments) {
    if (text) text += ' '
    offsets.push(text.length)
    text += normalizeText(s.text)
  }
  return { text, offsets }
}

function segmentAt(offsets: number[], pos: number): number {
  let lo = 0
  let hi = offsets.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (offsets[mid]! <= pos) lo = mid
    else hi = mid - 1
  }
  return lo
}

function result(
  quote: string,
  segments: readonly MemorySegment[],
  first: number,
  last: number,
  match: VerifiedQuote['match'],
  score: number,
): VerifiedQuote {
  const a = segments[first]!
  const b = segments[last]!
  return { quote, startMs: a.startMs, endMs: b.endMs, speakerLabel: a.label, segmentIndex: first, match, score }
}

/**
 * Finds `quote` in the transcript. `hint` = the segment number the LLM pointed at: among
 * several matches the nearest one wins. Returns null when the quote is not there.
 */
export function verifyQuote(
  quote: string,
  segments: readonly MemorySegment[],
  hint: number | null | undefined,
  index: Indexed = indexSegments(segments),
): VerifiedQuote | null {
  const q = normalizeText(quote)
  if (q.length < MIN_QUOTE_CHARS || segments.length === 0) return null
  const near = (i: number) => (hint == null ? i : Math.abs(i - hint))

  // exact (normalised, whole words) — every occurrence, nearest to the hint
  const padded = ` ${index.text} `
  const needle = ` ${q} `
  let best: { first: number; last: number } | null = null
  for (let p = padded.indexOf(needle); p !== -1; p = padded.indexOf(needle, p + 1)) {
    const pos = p // padded offset p + 1 (space) = text offset p
    const first = segmentAt(index.offsets, pos)
    const last = segmentAt(index.offsets, pos + q.length - 1)
    if (!best || near(first) < near(best.first)) best = { first, last }
  }
  if (best) return result(quote, segments, best.first, best.last, 'exact', 1)

  // fuzzy — share of the quote's words inside a window of consecutive segments
  const qTokens = tokens(quote)
  if (qTokens.length < MIN_FUZZY_TOKENS) return null
  const segTokens = segments.map((s) => tokens(s.text))
  let fuzzy: { first: number; last: number; score: number } | null = null
  for (let first = 0; first < segments.length; first++) {
    const bag = new Map<string, number>()
    for (let w = 0; w < MAX_WINDOW && first + w < segments.length; w++) {
      for (const t of segTokens[first + w]!) bag.set(t, (bag.get(t) ?? 0) + 1)
      const left = new Map(bag)
      let hit = 0
      let negationMissing = false
      for (const t of qTokens) {
        const c = left.get(t) ?? 0
        if (c > 0) {
          hit++
          left.set(t, c - 1)
        } else if (NEGATIONS.has(t)) {
          negationMissing = true
        }
      }
      const score = hit / qTokens.length
      if (
        !negationMissing &&
        score >= FUZZY_QUOTE_THRESHOLD &&
        (!fuzzy || score > fuzzy.score || (score === fuzzy.score && near(first) < near(fuzzy.first)))
      ) {
        fuzzy = { first, last: first + w, score }
      }
      if (score === 1) break // a wider window cannot score higher
    }
  }
  if (!fuzzy) return null
  const own = segments
    .slice(fuzzy.first, fuzzy.last + 1)
    .map((x) => x.text.trim())
    .join(' ')
  return result(own, segments, fuzzy.first, fuzzy.last, 'fuzzy', fuzzy.score)
}

/** Verifies many quotes against one index. */
export function createQuoteVerifier(segments: readonly MemorySegment[]) {
  const index = indexSegments(segments)
  return (quote: string, hint?: number | null) => verifyQuote(quote, segments, hint, index)
}

/** Names the speaker_map gave to this meeting's speakers (unmapped speakers keep «Speaker N»). */
export function mappedSpeakerNames(segments: readonly MemorySegment[]): string[] {
  return [...new Set(segments.filter((s) => s.label !== speakerDisplay(s.speaker)).map((s) => s.label))]
}
