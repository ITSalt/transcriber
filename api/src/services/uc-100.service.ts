/**
 * UC-100-BE — Upload meeting video: service layer
 *
 * Implements finalization of a TUS upload:
 *   1. Validate that the upload object exists in S3 (via TUS store metadata)
 *   2. Probe the container via ffprobe (RQ-010)
 *   3. In a single DB transaction:
 *      - Insert Meeting (status=UPLOADING, language, title) (RQ-013, RQ-012)
 *      - Insert Recording (filename, size_bytes, mime_type, storage_path)
 *      - Insert TranscriptionJob (status=PENDING)
 *      - Transition Meeting.status UPLOADING -> TRANSCRIBING (RQ-011, BRQ-008)
 *   4. Enqueue BullMQ job (RQ-011)
 *   5. Return { meeting_id, status: 'TRANSCRIBING' }
 *
 * Error mapping:
 *   CONTAINER_INVALID (422) — ffprobe rejected the container
 *   STORAGE_WRITE_FAILED (500) — S3 access failure
 *   INTERNAL_ERROR (500) — unhandled
 */
import { prisma } from '../db.js'
import { AppError } from '../plugins/errors.js'
import { addTranscriptionJob } from '../queue.js'
import { S3StorageProvider, s3ConfigFromEnv } from '../storage/s3-adapter.js'
import type { UploadFinalizeResponse } from '@transcrib/shared'
import { MAX_UPLOAD_DURATION_SEC } from '@transcrib/shared'

/** Input gathered after S3 multipart upload is complete */
export interface FinalizeUploadInput {
  /** S3 object key of the uploaded file (e.g. 'pending/uuid.mp4') */
  s3Key: string
  /** Original filename (for default title fallback) */
  filename: string
  /** MIME type of the uploaded file */
  mimeType: string
  /** Size in bytes */
  sizeBytes: number
  /** S3 bucket name (used to construct storage_uri) */
  bucket: string
  /** Optional meeting title (RQ-013: defaults to filename without extension) */
  title?: string
  /** Optional language hint (RQ-012: null = auto-detect) */
  language?: string
  /**
   * Optional user-supplied speaker count hint. Propagated to the worker via
   * the BullMQ payload; the worker passes it to Deepgram as min/max_speakers.
   */
  speakerCount?: number | null
  /** Whether container has been probed externally — if false, we probe here */
  skipProbe?: boolean
}

/** Map MIME string to Prisma VideoMimeType enum value */
const MIME_TO_PRISMA: Record<string, string> = {
  'video/mp4': 'VIDEO_MP4',
  'video/webm': 'VIDEO_WEBM',
  'video/quicktime': 'VIDEO_MOV',
  'video/x-msvideo': 'VIDEO_AVI',
  'video/x-matroska': 'VIDEO_MKV',
}

/** Map language hint string to Prisma MeetingLanguage enum value */
const LANGUAGE_TO_PRISMA: Record<string, string> = {
  RU: 'RU',
  EN: 'EN',
  AUTO: 'AUTO',
}

/**
 * Probe the container using fluent-ffmpeg/ffprobe.
 * Returns true when valid; false when corrupt or unrecognized.
 *
 * Input must be something ffprobe can open: an HTTPS URL (browser-style),
 * a local filesystem path, or a pipe. The `s3://` URI used internally as
 * the storage reference (ADR-004) is NOT a valid ffprobe input — callers
 * must convert it to a presigned HTTPS URL first via S3StorageProvider.
 *
 * RQ-010: Verify container integrity at upload acceptance.
 */
export interface ProbeResult {
  valid: boolean
  /** Container duration in seconds; null when ffprobe reported none. */
  durationSec: number | null
}

/**
 * RQ-010 (integrity) + RQ-039 (duration gate).
 *
 * Returns the probed duration alongside validity. It used to return a bare
 * boolean and throw the duration away — while RQ-039 needs exactly that number,
 * and `Recording.duration_sec` has always existed in the schema to hold it.
 */
export async function probeContainer(input: string): Promise<ProbeResult> {
  // Dynamic import to allow mocking in tests
  const ffmpeg = await import('fluent-ffmpeg')
  return new Promise<ProbeResult>((resolve) => {
    ffmpeg.default.ffprobe(input, (err, data) => {
      if (err) {
        resolve({ valid: false, durationSec: null })
        return
      }
      const raw = (data as { format?: { duration?: unknown } } | undefined)?.format?.duration
      const durationSec = typeof raw === 'number' && Number.isFinite(raw) ? raw : null
      resolve({ valid: true, durationSec })
    })
  })
}

/**
 * Derive a meeting title from a filename by stripping the extension.
 * RQ-013: Meeting.title defaults to filename (without extension) when blank.
 */
export function titleFromFilename(filename: string): string {
  const lastDot = filename.lastIndexOf('.')
  if (lastDot > 0) {
    return filename.slice(0, lastDot)
  }
  return filename
}

/**
 * Finalize an upload: persist DB rows atomically and enqueue the BullMQ job.
 * Called from POST /api/uploads/:uploadId/finalize.
 *
 * RQ-011 (atomic transaction), RQ-012 (language), RQ-013 (title), BRQ-008 (status)
 */
