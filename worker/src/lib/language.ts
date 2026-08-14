/**
 * Language resolution for the transcription and protocol-generation pipelines.
 *
 * Two DIFFERENT facts live here and must not be conflated (DEC-003):
 *
 *   Meeting.language     — the DOCUMENT language declared by the author at upload.
 *                          Three-valued (RU | EN | AUTO), defaults to AUTO.
 *                          Decides which prompt template is used (RQ-022).
 *
 *   Transcript.language  — the language actually spoken in the RECORDING, as reported
 *                          by the ASR provider. Two-valued or NULL (RU | EN | null).
 *                          A record of what happened (RQ-018 / BRQ-005). It does NOT
 *                          influence protocol generation.
 *
 * Collapsing these two is exactly what caused the 2026-08-14 production defect.
 */

/** The two languages the product ships prompt templates for (NFR-004). */
export type SupportedLanguage = 'RU' | 'EN'

/** Prisma's three-valued MeetingLanguage enum. */
export type MeetingLanguageValue = 'RU' | 'EN' | 'AUTO'

/**
 * Normalize a BCP-47 / ISO-639 language tag reported by the ASR provider into a
 * supported language, or `null` when the provider reported something we have no
 * prompt template for.
 *
 * Compares the PRIMARY SUBTAG exactly. A `startsWith` check would wrongly map
 * 'rue' (Rusyn) onto Russian.
 *
 * Handles the provider-specific values the Deepgram adapter can emit:
 *   'multi'  — nova-3 multilingual result, no single language
 *   'auto'   — the adapter's own literal fallback when the response carries no
 *              `detected_language` field at all
 * Both normalize to `null` rather than being coerced to a default: a fabricated
 * language in this column would defeat the column's purpose.
 */
export function normalizeLanguageTag(tag: string | null | undefined): SupportedLanguage | null {
  if (tag === null || tag === undefined) return null

  const primary = tag.trim().toLowerCase().split(/[-_]/)[0]
  if (primary === 'ru') return 'RU'
  if (primary === 'en') return 'EN'
  return null
}

/**
 * RQ-022 / BRQ-013 (amended 2026-08-14, DEC-003): decide the protocol language.
 *
 * Russian is the default for every meeting. English is produced ONLY when the
 * author explicitly selected EN at upload time.
 *
 * Deliberately takes ONLY `Meeting.language`. The transcript's language is not a
 * parameter, because letting it participate is what produced the defect: with the
 * default AUTO there was no transcript language available at selection time, so the
 * rule degenerated into a hard-coded EN fallback and every Russian meeting left on
 * the default got an English protocol. There is no fallback branch here by design —
 * every one of the three enum values maps to a concrete template.
 */
export function resolveProtocolLanguage(
  meetingLanguage: MeetingLanguageValue,
): SupportedLanguage {
  return meetingLanguage === 'EN' ? 'EN' : 'RU'
}
