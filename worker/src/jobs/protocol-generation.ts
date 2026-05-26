/**
 * UC-300 — Process protocol generation pipeline
 *
 * Main pipeline orchestrator for ProtocolGenerationJob processing.
 * Dequeued by BullMQ worker (queue: 'protocolGenerationJob').
 *
 * Pipeline steps:
 *   1. Mark job IN_PROGRESS (PROCESSING) — RQ-021
 *   2. Load Transcript via Meeting relation — RQ-022
 *   3. Select prompt template per Transcript language (RU/EN) — RQ-022
 *   4. Call KieAiLlmProvider.generate — TECH-011
 *   5. Validate four required sections in markdown output — RQ-023
 *   6. Persist Protocol row (version=1) — RQ-025
 *   7. Transition Meeting.status → PROTOCOL_READY — RQ-025 / BRQ-008
 *   8. Transition ProtocolGenerationJob.status → DONE — RQ-021
 *   9. Publish SSE 'meeting.status' event — TECH-012
 *  ALT: On any error → FAILED path — RQ-026
 */
import type { Job } from 'bullmq'
import type { Logger } from 'pino'

import type { ProtocolGenerationJobPayload } from '@transcrib/shared'
import type { ILlmProvider, LlmModel } from '@transcrib/shared'
import { LLM_MODEL_DEFAULT } from '@transcrib/shared'

import { KieAiLlmProvider, isTransientLlmError } from '../llm/kieai.js'
import { publishMeetingEvent } from '../lib/publisher.js'
import { prisma } from '../lib/prisma.js'

// ─── Retry configuration (RC-UC-300 FR-001) ──────────────────────────────────
/** Maximum BullMQ attempts for a protocol generation job. Must match queues.ts defaultJobOptions. */
const MAX_ATTEMPTS = 3

// ─── Required section headers ─────────────────────────────────────────────────

/**
 * RQ-023: Four required section headers per language.
 * EN: Participants, Discussion, Decisions, Action Items
 * RU: Участники, Обсуждение, Решения, Задачи
 */
const REQUIRED_SECTIONS: Record<'RU' | 'EN', string[]> = {
  EN: ['## Participants', '## Discussion', '## Decisions', '## Action Items'],
  RU: ['## Участники', '## Обсуждение', '## Решения', '## Задачи'],
}

// ─── Prompt template version ──────────────────────────────────────────────────

/** RQ-022: prompt_template_version recorded on job for audit trail. */
export const PROTOCOL_PROMPT_TEMPLATE_VERSION = '1.0.0'

// ─── Section validation ───────────────────────────────────────────────────────

/**
 * RQ-023: Validate that the LLM output contains all four required sections.
 * Returns null on success, or a descriptive error string on failure.
 */
export function validateProtocolSections(
  markdown: string,
  language: 'RU' | 'EN',
): string | null {
  const required = REQUIRED_SECTIONS[language]
  const missing = required.filter((section) => !markdown.includes(section))
  if (missing.length > 0) {
    return `Protocol is missing required sections: ${missing.join(', ')}`
  }
  return null
}

// ─── Deps interface (for testing) ────────────────────────────────────────────

export interface ProtocolGenerationDeps {
  llm?: ILlmProvider
  redisUrl?: string
}

// ─── Main pipeline ────────────────────────────────────────────────────────────

/**
 * Process a protocol generation job end-to-end.
 *
 * @param job  - BullMQ Job carrying ProtocolGenerationJobPayload
 * @param log  - Pino logger
 * @param deps - Optional injectable deps for testing (llm, redisUrl)
 */
