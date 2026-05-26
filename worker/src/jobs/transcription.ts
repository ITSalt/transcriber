/**
 * UC-200 — Process transcription pipeline
 *
 * Main pipeline orchestrator for TranscriptionJob processing.
 * Dequeued by BullMQ worker (queue: 'transcriptionJob').
 *
 * Pipeline steps:
 *   1. Mark job PROCESSING — RQ-014
 *   2. Fetch recording stream from S3 — RQ-015
 *   3. Extract WAV audio via ffmpeg — RQ-015
 *   4. Submit to Deepgram ASR — RQ-015, RQ-018
 *   5. Resolve speaker names — RQ-017
 *   6. Persist Transcript row — step 7
 *   7. Update Meeting.status → TRANSCRIBED — BRQ-008
 *   8. Mark job DONE — RQ-014
 *   9. Auto-create ProtocolGenerationJob — RQ-016
 *  10. Publish SSE event — TECH-012
 *  ALT: On any error → FAILED path → Meeting.status=FAILED — RQ-015
 */
import type { Job } from 'bullmq'
import type { Logger } from 'pino'
import type { Readable } from 'node:stream'


import type { TranscriptionJobPayload, ProtocolGenerationJobPayload } from '@transcrib/shared'
import type { AsrResult, AsrSegment } from '@transcrib/shared'
import type { IAsrProvider } from '@transcrib/shared'

import { extractAudio } from '../lib/ffmpeg.js'
import { DeepgramAsrProvider, isTransientAsrError } from '../asr/deepgram-adapter.js'
import { publishMeetingEvent } from '../lib/publisher.js'
import { prisma } from '../lib/prisma.js'
import { createStorage } from '../lib/storage.js'
import { createQueues, QueueName } from '../queues.js'

// ─── Retry configuration (RC-UC-200 FR-001) ──────────────────────────────────
/** Maximum BullMQ attempts for a transcription job. Must match job-processor.ts defaultJobOptions. */
const MAX_ATTEMPTS = 3

// ─── Speaker name resolution (RQ-017) ────────────────────────────────────────

/**
 * Attempt to resolve anonymous diarization labels (SPEAKER_0, SPEAKER_1…)
 * to real names found in the transcript via self-introductions or addressed
 * names (BRQ-021).
 *
 * Patterns detected:
 *   - "меня зовут <Name>" / "my name is <Name>"
 *   - "I'm <Name>" / "я <Name>"
 *   - "This is <Name>" / "speaking" patterns
 *
 * Returns a speaker_map object: { "SPEAKER_0": "Ivan" | null, … }
 */
export function resolveSpeakers(
  segments: AsrSegment[],
): Record<string, string | null> {
  // Collect all unique speaker labels
  const speakerLabels = Array.from(new Set(segments.map((s) => s.speaker)))
  const speakerMap: Record<string, string | null> = {}
  for (const label of speakerLabels) {
    speakerMap[label] = null
  }

  // Self-introduction patterns (EN + RU) — RQ-017
  // Note: \b does not work reliably with Cyrillic; use lookahead/lookbehind or space anchors instead.
  const introPatterns = [
    /\bmy name is\s+([A-ZА-Яa-zа-я][A-Za-zА-Яа-я]+)/i,
    /\bI(?:'m|'m| am)\s+([A-Za-z][A-Za-z]+)/i,
    /\bthis is\s+([A-Za-z][A-Za-z]+)/i,
    /(?:^|[\s,.])меня зовут\s+([А-Яа-яA-Za-z]+)/i,
    /(?:^|[\s,.])зовите меня\s+([А-Яа-яA-Za-z]+)/i,
  ]

  for (const segment of segments) {
    // Only process if label not yet resolved
    if (speakerMap[segment.speaker] !== null) continue
    for (const pattern of introPatterns) {
      const match = pattern.exec(segment.text)
      if (match?.[1]) {
        speakerMap[segment.speaker] = match[1]
        break
      }
    }
  }

  return speakerMap
}

