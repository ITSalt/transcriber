/**
 * UC-300 — Independent regression tests for the protocol generation worker pipeline.
 *
 * AUTHORSHIP NOTE: Written independently from protocol-generation.test.ts.
 * Mirrors the structure of transcription.regression.test.ts (UC-200).
 *
 * TESTING STRATEGY:
 * - Single `callLog: string[]` that records ALL side-effects in chronological order.
 * - Prisma $transaction interceptor captures AND executes the callback, then marks
 *   "TX_COMMITTED" in the log.
 * - FR-001 retry semantics (RC-UC-300):
 *     T6a: transient LLM error (429/5xx) + attempts remaining → re-throw, NO FAILED write.
 *     T6b: transient LLM error on FINAL attempt → FAILED written.
 *     T6c: permanent LLM error (401/400/404) → FAILED written immediately.
 *     T6d: attemptCount mirrors job.attemptsMade + 1 on FAILED write (TECH-026).
 *     T6e: non-KieAiLlmError (e.g. missing section) → permanent → FAILED immediately.
 *
 * Mutation proofs are documented per test.
 */

import { describe, it, expect, vi, beforeEach, type MockedFunction } from 'vitest'
import type { Job } from 'bullmq'

// ── Module-level mocks (hoisted) ──────────────────────────────────────────────

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    protocolGenerationJob: {
      findUnique: vi.fn(),
      updateMany: vi.fn(),
    },
    meeting: {
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    protocol: {
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}))

vi.mock('../llm/kieai.js', async (importOriginal) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const original = (await importOriginal()) as any
  return {
    KieAiLlmProvider: vi.fn(),
    // Keep the real error class and helper so tests can construct transient errors
    KieAiLlmError: original.KieAiLlmError,
    isTransientLlmError: original.isTransientLlmError,
  }
})

vi.mock('../lib/publisher.js', () => ({
  publishMeetingEvent: vi.fn(),
}))

// ── Subject under test ────────────────────────────────────────────────────────
import { processProtocolGenerationJob } from './protocol-generation.js'
import { prisma } from '../lib/prisma.js'
import { KieAiLlmProvider, KieAiLlmError } from '../llm/kieai.js'
import { publishMeetingEvent } from '../lib/publisher.js'

// ── Typed mock helpers ────────────────────────────────────────────────────────

type AnyFn = (...args: any[]) => any

type FakePrisma = {
  protocolGenerationJob: { findUnique: MockedFunction<AnyFn>; updateMany: MockedFunction<AnyFn> }
  meeting: { update: MockedFunction<AnyFn>; updateMany: MockedFunction<AnyFn> }
  protocol: { create: MockedFunction<AnyFn> }
  $transaction: MockedFunction<AnyFn>
}

const fp = prisma as unknown as FakePrisma

// ── Fixtures ──────────────────────────────────────────────────────────────────

const MTG = 'aaaa0300-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const PGJOB = 'bbbb0300-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
const PROTO = 'cccc0300-cccc-cccc-cccc-cccccccccccc'
const TXSCRIPT = 'dddd0300-dddd-dddd-dddd-dddddddddddd'

const VALID_EN_MARKDOWN = `## Participants
- Speaker 1

## Discussion
Budget review.

## Decisions
- Approved Q2 budget.

## Action Items
- Speaker 1: Submit report`

const BASE_PG_JOB = {
  id: PGJOB,
  meetingId: MTG,
  status: 'PENDING' as const,
  startedAt: null,
  finishedAt: null,
  errorMsg: null,
  attemptCount: 0,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
  meeting: {
    id: MTG,
    title: 'Regression Test Meeting',
    status: 'GENERATING_PROTOCOL' as const,
    language: 'EN' as const,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    transcript: {
      id: TXSCRIPT,
      meetingId: MTG,
      rawText: '[00:00] Speaker 1: Hello world.',
      speakerMap: {},
      segmentsBlob: [],
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01'),
    },
  },
}

