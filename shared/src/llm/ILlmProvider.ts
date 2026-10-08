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

/**
 * A provider-specific model id. The known ids are listed for autocomplete; `(string & {})`
 * keeps the union open so a new vendor/model (OpenRouter slugs like 'anthropic/claude-haiku-5.5')
 * needs no change here. ProtocolGeneration.model is a plain String column, so any id is storable.
 */
export type LlmModel = 'claude-sonnet-4-6' | 'gpt-5-4' | 'anthropic/claude-haiku-5.5' | (string & {});

/** Default for kie.ai. OpenRouter's default model is chosen in worker/src/llm/provider.ts. */
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

  /**
   * FR-004 / FR-006 (contract v1): context sections placed before the transcript, in the
   * order of LLM_CONTEXT_SECTION_ORDER, each wrapped as <name>…</name>. The caller passes
   * plain text; the adapter escapes closing tags inside it and omits empty sections.
   * Absent or all-empty = today's request, byte for byte.
   */
  context?: LlmContextSections;
}

// ─── Context sections ─────────────────────────────────────────────────────────

export const LLM_CONTEXT_SECTION_ORDER = [
  'meeting_meta',
  'participants',
  'agenda',
  'glossary',
  'previous_protocol',
  'notes',
  'project_memory',
] as const;
export type LlmContextSectionName = (typeof LLM_CONTEXT_SECTION_ORDER)[number];

/** Rendered text per section; the transcript always goes last as <transcript>. */
export type LlmContextSections = Partial<Record<LlmContextSectionName, string | null>>;

/** True when no section carries text — the request must then equal the pre-program one. */
export function isLlmContextEmpty(context: LlmContextSections | undefined): boolean {
  if (!context) return true;
  return LLM_CONTEXT_SECTION_ORDER.every((k) => !context[k] || context[k]!.trim() === '');
}

/** Any opening or closing tag of a section name, tolerant to case and inner whitespace. */
const SECTION_TAG = new RegExp(
  `<\\s*(\\/?)\\s*(${[...LLM_CONTEXT_SECTION_ORDER, 'transcript'].join('|')})\\s*>`,
  'gi',
);

/**
 * Wrap non-empty sections in tags, in canonical order. Any section tag that appears inside
 * the text (`</notes>`, `</NOTES >`, `<transcript>`, …) is neutralised as `<\/name>` /
 * `<\name>` so user text can neither end a section nor fake a new one.
 */
export function renderLlmContextSections(context: LlmContextSections | undefined): string {
  if (!context) return '';
  const escape = (text: string): string =>
    text.replace(SECTION_TAG, (_m, slash: string, name: string) => `<\\${slash}${name}>`);
  return LLM_CONTEXT_SECTION_ORDER.filter((k) => context[k] && context[k]!.trim() !== '')
    .map((k) => `<${k}>\n${escape(context[k]!.trim())}\n</${k}>`)
    .join('\n\n');
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

// ─── ILlmCompletionProvider (FR-006, contract v1) ─────────────────────────────

/**
 * Generic completion for the project-memory steps (MEMORY_EXTRACT / RESOLVE / SUMMARY):
 * the caller owns the system prompt and, for JSON steps, the output schema. Implemented by
 * the same vendor adapter as ILlmProvider (worker/src/llm); every call is recorded as a
 * ProtocolGeneration row by the caller, hence model + tokens in the result.
 */
export interface LlmCompletionInput {
  system: string;
  user: string;
  model?: LlmModel;
  /** 'json' = the reply must be one JSON value (the adapter strips code fences) */
  responseFormat?: 'text' | 'json';
  maxTokens?: number;
}

export interface ILlmCompletionProvider {
  complete(input: LlmCompletionInput): Promise<LlmResult>;
}
