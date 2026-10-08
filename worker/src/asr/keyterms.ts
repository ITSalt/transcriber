/**
 * FR-004 / RQ-048 / RQ-059 — ASR keyterms from the frozen meeting-context snapshot.
 *
 * Deepgram Nova-3 takes each keyterm as its own repeated `keyterm=` query parameter
 * (no commas, no weights) with a 500-token budget per request; 20–50 terms are
 * recommended (https://developers.deepgram.com/docs/keyterm). We stay under that with
 * ASR_KEYTERMS_MAX terms and a deliberately pessimistic token estimate.
 *
 * Whether keyterms help for `ru` at all is open (Q-1), so the whole feature sits
 * behind ASR_KEYTERMS_ENABLED, off by default.
 */
import {
  ASR_KEYTERMS_MAX,
  ASR_KEYTERMS_MAX_TOKENS,
  MeetingContextSnapshot,
} from '@transcrib/shared'

// ─── Flag ─────────────────────────────────────────────────────────────────────

/** ASR_KEYTERMS_ENABLED: only an explicit true / 1 / yes turns keyterms on. */
export function isAsrKeytermsEnabled(env: Record<string, string | undefined> = process.env): boolean {
  const raw = env['ASR_KEYTERMS_ENABLED']?.trim().toLowerCase()
  return raw === 'true' || raw === '1' || raw === 'yes'
}

// ─── Snapshot ─────────────────────────────────────────────────────────────────

/** The MeetingContext columns the worker reads (Prisma row shape). */
export interface MeetingContextRow {
  meetingType: string | null
  goal: string | null
  agenda: string | null
  participants: unknown
  glossary: unknown
  previousProtocol: unknown
  notes: string | null
  snapshotHash: string | null
}

export interface FrozenContext {
  snapshot: MeetingContextSnapshot
  /** MeetingContext.snapshot_hash — recorded as ProtocolGeneration.context_snapshot_hash */
  hash: string
}

/**
 * RQ-059: only a FROZEN snapshot (snapshot_hash set by POST /start) is context. A draft,
 * a missing row, or a row that does not satisfy the shared schema means "no context" —
 * the meeting is processed exactly as before the program. A schema failure is reported
 * through `warn` rather than failing the job.
 */
export function frozenContextSnapshot(
  row: MeetingContextRow | null | undefined,
  warn?: (message: string) => void,
): FrozenContext | null {
  if (!row || !row.snapshotHash) return null
  const parsed = MeetingContextSnapshot.safeParse({
    meeting_type: row.meetingType,
    goal: row.goal,
    agenda: row.agenda,
    participants: row.participants,
    glossary: row.glossary,
    previous_protocol: row.previousProtocol,
    notes: row.notes,
  })
  if (!parsed.success) {
    warn?.(`MeetingContext snapshot ${row.snapshotHash} fails MeetingContextSnapshot schema — ignored: ${parsed.error.message}`)
    return null
  }
  return { snapshot: parsed.data, hash: row.snapshotHash }
}

// ─── Keyterms ─────────────────────────────────────────────────────────────────

/**
 * Pessimistic token estimate for one keyterm. Real tokenizers spend roughly 3–4 Latin
 * letters or 2–3 Cyrillic letters per token; we assume 3 and 2. Digits and punctuation
 * (`1С:ERP-2026`, `ABC123`) are often split one per token, so each counts as a full
 * token. Never less than one token per word, plus one token of separator per term — so
 * the real count stays under ASR_KEYTERMS_MAX_TOKENS whenever the estimate does.
 */
export function estimateKeytermTokens(term: string): number {
  let tokens = 1
  for (const word of term.split(/\s+/).filter(Boolean)) {
    let latin = 0
    let symbols = 0
    let other = 0
    for (const ch of word) {
      if (/[A-Za-z]/.test(ch)) latin++
      else if (ch.charCodeAt(0) < 128) symbols++
      else other++
    }
    tokens += Math.max(1, Math.ceil(latin / 3 + other / 2) + symbols)
  }
  return tokens
}

/** Deepgram takes no commas inside a keyterm: commas become spaces, whitespace collapses. */
function normalizeKeyterm(term: string): string {
  return term.replace(/,/g, ' ').replace(/\s+/g, ' ').trim()
}

/**
 * Normalize, dedupe (case-insensitive, first spelling wins) and cap a priority-ordered
 * list: at most ASR_KEYTERMS_MAX terms, stopping before the estimate would pass
 * ASR_KEYTERMS_MAX_TOKENS so that lower-priority terms are the ones left out.
 * Idempotent, so the adapter can re-apply it safely.
 */
export function capKeyterms(terms: readonly string[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  let budget = ASR_KEYTERMS_MAX_TOKENS
  for (const raw of terms) {
    const term = normalizeKeyterm(raw)
    const key = term.toLocaleLowerCase()
    if (!term || seen.has(key)) continue
    if (out.length >= ASR_KEYTERMS_MAX) break
    const cost = estimateKeytermTokens(term)
    if (cost > budget) break
    budget -= cost
    seen.add(key)
    out.push(term)
  }
  return out
}

/**
 * RQ-048: participant names and their aliases, then organizations, then glossary terms
 * flagged asr_keyterm (the canonical term only — variants are the misspellings we want
 * ASR to stop producing).
 */
export function buildAsrKeyterms(snapshot: MeetingContextSnapshot): string[] {
  const names = snapshot.participants.flatMap((p) => [p.name, ...p.aliases])
  const organizations = snapshot.participants.flatMap((p) => (p.organization ? [p.organization] : []))
  const terms = snapshot.glossary.filter((g) => g.asr_keyterm).map((g) => g.term)
  return capKeyterms([...names, ...organizations, ...terms])
}
