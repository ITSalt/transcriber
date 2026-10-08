/**
 * UC-300 — protocol prompt assembly (RQ-022, RQ-049, RQ-051, RQ-060).
 *
 * Two template variants per language:
 *   prompts/<lang>/protocol.md          — no context: the pre-FR-004 prompt, unchanged
 *   prompts/<lang>/protocol-context.md  — at least one context section is non-empty
 *
 * Keeping the no-context template untouched is what makes a meeting without context
 * produce the pre-program request byte for byte (DEC-010, D-3). The context rules
 * (context is data, transcript over agenda, speaker mapping, T-n codes) only mean
 * something when context is present, so they live in the context variant.
 *
 * Both the kie.ai adapter (to build the request) and the protocol job (to record
 * prompt_version and archive the rendered prompt) use these functions, so what is
 * recorded is exactly what was sent.
 */
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, dirname } from 'node:path'
import {
  LLM_CONTEXT_SECTION_ORDER,
  isLlmContextEmpty,
  renderLlmContextSections,
  type LlmContextSections,
} from '@transcrib/shared'

const PROMPTS_DIR = join(dirname(fileURLToPath(import.meta.url)), 'prompts')

export interface ProtocolSystemPrompt {
  /** Template text sent as the `system` field. */
  text: string
  /** RQ-051: sha256 (hex) of the template file bytes — ProtocolGeneration.prompt_version. */
  version: string
  /** Template path relative to the prompts directory, e.g. "ru/protocol-context.md". */
  file: string
}

/** True when the request carries context sections (and therefore uses the context template). */
export function hasProtocolContext(context: LlmContextSections | undefined): boolean {
  return !isLlmContextEmpty(context)
}

/** RQ-022 / RQ-060: the template for this language and context mode, with its version. */
export function loadProtocolSystemPrompt(language: 'RU' | 'EN', withContext: boolean): ProtocolSystemPrompt {
  const file = `${language === 'RU' ? 'ru' : 'en'}/${withContext ? 'protocol-context.md' : 'protocol.md'}`
  const bytes = readFileSync(join(PROMPTS_DIR, file))
  return {
    text: bytes.toString('utf-8'),
    version: createHash('sha256').update(bytes).digest('hex'),
    file,
  }
}

/** Same tag shapes the shared renderer neutralises inside sections, plus <transcript>. */
const SECTION_TAG = new RegExp(
  `<\\s*(\\/?)\\s*(${[...LLM_CONTEXT_SECTION_ORDER, 'transcript'].join('|')})\\s*>`,
  'gi',
)

/**
 * RQ-049: the user message. No non-empty section → the transcript exactly as before
 * (no wrapping, no escaping). Otherwise the sections in canonical order (shared
 * renderer), then <transcript>…</transcript> with any section tag inside the transcript
 * neutralised the same way, so a spoken "</transcript>" cannot end the block.
 */
export function renderProtocolUserMessage(transcript: string, context: LlmContextSections | undefined): string {
  if (!hasProtocolContext(context)) return transcript
  const escaped = transcript.replace(SECTION_TAG, (_m, slash: string, name: string) => `<\\${slash}${name}>`)
  return `${renderLlmContextSections(context)}\n\n<transcript>\n${escaped}\n</transcript>`
}
