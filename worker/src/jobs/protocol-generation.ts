/**
 * UC-300 — Process protocol generation pipeline
 *
 * Main pipeline orchestrator for ProtocolGenerationJob processing.
 * Dequeued by BullMQ worker (queue: 'protocolGenerationJob').
 *
 * Pipeline steps:
 *   1. Mark job IN_PROGRESS (PROCESSING) — RQ-021
 *   2. Load Transcript, frozen MeetingContext and project memory — RQ-022, RQ-059, RQ-062
 *   3. Select prompt template per Meeting.language (RU/EN) and context mode — RQ-022, RQ-060
 *   4. Call KieAiLlmProvider.generate with the context sections — TECH-011, RQ-049
 *   5. Validate four required sections in markdown output — RQ-023
 *   6. Archive the rendered user prompt in S3 (best effort) — RQ-061
 *   7. Persist Protocol (version=1) + ProtocolGeneration + ProtocolVersion(1, GENERATED)
 *      in one transaction — RQ-025, RQ-050, RQ-051
 *   8. Transition Meeting.status → PROTOCOL_READY — RQ-025 / BRQ-008
 *   9. Transition ProtocolGenerationJob.status → DONE — RQ-021
 *  10. Publish SSE 'meeting.status' event — TECH-012
 *  ALT: On any error → FAILED path — RQ-026
 */
import { randomUUID } from 'node:crypto'
import type { Job } from 'bullmq'
import type { Logger } from 'pino'

import type { ProtocolGenerationJobPayload, ProjectMemoryProvider } from '@transcrib/shared'
import type { ILlmProvider, LlmModel } from '@transcrib/shared'
import {
  LLM_MODEL_DEFAULT,
  JOB_RETRY_ATTEMPTS,
  LEGACY_WORKSPACE_ID,
  getProjectMemoryProvider,
} from '@transcrib/shared'

import { KieAiLlmProvider, isTransientLlmError } from '../llm/kieai.js'
import {
  hasProtocolContext,
  loadProtocolSystemPrompt,
  renderProtocolUserMessage,
} from '../llm/protocol-prompt.js'
import { buildProtocolContext } from '../llm/protocol-context.js'
import { buildAsrKeyterms, frozenContextSnapshot, isAsrKeytermsEnabled } from '../asr/keyterms.js'
import { DEEPGRAM_MODEL } from '../asr/deepgram-adapter.js'
import { publishMeetingEvent } from '../lib/publisher.js'
import { prisma } from '../lib/prisma.js'
import { createStorage, type WorkerS3Storage } from '../lib/storage.js'
import { resolveProtocolLanguage } from '../lib/language.js'

// ─── Retry configuration (RC-UC-300 FR-001) ──────────────────────────────────
/**
 * Fallback attempt budget, used only when a job carries no `opts` (test fixtures;
 * a real BullMQ Job always does). The authoritative budget is whatever the
 * PRODUCER stamped on the job — see `resolveMaxAttempts` below (F-004).
 */
const MAX_ATTEMPTS = JOB_RETRY_ATTEMPTS

/**
 * F-004: the retry budget is read from the job, never from a local constant.
 *
 * BullMQ's own decision is `attemptsMade + 1 < opts.attempts`
 * (`Job.shouldRetryJob`), so mirroring it here makes the worker's FAILED-write
 * decision provably agree with whether BullMQ will actually re-run the job.
 *
 * `??` is load-bearing and must NOT become `||`: a producer with no
 * `defaultJobOptions` yields `opts.attempts === 0` (the BullMQ `Job` constructor
 * default), and `||` would silently rewrite that to 3 — stranding the meeting in
 * a non-terminal state with no retry left, which is exactly the F-004 symptom.
 * The fallback fires only when `opts` is absent entirely.
 */
function resolveMaxAttempts(job: { opts?: { attempts?: number } }): number {
  return job.opts?.attempts ?? MAX_ATTEMPTS
}

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
export const PROTOCOL_PROMPT_TEMPLATE_VERSION = '1.1.0'

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
  /** Prompt archive (RQ-061). Defaults to createStorage() from env. */
  storage?: Pick<WorkerS3Storage, 'putObject' | 'keyToStorageUri'>
  /** <project_memory> source (RQ-062). Defaults to the process-wide provider. */
  memory?: ProjectMemoryProvider
  /** Environment for ASR_KEYTERMS_ENABLED. Defaults to process.env. */
  env?: Record<string, string | undefined>
}