export async function processProtocolGenerationJob(
  job: Job<ProtocolGenerationJobPayload>,
  log: Logger,
  deps?: ProtocolGenerationDeps,
): Promise<void> {
  const { protocol_generation_job_id } = job.data

  log.info({ jobId: job.id, protocol_generation_job_id }, 'protocolGenerationJob starting')

  const redisUrl = deps?.redisUrl ?? process.env['REDIS_URL'] ?? 'redis://localhost:6379'

  try {
    // ── Step 1: Load ProtocolGenerationJob + Meeting + Transcript ────────────
    const pgJob = await prisma.protocolGenerationJob.findUnique({
      where: { id: protocol_generation_job_id },
      include: {
        meeting: {
          include: { transcript: true },
        },
      },
    })

    if (!pgJob) {
      throw new Error(`ProtocolGenerationJob ${protocol_generation_job_id} not found`)
    }

    // ── Idempotency guard (BRQ-009): skip if already terminal ───────────────
    // RQ-021: terminal states are DONE and FAILED — immutable
    if (pgJob.status === 'DONE' || pgJob.status === 'FAILED') {
      log.info(
        { protocol_generation_job_id, status: pgJob.status },
        'ProtocolGenerationJob already terminal — skipping',
      )
      return
    }

    const meeting = pgJob.meeting

    if (!meeting) {
      throw new Error(`ProtocolGenerationJob ${protocol_generation_job_id} has no associated Meeting`)
    }

    const transcript = meeting.transcript

    if (!transcript) {
      throw new Error(`Meeting ${meeting.id} has no Transcript`)
    }

    // ── Step 1b: Mark IN_PROGRESS (optimistic concurrency guard) ────────────
    // RQ-021: only transition from PENDING, prevents double-processing (BRQ-009)
    const updated = await prisma.protocolGenerationJob.updateMany({
      where: { id: protocol_generation_job_id, status: 'PENDING' },
      data: { status: 'PROCESSING', startedAt: new Date() },
    })

    if (updated.count === 0) {
      // Another worker picked it up
      log.warn({ protocol_generation_job_id }, 'ProtocolGenerationJob already claimed — skipping')
      return
    }

    // ── Step 2: Determine language for prompt selection ──────────────────────
    // RQ-022: language determined from Meeting.language; fall back to EN
    const rawLang = meeting.language
    const language: 'RU' | 'EN' = rawLang === 'RU' ? 'RU' : 'EN'

    // ── Step 3: Build prompt from transcript text ────────────────────────────
    // RQ-022: full transcript text passed as user prompt; system prompt (template) chosen by language
    const transcriptText = transcript.rawText ?? ''
    const model: LlmModel = LLM_MODEL_DEFAULT

    // ── Step 4: Call LLM provider (TECH-011) ─────────────────────────────────
    const llm: ILlmProvider = deps?.llm ?? new KieAiLlmProvider()
    const llmResult = await llm.generate({ prompt: transcriptText, model, language })

    // ── Step 5: Validate required sections (RQ-023) ──────────────────────────
    const sectionError = validateProtocolSections(llmResult.text, language)
    if (sectionError !== null) {
      // RQ-023: missing section → FAILED path
      throw new Error(sectionError)
    }

    // ── Step 6+7+8: Persist Protocol + update Meeting + mark DONE ────────────
    // All writes in a single transaction (BRQ-008: Meeting.status mirror)
    await prisma.$transaction(async (tx) => {
      // RQ-025: Insert Protocol(version=1, edit_count=0 implicit, generated_at=now)
      await tx.protocol.create({
        data: {
          meetingId: meeting.id,
          markdownContent: llmResult.text,
          version: 1,
        },
      })

      // RQ-025 / BRQ-008: Transition Meeting.status → PROTOCOL_READY
      await tx.meeting.update({
        where: { id: meeting.id },
        data: { status: 'PROTOCOL_READY' },
      })

      // RQ-021: Mark job DONE (terminal immutable per BRQ-009)
      // Guard with WHERE status='PROCESSING' to enforce immutability
      await tx.protocolGenerationJob.updateMany({
        where: { id: protocol_generation_job_id, status: 'PROCESSING' },
        data: {
          status: 'DONE',
          finishedAt: new Date(),
          errorMsg: null,
        },
      })
    })

    log.info(
      { protocol_generation_job_id, meetingId: meeting.id, model, language },
      'Protocol persisted',
    )

    // ── Step 9: Publish SSE 'meeting.status' event (TECH-012) ─────────────────
    await publishMeetingEvent(
      redisUrl,
      {
        type: 'meeting.status',
        meeting_id: meeting.id,
        status: 'PROTOCOL_READY',
        error_reason: null,
      },
      meeting.id,
    )

    log.info({ jobId: job.id, protocol_generation_job_id }, 'protocolGenerationJob completed')
  } catch (err) {
    // ── ALT: Failure path (RQ-026, FR-001) ────────────────────────────────────
    //
    // FR-001 retry semantics (RC-UC-300):
    //   - TRANSIENT error (KieAiLlmError.isTransient=true, e.g. 429/5xx) with
    //     attempts remaining → re-throw WITHOUT writing FAILED so BullMQ schedules
    //     the next attempt. The BRQ-009 idempotency guard must NOT see a FAILED row.
    //   - PERMANENT error (parse error, missing-section, 401/400/404) OR
    //     final exhausted attempt → write FAILED + Meeting.status=FAILED.
    //   - attempt_count mirrors job.attemptsMade on every FAILED write (TECH-026).

    const errorMessage = err instanceof Error ? err.message : String(err)
    const attemptsMade: number = typeof job.attemptsMade === 'number'
      ? job.attemptsMade
      : 0
    const isFinalAttempt = attemptsMade >= MAX_ATTEMPTS - 1

    // Determine if this is a transient error we should let BullMQ retry.
    // isTransientLlmError returns true only for KieAiLlmError with isTransient=true.
    const shouldRetry = isTransientLlmError(err) && !isFinalAttempt

    log.error(
      {
        jobId: job.id,
        protocol_generation_job_id,
        error: errorMessage,
        attemptsMade,
        isFinalAttempt,
        shouldRetry,
      },
      shouldRetry ? 'protocolGenerationJob transient failure — will retry' : 'protocolGenerationJob failed',
    )

    if (shouldRetry) {
      // Do NOT write FAILED — let BullMQ retry with backoff.
      // Re-throw so BullMQ sees the error and schedules the next attempt.
      throw err
    }

    // Permanent failure or final attempt: write FAILED + Meeting.status=FAILED.
    // Guard: only update if not already terminal (BRQ-009)
    let meetingIdForEvent: string | undefined
    try {
      await prisma.$transaction(async (tx) => {
        await tx.protocolGenerationJob.updateMany({
          where: { id: protocol_generation_job_id, status: { in: ['PENDING', 'PROCESSING'] } },
          data: {
            status: 'FAILED',
            errorMsg: errorMessage,
            finishedAt: new Date(),
            attemptCount: attemptsMade + 1,
          },
        })

        const pgJobForMeeting = await tx.protocolGenerationJob.findUnique({
          where: { id: protocol_generation_job_id },
          select: { meetingId: true },
        })
        meetingIdForEvent = pgJobForMeeting?.meetingId

        if (pgJobForMeeting) {
          await tx.meeting.updateMany({
            where: { id: pgJobForMeeting.meetingId },
            data: { status: 'FAILED' },
          })
        }
      })
    } catch (dbErr) {
      log.error(
        { error: dbErr instanceof Error ? dbErr.message : String(dbErr) },
        'Failed to persist FAILED state',
      )
    }

    // RQ-026: Publish FAILED SSE event — best effort
    try {
      if (!meetingIdForEvent) {
        const pgJobForEvent = await prisma.protocolGenerationJob.findUnique({
          where: { id: protocol_generation_job_id },
          select: { meetingId: true },
        })
        meetingIdForEvent = pgJobForEvent?.meetingId
      }

      if (meetingIdForEvent) {
        await publishMeetingEvent(
          redisUrl,
          {
            type: 'meeting.status',
            meeting_id: meetingIdForEvent,
            status: 'FAILED',
            error_reason: errorMessage,
          },
          meetingIdForEvent,
        )
      }
    } catch {
      // Best-effort — do not throw
    }

    // Re-throw so BullMQ records the failure — RQ-021
    throw err
  }
}