/**
 * Build full_text markdown from ASR segments and resolved speaker_map.
 * Format: "[MM:SS] SpeakerName: text"
 * Unresolved labels remain as 'Speaker N' (BRQ-021).
 */
export function buildFullText(
  segments: AsrSegment[],
  speakerMap: Record<string, string | null>,
): string {
  return segments
    .map((seg) => {
      const resolvedName = speakerMap[seg.speaker]
      // Map SPEAKER_0 → Speaker 1, SPEAKER_1 → Speaker 2, etc. when unresolved
      const displayLabel = resolvedName ?? speakerLabelToDisplay(seg.speaker)
      const minutes = Math.floor(seg.start / 60)
      const seconds = Math.floor(seg.start % 60)
      const timestamp = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
      return `[${timestamp}] ${displayLabel}: ${seg.text}`
    })
    .join('\n')
}

function speakerLabelToDisplay(label: string): string {
  // SPEAKER_0 → Speaker 1, SPEAKER_1 → Speaker 2
  const match = /SPEAKER_(\d+)/i.exec(label)
  if (match?.[1] !== undefined) {
    return `Speaker ${parseInt(match[1], 10) + 1}`
  }
  return label
}

/** Normalize detected language string to Prisma MeetingLanguage enum value. */
function normalizeLang(lang: string): 'RU' | 'EN' | 'AUTO' {
  const l = lang.toLowerCase()
  if (l.startsWith('ru')) return 'RU'
  if (l.startsWith('en')) return 'EN'
  return 'AUTO'
}

// ─── AudioInput collector ─────────────────────────────────────────────────────

async function extractedAudioToBuffer(audioReadable: Readable): Promise<Buffer> {
  const chunks: Buffer[] = []
  await new Promise<void>((resolve, reject) => {
    audioReadable.on('data', (chunk: Buffer | Uint8Array) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    })
    audioReadable.on('end', resolve)
    audioReadable.on('error', reject)
  })
  return Buffer.concat(chunks)
}

// ─── Main pipeline ────────────────────────────────────────────────────────────

export interface TranscriptionDeps {
  asr?: IAsrProvider
  redisUrl?: string
}

/**
 * Process a transcription job end-to-end.
 *
 * This is the real handler wired into BullMQ via job-processor.ts.
 *
 * @param job     - BullMQ Job carrying TranscriptionJobPayload
 * @param log     - Pino logger
 * @param deps    - Optional injectable deps for testing (asr, redisUrl)
 */