export async function finalizeUpload(
  input: FinalizeUploadInput,
): Promise<UploadFinalizeResponse> {
  const {
    s3Key,
    filename,
    mimeType,
    sizeBytes,
    bucket,
    title,
    language,
    speakerCount,
    skipProbe = false,
  } = input

  const storageUri = `s3://${bucket}/${s3Key}`

  // RQ-010: probe container integrity (unless explicitly skipped in tests)
  // ffprobe cannot parse s3:// URIs — generate a short-lived presigned HTTPS URL.
  // ffprobe uses HTTP Range requests, so it does not download the whole file.
  let durationSec: number | null = null
  if (!skipProbe) {
    const s3 = new S3StorageProvider(s3ConfigFromEnv())
    const probeUrl = await s3.getPresignedDownloadUrl(s3Key, 600)
    const { valid, durationSec: probed } = await probeContainer(probeUrl)
    durationSec = probed
    if (!valid) {
      throw new AppError('CONTAINER_INVALID', 422, 'Uploaded file failed container integrity check (ffprobe)')
    }

    // RQ-039 (DEC-004): duration, not byte size, is what bounds the processing
    // pipeline — peak worker memory, the Deepgram request budget and the LLM
    // context for the protocol all scale with it. Bytes are a poor proxy: the
    // same 1.5 GiB is ~5.5 h at 656 kbps but ~71 min at 1080p/3 Mbps. Reject
    // here, before the job is enqueued, so the author gets an inline error
    // instead of a mid-pipeline failure hours later.
    if (durationSec !== null && durationSec > MAX_UPLOAD_DURATION_SEC) {
      const hours = (MAX_UPLOAD_DURATION_SEC / 3600).toFixed(0)
      throw new AppError(
        'RECORDING_TOO_LONG',
        422,
        `Recording is ${Math.round(durationSec)}s long; the maximum is ${MAX_UPLOAD_DURATION_SEC}s (${hours} hours)`,
      )
    }
  }

  // RQ-013: derive title from filename when blank
  const resolvedTitle = (title && title.trim()) ? title.trim() : titleFromFilename(filename)

  // RQ-012: map language hint; null = auto-detect
  const prismaLanguage = language ? (LANGUAGE_TO_PRISMA[language] ?? null) : null

  // RQ-009: map mime to Prisma enum
  const prismaMime = MIME_TO_PRISMA[mimeType]
  if (!prismaMime) {
    // RQ-009: this should have been caught at pre-create, but double-check
    throw new AppError('UNSUPPORTED_MIME', 415, `Unsupported media type: ${mimeType}`)
  }

  // RQ-011 + BRQ-008: atomic transaction
  // 1. Create Meeting (status=UPLOADING)
  // 2. Create Recording
  // 3. Create TranscriptionJob (status=PENDING)
  // 4. Transition Meeting.status -> TRANSCRIBING
  let transcriptionJobId: string
  let meetingId: string

  try {
    const result = await prisma.$transaction(async (tx) => {
      // Step 1: Create Meeting with status=UPLOADING
      const meeting = await tx.meeting.create({
        data: {
          title: resolvedTitle,
          status: 'UPLOADING',
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ...(prismaLanguage ? { language: prismaLanguage as any } : {}),
        },
      })

      // Step 2: Create Recording
      await tx.recording.create({
        data: {
          meetingId: meeting.id,
          storageUri,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          mimeType: prismaMime as any,
          sizeBytes: BigInt(sizeBytes),
          // RQ-039: persist what ffprobe measured. The column has always existed;
          // the value was previously discarded.
          durationSec,
        },
      })

      // Step 3: Create TranscriptionJob (status=PENDING by schema default)
      const job = await tx.transcriptionJob.create({
        data: {
          meetingId: meeting.id,
        },
      })

      // Step 4: Transition Meeting.status UPLOADING -> TRANSCRIBING (BRQ-008, RQ-011)
      await tx.meeting.update({
        where: { id: meeting.id },
        data: { status: 'TRANSCRIBING' },
      })

      return { meetingId: meeting.id, transcriptionJobId: job.id }
    })

    meetingId = result.meetingId
    transcriptionJobId = result.transcriptionJobId
  } catch (err) {
    if (err instanceof AppError) throw err
    throw new AppError('INTERNAL_ERROR', 500, 'Failed to persist upload metadata', err)
  }

  // RQ-011: Enqueue BullMQ job AFTER transaction commits
  try {
    await addTranscriptionJob({
      transcription_job_id: transcriptionJobId,
      speaker_count: speakerCount ?? null,
    })
  } catch (err) {
    // Job row exists in DB; BullMQ enqueue failure is non-fatal at this layer.
    // A reconciliation worker can re-enqueue orphaned jobs.
    // We still return success — the DB state is consistent.
    // Log but don't throw: RQ-011 DB state is fulfilled.
    console.error('Failed to enqueue BullMQ transcription job:', err)
  }

  // RQ-011: return meeting_id + TRANSCRIBING status
  return { meeting_id: meetingId, status: 'TRANSCRIBING' }
}
