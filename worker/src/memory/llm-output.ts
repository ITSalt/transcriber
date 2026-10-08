/**
 * FR-006 — validation of the JSON replies of MEMORY_EXTRACT and MEMORY_RESOLVE.
 * A reply that is not a JSON object fails the step (the job retries); individual malformed
 * entries are dropped and reported, so one bad item does not cost the whole meeting.
 */
import { z } from 'zod'
import { IsoDate, MemoryTaskStatus } from '@transcrib/shared'

export class MemoryLlmOutputError extends Error {
  constructor(step: string, detail: string) {
    super(`${step}: unusable LLM reply — ${detail}`)
    this.name = 'MemoryLlmOutputError'
  }
}

/** Strips ```json fences and parses; throws MemoryLlmOutputError unless the reply is an object. */
export function parseJsonObject(step: string, text: string): Record<string, unknown> {
  const trimmed = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start === -1 || end < start) throw new MemoryLlmOutputError(step, 'no JSON object')
  let value: unknown
  try {
    value = JSON.parse(trimmed.slice(start, end + 1))
  } catch (err) {
    throw new MemoryLlmOutputError(step, err instanceof Error ? err.message : 'invalid JSON')
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new MemoryLlmOutputError(step, 'not an object')
  return value as Record<string, unknown>
}

const optionalText = z
  .string()
  .nullish()
  .transform((v) => (v && v.trim() ? v.trim() : null))

/** invalid / absent date → null (a wrong date is not worth dropping the task) */
const optionalDate = z.unknown().transform((v) => (IsoDate.safeParse(v).success ? (v as string) : null))

const upperStatus = z.preprocess((v) => (typeof v === 'string' ? v.trim().toUpperCase() : v), MemoryTaskStatus)

export const StatusSignal = z.enum(['none', 'done', 'cancelled', 'postponed', 'in_progress', 'reopened'])
export type StatusSignal = z.infer<typeof StatusSignal>

export const ExtractedTask = z.object({
  title: z.string().trim().min(1),
  description: optionalText,
  assignee: optionalText,
  due_date: optionalDate,
  status_signal: z.preprocess((v) => (typeof v === 'string' ? v.trim().toLowerCase() : v), StatusSignal).catch('none'),
  related_task_code: optionalText,
  quote: z.string().trim().min(1),
  segment: z.coerce.number().int().min(0).nullish().catch(null),
})
export type ExtractedTask = z.infer<typeof ExtractedTask>

export const ExtractedDecision = z.object({
  text: z.string().trim().min(1),
  quote: z.string().trim().min(1),
  segment: z.coerce.number().int().min(0).nullish().catch(null),
})
export type ExtractedDecision = z.infer<typeof ExtractedDecision>

export const TaskResolution = z.object({
  item: z.string().trim().min(1),
  action: z.preprocess((v) => (typeof v === 'string' ? v.trim().toUpperCase() : v), z.enum(['NEW', 'UPDATE', 'CLOSE', 'DUPLICATE', 'NO_CHANGE'])),
  target_task_code: optionalText,
  duplicate_of_code: optionalText,
  changes: z
    .object({
      status: upperStatus.nullish().catch(null),
      assignee: optionalText,
      due_date: optionalDate,
      title: optionalText,
      description: optionalText,
    })
    .partial()
    .nullish()
    .transform((c) => c ?? {}),
  /** missing / invalid → 0: the resolution is kept, but nothing in it is applied automatically */
  confidence: z.coerce.number().min(0).max(1).catch(0),
  reason: optionalText,
})
export type TaskResolution = z.infer<typeof TaskResolution>

export const DecisionResolution = z.object({
  item: z.string().trim().min(1),
  action: z.preprocess((v) => (typeof v === 'string' ? v.trim().toUpperCase() : v), z.enum(['NEW', 'NO_CHANGE'])),
  target_decision_code: optionalText,
  /** NEW restating an existing decision: its code — no new D-n, only a mention */
  duplicate_of: optionalText,
  supersedes_code: optionalText,
  leads_to: z.array(z.string()).nullish().transform((v) => v ?? []),
  confidence: z.coerce.number().min(0).max(1).catch(1),
  reason: optionalText,
})
export type DecisionResolution = z.infer<typeof DecisionResolution>

export interface ParsedList<T> {
  valid: T[]
  /** index + zod message of each dropped entry */
  invalid: Array<{ index: number; error: string }>
}

export function parseList<T>(schema: z.ZodType<T>, value: unknown): ParsedList<T> {
  const out: ParsedList<T> = { valid: [], invalid: [] }
  if (!Array.isArray(value)) return out
  value.forEach((entry, index) => {
    const r = schema.safeParse(entry)
    if (r.success) out.valid.push(r.data)
    else out.invalid.push({ index, error: r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') })
  })
  return out
}