// ─── Context, memory, prompt archive ─────────────────────────────────────────

/**
 * RQ-061: upper bound for the prompt archive PUT. The archive is audit, not the product:
 * an S3 that accepts the connection and then hangs must not keep the protocol unsaved.
 */
export const PROMPT_ARCHIVE_TIMEOUT_MS = 15_000

/**
 * RQ-062: <project_memory> only for a project meeting, filtered by workspace AND
 * project. A failing provider must not cost the user a protocol (D-19): the section
 * is omitted and the generation goes on.
 */
async function loadProjectMemory(
  provider: ProjectMemoryProvider,
  projectId: string | null,
  workspaceId: string,
  log: Logger,
): Promise<string | null> {
  if (!projectId) return null
  try {
    return await provider.getPromptMemory(projectId, workspaceId)
  } catch (err) {
    log.warn(
      { projectId, workspaceId, error: err instanceof Error ? err.message : String(err) },
      'Project memory unavailable — <project_memory> omitted',
    )
    return null
  }
}

/**
 * RQ-051 / RQ-061: the rendered user prompt goes to
 * ws/<workspaceId>/prompts/<generationId>.txt. Best effort — an archive outage
 * leaves prompt_uri NULL instead of failing the protocol.
 */
async function archivePrompt(
  storage: ProtocolGenerationDeps['storage'] | undefined,
  workspaceId: string,
  generationId: string,
  userMessage: string,
  log: Logger,
): Promise<string | null> {
  const key = `ws/${workspaceId}/prompts/${generationId}.txt`
  try {
    const target = storage ?? createStorage()
    let timer: NodeJS.Timeout | undefined
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`prompt archive timed out after ${PROMPT_ARCHIVE_TIMEOUT_MS} ms`)),
        PROMPT_ARCHIVE_TIMEOUT_MS,
      )
    })
    try {
      await Promise.race([
        target.putObject(key, Buffer.from(userMessage, 'utf-8'), 'text/plain; charset=utf-8'),
        timeout,
      ])
    } finally {
      clearTimeout(timer)
    }
    return target.keyToStorageUri(key)
  } catch (err) {
    log.warn(
      { generationId, key, error: err instanceof Error ? err.message : String(err) },
      'Protocol prompt not archived — prompt_uri left NULL',
    )
    return null
  }
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
          // FR-004: the frozen context snapshot feeds the prompt sections (RQ-049, RQ-059)
          include: { transcript: true, context: true },
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
    // PROCESSING is also claimable: RC-UC-300.recovery_procedure requires that
    // after a process crash "another worker picks up". BullMQ only re-delivers
    // once the lock has expired and worker concurrency is 1, so a PROCESSING row
    // here means the previous holder died. Terminal states cannot reach this
    // line — the BRQ-009 guard above returns early on DONE/FAILED — so widening
    // the filter does not weaken terminal immutability.
    const updated = await prisma.protocolGenerationJob.updateMany({
      where: { id: protocol_generation_job_id, status: { in: ['PENDING', 'PROCESSING'] } },
      data: { status: 'PROCESSING', startedAt: new Date() },
    })

    if (updated.count === 0) {
      // Genuinely anomalous. Throwing routes it through the normal
      // retry/failure path; returning would ACK the job while the meeting stayed
      // in GENERATING_PROTOCOL forever.
      throw new Error(
        `ProtocolGenerationJob ${protocol_generation_job_id} could not be claimed (row vanished or is terminal)`,
      )
    }

    // ── Step 2: Determine language for prompt selection ──────────────────────
    // RQ-022 / BRQ-013 (DEC-003): Russian by default; English only when the author
    // explicitly selected EN. The transcript's own language is NOT consulted — see
    // resolveProtocolLanguage() for why that separation matters.
    //
    // INVARIANT: this single `language` value MUST be the one passed to BOTH
    // llm.generate() and validateProtocolSections(). If they ever diverge, a
    // wrong-language response validates against its own headings and persists
    // silently — which is precisely how the 2026-08-14 defect went unnoticed.
    const language = resolveProtocolLanguage(meeting.language)

    // ── Step 2b: Context snapshot + project memory (FR-004, FR-006) ──────────
    // RQ-059: only a frozen snapshot counts; RQ-062: memory only for a project meeting.
    // With neither, `context` is undefined and the request below is byte-for-byte the
    // pre-program one (RQ-049).
    const workspaceId = meeting.workspaceId ?? LEGACY_WORKSPACE_ID
    const frozen = frozenContextSnapshot(meeting.context, (message) =>
      log.warn({ protocol_generation_job_id, meetingId: meeting.id }, message),
    )
    const memory = await loadProjectMemory(
      deps?.memory ?? getProjectMemoryProvider(),
      meeting.projectId ?? null,
      workspaceId,
      log,
    )
    const context = buildProtocolContext({
      snapshot: frozen?.snapshot ?? null,
      memory,
      meeting: { title: meeting.title, createdAt: meeting.createdAt },
      language,
    })

    // ── Step 3: Build prompt from transcript text ────────────────────────────
    // RQ-022: full transcript text passed as user prompt; system prompt (template) chosen by
    // language and, since FR-004, by whether there is any context (RQ-060).
    const transcriptText = transcript.rawText ?? ''
    const model: LlmModel = LLM_MODEL_DEFAULT

    // ── Step 4: Call LLM provider (TECH-011) ─────────────────────────────────
    const llm: ILlmProvider = deps?.llm ?? new KieAiLlmProvider()
    const llmResult = await llm.generate({
      prompt: transcriptText,
      model,
      language,
      ...(context ? { context } : {}),
    })

    // ── Step 5: Validate required sections (RQ-023) ──────────────────────────
    const sectionError = validateProtocolSections(llmResult.text, language)
    if (sectionError !== null) {
      // RQ-023: missing section → FAILED path
      throw new Error(sectionError)
    }

    // ── Step 6: Generation audit record (RQ-051) ─────────────────────────────
    // The same functions the adapter used, so what is recorded is what was sent.
    // keyterms/asr_options are rebuilt from the same frozen snapshot and flag the
    // transcription used — the schema keeps no separate record of the ASR call.
    const generationId = randomUUID()
    const promptVersion = loadProtocolSystemPrompt(language, hasProtocolContext(context)).version
    const keytermsEnabled = isAsrKeytermsEnabled(deps?.env ?? process.env)
    const keyterms = keytermsEnabled && frozen ? buildAsrKeyterms(frozen.snapshot) : []
    const asrOptions = {
      source: 'reconstructed',
      provider: 'deepgram',
      model: DEEPGRAM_MODEL,
      language_hint: meeting.language === 'AUTO' ? null : meeting.language,
      keyterms_enabled: keytermsEnabled,
      keyterm_count: keyterms.length,
    }
    const promptUri = await archivePrompt(
      deps?.storage,
      workspaceId,
      generationId,
      renderProtocolUserMessage(transcriptText, context),
      log,
    )

    // ── Step 7+8+9: Persist Protocol + generation + version, update Meeting, DONE ─
    // All writes in a single transaction (BRQ-008: Meeting.status mirror; RQ-050: the
    // first version is written with the Protocol it describes)
    await prisma.$transaction(async (tx) => {
      // RQ-025: Insert Protocol(version=1, edit_count=0 implicit, generated_at=now)
      await tx.protocol.create({
        data: {
          meetingId: meeting.id,
          markdownContent: llmResult.text,
          version: 1,
        },
      })

      // RQ-051: what produced this protocol
      await tx.protocolGeneration.create({
        data: {
          id: generationId,
          meetingId: meeting.id,
          kind: 'PROTOCOL',
          model: llmResult.model,
          promptVersion,
          contextSnapshotHash: frozen?.hash ?? null,
          keyterms,
          asrOptions,
          inputTokens: llmResult.tokensIn,
          outputTokens: llmResult.tokensOut,
          promptUri,
        },
      })

      // RQ-050: immutable history starts with the generated text
      await tx.protocolVersion.create({
        data: {
          meetingId: meeting.id,
          n: 1,
          kind: 'GENERATED',
          markdown: llmResult.text,
          generationId,
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
      {
        protocol_generation_job_id,
        meetingId: meeting.id,
        model,
        language,
        generationId,
        withContext: context !== undefined,
        withMemory: memory !== null,
        promptArchived: promptUri !== null,
      },
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
    const isFinalAttempt = attemptsMade >= resolveMaxAttempts(job) - 1

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