export async function processTranscriptionJob(
  job: Job<TranscriptionJobPayload>,
  log: Logger,
  deps?: TranscriptionDeps,
): Promise<void> {
  const { transcription_job_id, speaker_count } = job.data

  log.info(
    { jobId: job.id, transcription_job_id, speaker_count: speaker_count ?? null },
    'transcriptionJob starting',
  )

  const redisUrl = deps?.redisUrl ?? process.env['REDIS_URL'] ?? 'redis://localhost:6379'

  try {
    // ── Step 1: Load TranscriptionJob + Meeting + Recording ──────────────────
    const txJob = await prisma.transcriptionJob.findUnique({
      where: { id: transcription_job_id },
      include: {
        meeting: {
          include: { recording: true },
        },
      },
    })

    if (!txJob) {
      throw new Error(`TranscriptionJob ${transcription_job_id} not found`)
    }

    // ── Idempotency guard (BRQ-009): skip if already terminal ───────────────
    // RQ-014: TranscriptionJob lifecycle: PENDING -> PROCESSING -> {DONE, FAILED}
    if (txJob.status === 'DONE' || txJob.status === 'FAILED') {
      log.info({ transcription_job_id, status: txJob.status }, 'Job already terminal — skipping')
      return
    }

    const meeting = txJob.meeting
    const recording = meeting.recording

    if (!recording) {
      throw new Error(`Meeting ${meeting.id} has no Recording`)
    }

    // ── Step 1b: Mark PROCESSING (optimistic concurrency guard) ─────────────
    // RQ-014: only transition from PENDING, prevents double-processing
    const updated = await prisma.transcriptionJob.updateMany({
      where: { id: transcription_job_id, status: 'PENDING' },
      data: { status: 'PROCESSING', startedAt: new Date() },
    })

    if (updated.count === 0) {
      // Another worker picked it up
      log.warn({ transcription_job_id }, 'Job already claimed by another worker — skipping')
      return
    }

    // ── Step 2: Generate a short-lived HTTPS URL for ffmpeg ─────────────────
    // RQ-015: StorageNotFoundError → FAILED. ffmpeg reads the recording via
    // HTTP Range requests against this presigned URL — no full download into
    // worker memory (a 500 MB upload would have OOM'd the VM previously).
    const storage = createStorage()
    const key = storage.storageUriToKey(recording.storageUri)
    const recordingUrl = await storage.getPresignedDownloadUrl(key, 1800)

    // ── Step 3: Extract WAV audio via ffmpeg (TECH-009) ───────────────────
    // RQ-015: ffmpeg error → FAILED
    const audioReadable = extractAudio(recordingUrl)
    const audioBuffer = await extractedAudioToBuffer(audioReadable)

    // ── Step 4: Submit to Deepgram ASR (TECH-010) ─────────────────────────
    // RQ-018: Pass Meeting.language as hint; null → auto-detect
    const asr = deps?.asr ?? new DeepgramAsrProvider()
    const languageHint = meeting.language === 'AUTO' ? null : meeting.language

    const asrResult: AsrResult = await asr.transcribe({
      audio: audioBuffer,
      languageHint,
      speakerCount: speaker_count ?? null,
    })

    // ── Step 5+6: Resolve speaker names (RQ-017) ──────────────────────────
    const speakerMap = resolveSpeakers(asrResult.segments)
    const fullText = buildFullText(asrResult.segments, speakerMap)

    const segmentsCount = asrResult.segments.length
    const speakersCount = asrResult.speakers.length

    // ── RQ-018: Persist detected language to Transcript ───────────────────
    const detectedLang = normalizeLang(asrResult.detectedLanguage)

    // ── Step 7+8+9: Persist Transcript + update Meeting + mark DONE ───────
    // All writes in a single transaction (BRQ-008: Meeting.status mirror)
    const transcript = await prisma.$transaction(async (tx) => {
      // Persist Transcript
      const newTranscript = await tx.transcript.create({
        data: {
          meetingId: meeting.id,
          rawText: fullText,
          speakerMap: speakerMap as object,
          segmentsBlob: asrResult.segments as object[],
        },
      })

      // Update Recording.duration_sec if ASR reported it (step 3)
      if (asrResult.durationSec > 0) {
        await tx.recording.update({
          where: { id: recording.id },
          data: { durationSec: asrResult.durationSec },
        })
      }

      // BRQ-008: Transition Meeting.status → TRANSCRIBED
      await tx.meeting.update({
        where: { id: meeting.id },
        data: { status: 'TRANSCRIBED' },
      })

      // RQ-014: Mark job DONE (terminal immutable per BRQ-009)
      // Guard with WHERE status='PROCESSING' to enforce immutability
      await tx.transcriptionJob.updateMany({
        where: { id: transcription_job_id, status: 'PROCESSING' },
        data: { status: 'DONE', finishedAt: new Date() },
      })

      return newTranscript
    })

    log.info(
      { transcription_job_id, transcript_id: transcript.id, segmentsCount, speakersCount, detectedLang },
      'Transcript persisted',
    )

    // ── Step 10: Auto-create ProtocolGenerationJob (RQ-016) ───────────────
    // BRQ-007: exactly one ProtocolGenerationJob per completed TranscriptionJob
    const protoJob = await prisma.protocolGenerationJob.create({
      data: {
        meetingId: meeting.id,
        status: 'PENDING',
      },
    })

    log.info({ meetingId: meeting.id, protoJobId: protoJob.id }, 'ProtocolGenerationJob created (RQ-016)')

    // Enqueue to BullMQ so UC-300 worker picks it up (after-commit side effect)
    const queues = createQueues(redisUrl)
    const payload: ProtocolGenerationJobPayload = { protocol_generation_job_id: protoJob.id }
    try {
      await queues[QueueName.Protocol].add('generateProtocol', payload)
    } finally {
      await queues[QueueName.Protocol].close()
    }

    log.info({ protoJobId: protoJob.id }, 'ProtocolGenerationJob enqueued to BullMQ (RQ-016)')

    // ── Step 11: Publish SSE 'meeting.status' event (TECH-012) ────────────
    await publishMeetingEvent(
      redisUrl,
      {
        type: 'meeting.status',
        meeting_id: meeting.id,
        status: 'TRANSCRIBED',
        error_reason: null,
      },
      meeting.id,
    )

    log.info({ jobId: job.id, transcription_job_id }, 'transcriptionJob completed')
  } catch (err) {
    // ── ALT: Failure path (RQ-015, FR-001) ───────────────────────────────────
    //
    // FR-001 retry semantics (RC-UC-200):
    //   - TRANSIENT error (DeepgramAsrError.isTransient=true, e.g. 429/5xx) with
    //     attempts remaining → re-throw WITHOUT writing FAILED so BullMQ schedules
    //     the next attempt. The BRQ-009 idempotency guard must NOT see a FAILED row.
    //   - PERMANENT error (storage-not-found, ffmpeg, non-retriable ASR 4xx) OR
    //     final exhausted attempt → write FAILED + Meeting.status=FAILED.
    //   - attempt_count mirrors job.attemptsMade on every FAILED write (TECH-026).

    const errorMessage = err instanceof Error ? err.message : String(err)
    const attemptsMade: number = typeof job.attemptsMade === 'number'
      ? job.attemptsMade
      : 0
    const isFinalAttempt = attemptsMade >= MAX_ATTEMPTS - 1

    // Determine if this is a transient error we should let BullMQ retry.
    // isTransientAsrError returns true only for DeepgramAsrError with isTransient=true.
    const shouldRetry = isTransientAsrError(err) && !isFinalAttempt

    log.error(
      {
        jobId: job.id,
        transcription_job_id,
        error: errorMessage,
        attemptsMade,
        isFinalAttempt,
        shouldRetry,
      },
      shouldRetry ? 'transcriptionJob transient failure — will retry' : 'transcriptionJob failed',
    )

    if (shouldRetry) {
      // Do NOT write FAILED — let BullMQ retry with backoff.
      // Re-throw so BullMQ sees the error and schedules the next attempt.
      throw err
    }

    // Permanent failure or final attempt: write FAILED + Meeting.status=FAILED.
    // Guard: only update if not already terminal (BRQ-009)
    try {
      await prisma.$transaction(async (tx) => {
        await tx.transcriptionJob.updateMany({
          where: { id: transcription_job_id, status: { in: ['PENDING', 'PROCESSING'] } },
          data: {
            status: 'FAILED',
            errorMsg: errorMessage,
            finishedAt: new Date(),
            attemptCount: attemptsMade + 1,
          },
        })

        const failedJob = await tx.transcriptionJob.findUnique({ where: { id: transcription_job_id } })
        if (failedJob?.meetingId) {
          await tx.meeting.updateMany({
            where: { id: failedJob.meetingId },
            data: { status: 'FAILED' },
          })
        }
      })
    } catch (dbErr) {
      log.error({ error: dbErr instanceof Error ? dbErr.message : String(dbErr) }, 'Failed to persist FAILED state')
    }

    // Publish FAILED SSE event — best effort
    try {
      // Resolve meetingId for the event even if transaction partially failed
      const txJobForEvent = await prisma.transcriptionJob.findUnique({
        where: { id: transcription_job_id },
        select: { meetingId: true },
      })
      if (txJobForEvent) {
        await publishMeetingEvent(
          redisUrl,
          {
            type: 'meeting.status',
            meeting_id: txJobForEvent.meetingId,
            status: 'FAILED',
            error_reason: errorMessage,
          },
          txJobForEvent.meetingId,
        )
      }
    } catch {
      // Best-effort — do not throw
    }

    // Re-throw so BullMQ records the failure — RQ-014
    throw err
  }
}
