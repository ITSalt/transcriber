/**
 * TECH-011 — ILlmProvider abstraction (ADR-007)
 *
 * All LLM vendors must implement this interface.
 * New vendors are added by writing a new adapter — never call vendor SDKs
 * directly from api/ or worker/.
 *
 * Model defaults to 'claude-sonnet-4-6'; per-call override accepted.
 * User-switchable per meeting (ADR-007).
 */

// ─── LlmModel ─────────────────────────────────────────────────────────────────

export type LlmModel = 'claude-sonnet-4-6' | 'gpt-5-4';

export const LLM_MODEL_DEFAULT: LlmModel = 'claude-sonnet-4-6';

// ─── LlmInput ─────────────────────────────────────────────────────────────────

export interface LlmInput {
  /**
   * Transcript text (pre-formatted by the caller with speaker labels).
   * The adapter wraps this with the appropriate system prompt.
   */
  prompt: string;

  /**
   * Model to use for this call.
   * Defaults to 'claude-sonnet-4-6' when omitted.
   */
  model?: LlmModel;

  /**
   * Language of the transcript — 'RU' or 'EN'.
   * Used to select the matching prompt template.
   */
  language: 'RU' | 'EN';
}

// ─── LlmResult ────────────────────────────────────────────────────────────────

export interface LlmResult {
  /**
   * Generated markdown protocol text with the four required sections
   * (BRQ-011): Participants, Discussion, Decisions, Action items.
   */
  text: string;

  /** Model name that was actually used for this generation. */
  model: LlmModel;

  /** Token count for the input (prompt). */
  tokensIn: number;

  /** Token count for the output (completion). */
  tokensOut: number;
}

// ─── ILlmProvider ─────────────────────────────────────────────────────────────

export interface ILlmProvider {
  /**
   * Generate a meeting protocol in markdown from a transcript.
   *
   * @param input - Transcript text, optional model override, and language.
   * @returns Resolved LlmResult with generated markdown and token counts.
   */
  generate(input: LlmInput): Promise<LlmResult>;
}