function makeJob(
  bullId: string,
  jobId: string,
  attemptsMade = 0,
): Job<{ protocol_generation_job_id: string }> {
  return {
    id: bullId,
    data: { protocol_generation_job_id: jobId },
    attemptsMade,
  } as unknown as Job<{ protocol_generation_job_id: string }>
}

function makeLogger() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as any
}

// ── Ordered call-log setup ────────────────────────────────────────────────────

let callLog: string[] = []

/**
 * Wire up all mocks for the happy path.
 */
function wireHappyPath() {
  fp.protocolGenerationJob.findUnique.mockResolvedValue(BASE_PG_JOB as any)
  fp.protocolGenerationJob.updateMany.mockResolvedValue({ count: 1 })

  const mockLlm = {
    generate: vi.fn().mockImplementation(async () => {
      callLog.push('LLM_GENERATE')
      return { text: VALID_EN_MARKDOWN, model: 'claude-sonnet-4-6', tokensIn: 100, tokensOut: 80 }
    }),
  }
  ;(KieAiLlmProvider as unknown as MockedFunction<AnyFn>).mockReturnValue(mockLlm)

  fp.$transaction.mockImplementation(async (cb: any) => {
    const txProxy = {
      protocol: {
        create: vi.fn().mockImplementation(async () => {
          callLog.push('TX:protocol.create')
          return { id: PROTO, meetingId: MTG }
        }),
      },
      meeting: {
        update: vi.fn().mockImplementation(async () => {
          callLog.push('TX:meeting.update(PROTOCOL_READY)')
          return {}
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      protocolGenerationJob: {
        updateMany: vi.fn().mockImplementation(async () => {
          callLog.push('TX:protocolGenerationJob.updateMany(DONE)')
          return { count: 1 }
        }),
        findUnique: vi.fn().mockResolvedValue({ meetingId: MTG }),
      },
    }
    const result = await cb(txProxy)
    callLog.push('TX_COMMITTED')
    return result
  })

  ;(publishMeetingEvent as MockedFunction<AnyFn>).mockResolvedValue(undefined)

  return { mockLlm }
}

// ── Test suite ────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
  callLog = []
})

// ─────────────────────────────────────────────────────────────────────────────
// TEST 1: Optimistic PENDING→PROCESSING lock + double-pickup guard
// ─────────────────────────────────────────────────────────────────────────────

describe('REGR-P1 — Optimistic PENDING→PROCESSING lock', () => {
  it('updateMany WHERE clause includes exactly status=PENDING (RQ-021)', async () => {
    /*
     * MUTATION PROOF:
     *   If production code removes `status: 'PENDING'` from the WHERE clause,
     *   the captured `where` object will lack the status field and this assertion turns RED.
     */
    wireHappyPath()

    await processProtocolGenerationJob(makeJob('rp-1', PGJOB) as any, makeLogger())

    const firstUpdateManyCall = fp.protocolGenerationJob.updateMany.mock.calls[0]
    expect(firstUpdateManyCall).toBeDefined()
    const arg = firstUpdateManyCall[0] as { where: { id: string; status: string }; data: any }

    expect(arg.where).toEqual({ id: PGJOB, status: 'PENDING' })
    expect(arg.data).toMatchObject({ status: 'PROCESSING' })
  })

  it('second invocation with updateMany count=0 is a no-op: $transaction never called (BRQ-009 double-pickup)', async () => {
    /*
     * MUTATION PROOF:
     *   If the guard `if (updated.count === 0) return` is removed,
     *   $transaction will be called even when another worker claimed the job.
     */
    fp.protocolGenerationJob.findUnique.mockResolvedValue(BASE_PG_JOB as any)
    fp.protocolGenerationJob.updateMany.mockResolvedValue({ count: 0 })
    ;(publishMeetingEvent as MockedFunction<AnyFn>).mockResolvedValue(undefined)

    await processProtocolGenerationJob(makeJob('rp-2', PGJOB) as any, makeLogger())

    expect(fp.$transaction).not.toHaveBeenCalled()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// TEST 2: Success path — Protocol persisted + Meeting PROTOCOL_READY + job DONE
// ─────────────────────────────────────────────────────────────────────────────

describe('REGR-P2 — Successful path: Protocol persisted + Meeting PROTOCOL_READY + Job DONE', () => {
  it('Meeting.status=PROTOCOL_READY update fires inside transaction (BRQ-008)', async () => {
    /*
     * MUTATION PROOF:
     *   Remove `await tx.meeting.update({ data: { status: 'PROTOCOL_READY' } })` →
     *   callLog will not contain 'TX:meeting.update(PROTOCOL_READY)' → assertion turns RED.
     */
    wireHappyPath()

    await processProtocolGenerationJob(makeJob('rp-3', PGJOB) as any, makeLogger())

    expect(callLog).toContain('TX:meeting.update(PROTOCOL_READY)')
    expect(callLog).toContain('TX:protocolGenerationJob.updateMany(DONE)')
    const meetingUpdateIdx = callLog.indexOf('TX:meeting.update(PROTOCOL_READY)')
    const txCommittedIdx = callLog.indexOf('TX_COMMITTED')
    expect(meetingUpdateIdx).toBeLessThan(txCommittedIdx)
  })

  it('Protocol.create is called with version=1 and correct markdownContent', async () => {
    /*
     * MUTATION PROOF:
     *   If protocol.create is not called or fields are wrong, assertions fail.
     */
    fp.protocolGenerationJob.findUnique.mockResolvedValue(BASE_PG_JOB as any)
    fp.protocolGenerationJob.updateMany.mockResolvedValue({ count: 1 })

    let capturedProtocolData: any
    fp.$transaction.mockImplementation(async (cb: any) => {
      const txProxy = {
        protocol: {
          create: vi.fn().mockImplementation(async (args: any) => {
            callLog.push('TX:protocol.create')
            capturedProtocolData = args.data
            return { id: PROTO, meetingId: MTG }
          }),
        },
        meeting: {
          update: vi.fn().mockImplementation(async () => {
            callLog.push('TX:meeting.update(PROTOCOL_READY)')
            return {}
          }),
        },
        protocolGenerationJob: {
          updateMany: vi.fn().mockImplementation(async () => {
            callLog.push('TX:protocolGenerationJob.updateMany(DONE)')
            return { count: 1 }
          }),
          findUnique: vi.fn().mockResolvedValue({ meetingId: MTG }),
        },
      }
      const result = await cb(txProxy)
      callLog.push('TX_COMMITTED')
      return result
    })

    const mockLlm = { generate: vi.fn().mockResolvedValue({ text: VALID_EN_MARKDOWN, model: 'claude-sonnet-4-6', tokensIn: 100, tokensOut: 80 }) }
    ;(publishMeetingEvent as MockedFunction<AnyFn>).mockResolvedValue(undefined)

    await processProtocolGenerationJob(makeJob('rp-4', PGJOB) as any, makeLogger(), { llm: mockLlm })

    expect(capturedProtocolData).toBeDefined()
    expect(capturedProtocolData.version).toBe(1)
    expect(capturedProtocolData.markdownContent).toBe(VALID_EN_MARKDOWN)
    expect(capturedProtocolData.meetingId).toBe(MTG)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// TEST 3: Terminal-state immutability (BRQ-009)
// ─────────────────────────────────────────────────────────────────────────────

describe('REGR-P3 — Terminal-state immutability (BRQ-009): DONE and FAILED jobs are no-ops', () => {
  it('DONE job: no DB writes, no LLM call, returns without error', async () => {
    /*
     * MUTATION PROOF:
     *   Remove the `if (pgJob.status === 'DONE' || ...)` guard →
     *   pipeline continues, calls updateMany → assertion fails.
     */
    const doneJob = { ...BASE_PG_JOB, status: 'DONE' as const }
    fp.protocolGenerationJob.findUnique.mockResolvedValue(doneJob as any)

    const mockLlm = { generate: vi.fn() }
    ;(publishMeetingEvent as MockedFunction<AnyFn>).mockResolvedValue(undefined)

    await expect(
      processProtocolGenerationJob(makeJob('rp-5', PGJOB) as any, makeLogger(), { llm: mockLlm }),
    ).resolves.toBeUndefined()

    expect(fp.protocolGenerationJob.updateMany).not.toHaveBeenCalled()
    expect(fp.$transaction).not.toHaveBeenCalled()
    expect(mockLlm.generate).not.toHaveBeenCalled()
  })

  it('FAILED job: no DB writes, no LLM call, returns without error', async () => {
    const failedJob = { ...BASE_PG_JOB, status: 'FAILED' as const, errorMsg: 'prior failure' }
    fp.protocolGenerationJob.findUnique.mockResolvedValue(failedJob as any)

    const mockLlm = { generate: vi.fn() }
    ;(publishMeetingEvent as MockedFunction<AnyFn>).mockResolvedValue(undefined)

    await expect(
      processProtocolGenerationJob(makeJob('rp-6', PGJOB) as any, makeLogger(), { llm: mockLlm }),
    ).resolves.toBeUndefined()

    expect(fp.protocolGenerationJob.updateMany).not.toHaveBeenCalled()
    expect(fp.$transaction).not.toHaveBeenCalled()
    expect(mockLlm.generate).not.toHaveBeenCalled()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// TEST 4: FR-001 — Transient vs permanent error retry semantics (RC-UC-300)
// ─────────────────────────────────────────────────────────────────────────────

describe('REGR-P4 — FR-001 transient-retry semantics (RC-UC-300)', () => {
  it('P4a: transient LLM error (429) with attempts remaining — re-throws WITHOUT writing FAILED (RQ-026 FR-001)', async () => {
    /*
     * MUTATION PROOF:
     *   Remove `if (shouldRetry) { throw err }` in catch block →
     *   $transaction will be called to write FAILED →
     *   `expect(fp.$transaction).not.toHaveBeenCalled()` turns RED.
     */
    const transientErr = new KieAiLlmError('rate limited', { status: 429, isTransient: true })
    const mockLlm = { generate: vi.fn().mockRejectedValue(transientErr) }

    fp.protocolGenerationJob.findUnique.mockResolvedValue(BASE_PG_JOB as any)
    fp.protocolGenerationJob.updateMany.mockResolvedValue({ count: 1 })
    ;(publishMeetingEvent as MockedFunction<AnyFn>).mockResolvedValue(undefined)

    // attemptsMade=0 means attempt #1 of MAX_ATTEMPTS=3 → NOT final
    const job = makeJob('rp-7', PGJOB, /* attemptsMade= */ 0)

    await expect(
      processProtocolGenerationJob(job as any, makeLogger(), { llm: mockLlm }),
    ).rejects.toThrow('rate limited')

    // NO FAILED write — BullMQ will retry
    expect(fp.$transaction).not.toHaveBeenCalled()
  })

  it('P4b: transient LLM error on FINAL attempt (attemptsMade=2) → writes FAILED (FR-001 exhaustion)', async () => {
    /*
     * MUTATION PROOF:
     *   Remove `isFinalAttempt` check so the code always re-throws on transient →
     *   $transaction will NOT be called → `expect(failJobArgs).toBeDefined()` turns RED.
     */
    const transientErr = new KieAiLlmError('rate limited — final', { status: 429, isTransient: true })
    const mockLlm = { generate: vi.fn().mockRejectedValue(transientErr) }

    fp.protocolGenerationJob.findUnique.mockResolvedValue(BASE_PG_JOB as any)
    fp.protocolGenerationJob.updateMany.mockResolvedValue({ count: 1 })
    ;(publishMeetingEvent as MockedFunction<AnyFn>).mockResolvedValue(undefined)

    let failJobArgs: any
    fp.$transaction.mockImplementation(async (cb: any) => {
      const txProxy = {
        protocolGenerationJob: {
          updateMany: vi.fn().mockImplementation(async (args: any) => {
            failJobArgs = args
            return { count: 1 }
          }),
          findUnique: vi.fn().mockResolvedValue({ meetingId: MTG }),
        },
        meeting: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      }
      return cb(txProxy)
    })

    // attemptsMade=2 means attempt #3 (final) of MAX_ATTEMPTS=3
    const job = makeJob('rp-8', PGJOB, /* attemptsMade= */ 2)

    await expect(
      processProtocolGenerationJob(job as any, makeLogger(), { llm: mockLlm }),
    ).rejects.toThrow('rate limited — final')

    // MUST write FAILED on exhaustion
    expect(failJobArgs).toBeDefined()
    expect(failJobArgs.data.status).toBe('FAILED')
    expect(failJobArgs.data.errorMsg).toBe('rate limited — final')
    expect(failJobArgs.data.finishedAt).toBeInstanceOf(Date)
  })

  it('P4c: permanent LLM error (401) → always writes FAILED, even on first attempt', async () => {
    /*
     * MUTATION PROOF:
     *   If a non-transient error is mistakenly treated as transient,
     *   $transaction will NOT be called and `expect(failJobArgs).toBeDefined()` turns RED.
     */
    const permanentErr = new KieAiLlmError('unauthorized — bad API key', { status: 401, isTransient: false })
    const mockLlm = { generate: vi.fn().mockRejectedValue(permanentErr) }

    fp.protocolGenerationJob.findUnique.mockResolvedValue(BASE_PG_JOB as any)
    fp.protocolGenerationJob.updateMany.mockResolvedValue({ count: 1 })
    ;(publishMeetingEvent as MockedFunction<AnyFn>).mockResolvedValue(undefined)

    let failJobArgs: any
    fp.$transaction.mockImplementation(async (cb: any) => {
      const txProxy = {
        protocolGenerationJob: {
          updateMany: vi.fn().mockImplementation(async (args: any) => {
            failJobArgs = args
            return { count: 1 }
          }),
          findUnique: vi.fn().mockResolvedValue({ meetingId: MTG }),
        },
        meeting: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      }
      return cb(txProxy)
    })

    // First attempt (attemptsMade=0) with a permanent error
    const job = makeJob('rp-9', PGJOB, /* attemptsMade= */ 0)

    await expect(
      processProtocolGenerationJob(job as any, makeLogger(), { llm: mockLlm }),
    ).rejects.toThrow('unauthorized — bad API key')

    // MUST write FAILED immediately (permanent error, no retry)
    expect(failJobArgs).toBeDefined()
    expect(failJobArgs.data.status).toBe('FAILED')
  })

  it('P4d: FAILED write includes attemptCount mirroring job.attemptsMade + 1 (TECH-026)', async () => {
    /*
     * MUTATION PROOF:
     *   Remove `attemptCount: attemptsMade + 1` from the updateMany data →
     *   `failJobArgs.data.attemptCount` will be undefined →
     *   `expect(failJobArgs.data.attemptCount).toBe(3)` turns RED.
     */
    const permanentErr = new KieAiLlmError('payment required', { status: 402, isTransient: false })
    const mockLlm = { generate: vi.fn().mockRejectedValue(permanentErr) }

    fp.protocolGenerationJob.findUnique.mockResolvedValue(BASE_PG_JOB as any)
    fp.protocolGenerationJob.updateMany.mockResolvedValue({ count: 1 })
    ;(publishMeetingEvent as MockedFunction<AnyFn>).mockResolvedValue(undefined)

    let failJobArgs: any
    fp.$transaction.mockImplementation(async (cb: any) => {
      const txProxy = {
        protocolGenerationJob: {
          updateMany: vi.fn().mockImplementation(async (args: any) => {
            failJobArgs = args
            return { count: 1 }
          }),
          findUnique: vi.fn().mockResolvedValue({ meetingId: MTG }),
        },
        meeting: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      }
      return cb(txProxy)
    })

    // Simulating the final (3rd) attempt: attemptsMade=2
    const job = makeJob('rp-10', PGJOB, /* attemptsMade= */ 2)

    await expect(
      processProtocolGenerationJob(job as any, makeLogger(), { llm: mockLlm }),
    ).rejects.toThrow('payment required')

    // attemptCount must mirror attemptsMade + 1 = 3
    expect(failJobArgs.data.attemptCount).toBe(3)
  })

  it('P4e: missing-section parse error (non-KieAiLlmError) → permanent → writes FAILED on first attempt', async () => {
    /*
     * MUTATION PROOF:
     *   If `isTransientLlmError` returns true for generic errors,
     *   $transaction will NOT be called on the first attempt →
     *   `expect(failJobArgs).toBeDefined()` turns RED.
     *
     * This test covers the missing-section failure (RQ-023): the thrown error is a plain
     * Error from validateProtocolSections, NOT a KieAiLlmError → permanent → FAILED.
     */
    fp.protocolGenerationJob.findUnique.mockResolvedValue(BASE_PG_JOB as any)
    fp.protocolGenerationJob.updateMany.mockResolvedValue({ count: 1 })
    ;(publishMeetingEvent as MockedFunction<AnyFn>).mockResolvedValue(undefined)

    // LLM succeeds but returns markdown missing required sections
    const incompleteMd = '## Participants\n## Discussion\n## Decisions'
    const mockLlm = { generate: vi.fn().mockResolvedValue({ text: incompleteMd, model: 'claude-sonnet-4-6', tokensIn: 100, tokensOut: 50 }) }

    let failJobArgs: any
    fp.$transaction.mockImplementation(async (cb: any) => {
      const txProxy = {
        protocolGenerationJob: {
          updateMany: vi.fn().mockImplementation(async (args: any) => {
            failJobArgs = args
            return { count: 1 }
          }),
          findUnique: vi.fn().mockResolvedValue({ meetingId: MTG }),
        },
        meeting: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      }
      return cb(txProxy)
    })

    // First attempt
    const job = makeJob('rp-11', PGJOB, /* attemptsMade= */ 0)

    await expect(
      processProtocolGenerationJob(job as any, makeLogger(), { llm: mockLlm }),
    ).rejects.toThrow(/missing required sections/)

    // Parse error is permanent — must write FAILED immediately
    expect(failJobArgs).toBeDefined()
    expect(failJobArgs.data.status).toBe('FAILED')
    expect(failJobArgs.data.errorMsg).toMatch(/missing required sections/)
  })

  it('P4f: transient 5xx LLM error with attempts=1 remaining — re-throws WITHOUT writing FAILED', async () => {
    /*
     * MUTATION PROOF:
     *   If 5xx is not classified as transient in KieAiLlmError,
     *   isTransientLlmError returns false → shouldRetry=false → $transaction is called →
     *   `expect(fp.$transaction).not.toHaveBeenCalled()` turns RED.
     */
    const transientErr = new KieAiLlmError('internal server error', { status: 503, isTransient: true })
    const mockLlm = { generate: vi.fn().mockRejectedValue(transientErr) }

    fp.protocolGenerationJob.findUnique.mockResolvedValue(BASE_PG_JOB as any)
    fp.protocolGenerationJob.updateMany.mockResolvedValue({ count: 1 })
    ;(publishMeetingEvent as MockedFunction<AnyFn>).mockResolvedValue(undefined)

    // attemptsMade=1 means attempt #2 of MAX_ATTEMPTS=3 → still not final
    const job = makeJob('rp-12', PGJOB, /* attemptsMade= */ 1)

    await expect(
      processProtocolGenerationJob(job as any, makeLogger(), { llm: mockLlm }),
    ).rejects.toThrow('internal server error')

    // NO FAILED write — BullMQ will retry
    expect(fp.$transaction).not.toHaveBeenCalled()
  })
})
