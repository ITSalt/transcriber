/**
 * UC-300 — Regression tests for protocol LANGUAGE selection (RQ-022 / DEC-003).
 *
 * BUG (2026-08-14, production): a Russian meeting produced an English protocol.
 * `Meeting.language` is three-valued (RU/EN/AUTO) and defaults to AUTO, but
 * protocol-generation collapsed it with `rawLang === 'RU' ? 'RU' : 'EN'`, so
 * every AUTO meeting selected the English prompt template. Section validation
 * reused the same collapsed value, so the wrong-language protocol passed RQ-023
 * and was persisted silently. 3 of 24 production meetings were affected
 * (e.g. 3afc6f2e-8f7b-44fe-9281-627db34504d8).
 *
 * CORRECT BEHAVIOR (BRQ-013 amended 2026-08-14, DEC-003):
 *   Meeting.language = 'EN'            -> EN template
 *   Meeting.language = 'RU' or 'AUTO'  -> RU template
 * The transcript's own language MUST NOT influence template selection, and
 * there is no AUTO -> EN fallback.
 *
 * AUTHORSHIP NOTE: written against the BROKEN code, before the fix, per the
 * RED-first discipline. Mock style mirrors protocol-generation.regression.test.ts.
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
import { publishMeetingEvent } from '../lib/publisher.js'

// ── Typed mock helpers ────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFn = (...args: any[]) => any

type FakePrisma = {
  protocolGenerationJob: { findUnique: MockedFunction<AnyFn>; updateMany: MockedFunction<AnyFn> }
  meeting: { update: MockedFunction<AnyFn>; updateMany: MockedFunction<AnyFn> }
  protocol: { create: MockedFunction<AnyFn> }
  $transaction: MockedFunction<AnyFn>
}

const fp = prisma as unknown as FakePrisma

// ── Fixtures ──────────────────────────────────────────────────────────────────

const MTG = 'aaaa0301-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const PGJOB = 'bbbb0301-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
const PROTO = 'cccc0301-cccc-cccc-cccc-cccccccccccc'
const TXSCRIPT = 'dddd0301-dddd-dddd-dddd-dddddddddddd'

/** Real shape of the production defect: a Russian meeting transcript. */
const RUSSIAN_TRANSCRIPT = '[03:55] Speaker 1: Коллеги, добрый день. Начинаем?'
const ENGLISH_TRANSCRIPT = '[00:00] Speaker 1: Good morning everyone.'

const VALID_RU_MARKDOWN = `## Участники
- Speaker 1

## Обсуждение
Обзор бюджета.

## Решения
- Бюджет утверждён.

## Задачи
- Speaker 1: подготовить отчёт`

const VALID_EN_MARKDOWN = `## Participants
- Speaker 1

## Discussion
Budget review.

## Decisions
- Approved Q2 budget.

## Action Items
- Speaker 1: Submit report`

/**
 * Markdown carrying BOTH the RU and EN required headings, so it validates
 * whichever language the pipeline selects. Used by the dispatch tests so that
 * the ONLY thing that can fail is the language assertion itself — section
 * validation is deliberately taken out of the picture.
 */
const VALID_BILINGUAL_MARKDOWN = `${VALID_RU_MARKDOWN}\n\n${VALID_EN_MARKDOWN}`

function makePgJob(opts: {
  meetingLanguage: 'RU' | 'EN' | 'AUTO'
  transcriptText: string
}) {
  return {
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
      title: 'Language Regression Meeting',
      status: 'GENERATING_PROTOCOL' as const,
      language: opts.meetingLanguage,
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01'),
      transcript: {
        id: TXSCRIPT,
        meetingId: MTG,
        rawText: opts.transcriptText,
        speakerMap: {},
        segmentsBlob: [],
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-01'),
      },
    },
  }
}

function makeJob(bullId: string): Job<{ protocol_generation_job_id: string }> {
  return {
    id: bullId,
    data: { protocol_generation_job_id: PGJOB },
    attemptsMade: 0,
  } as unknown as Job<{ protocol_generation_job_id: string }>
}

function makeLogger() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as any
}

/** Wires prisma + publisher so the pipeline can run to completion. */
function wire(pgJob: ReturnType<typeof makePgJob>) {
  fp.protocolGenerationJob.findUnique.mockResolvedValue(pgJob as never)
  fp.protocolGenerationJob.updateMany.mockResolvedValue({ count: 1 })
  fp.meeting.updateMany.mockResolvedValue({ count: 1 })

  const protocolCreate = vi.fn().mockResolvedValue({ id: PROTO, meetingId: MTG })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fp.$transaction.mockImplementation(async (cb: any) => {
    const txProxy = {
      protocol: { create: protocolCreate },
      meeting: {
        update: vi.fn().mockResolvedValue({}),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      protocolGenerationJob: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUnique: vi.fn().mockResolvedValue({ meetingId: MTG }),
      },
    }
    return cb(txProxy)
  })

  ;(publishMeetingEvent as MockedFunction<AnyFn>).mockResolvedValue(undefined)

  return { protocolCreate }
}

/** LLM stub that always returns the given markdown, and records its input. */
function makeLlm(markdown: string) {
  return {
    generate: vi.fn().mockResolvedValue({
      text: markdown,
      model: 'claude-sonnet-4-6',
      tokensIn: 100,
      tokensOut: 80,
    }),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ─────────────────────────────────────────────────────────────────────────────
// REGR-L1 — the production defect: AUTO must select the RU template
// ─────────────────────────────────────────────────────────────────────────────

describe('REGR-L1 (RQ-022 / DEC-003) — Meeting.language=AUTO selects the RU template', () => {
  it('dispatches language=RU to the LLM for an AUTO meeting with a Russian transcript', async () => {
    /*
     * MUTATION PROOF:
     *   Broken code (`rawLang === 'RU' ? 'RU' : 'EN'`) dispatches 'EN' here.
     *   This assertion is the exact production defect, expressed at the seam
     *   where the prompt template is chosen.
     */
    const llm = makeLlm(VALID_BILINGUAL_MARKDOWN)
    wire(makePgJob({ meetingLanguage: 'AUTO', transcriptText: RUSSIAN_TRANSCRIPT }))

    await processProtocolGenerationJob(makeJob('rl-1'), makeLogger(), { llm: llm as never })

    expect(llm.generate).toHaveBeenCalledWith(expect.objectContaining({ language: 'RU' }))
  })

  it('dispatches language=RU for an AUTO meeting even when the transcript is English', async () => {
    /*
     * MUTATION PROOF:
     *   Guards against a "smarter fallback" regression — i.e. resolving AUTO
     *   from the transcript's language. DEC-003 is explicit that the recording's
     *   language MUST NOT influence template selection; only Meeting.language does.
     */
    const llm = makeLlm(VALID_BILINGUAL_MARKDOWN)
    wire(makePgJob({ meetingLanguage: 'AUTO', transcriptText: ENGLISH_TRANSCRIPT }))

    await processProtocolGenerationJob(makeJob('rl-2'), makeLogger(), { llm: llm as never })

    expect(llm.generate).toHaveBeenCalledWith(expect.objectContaining({ language: 'RU' }))
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// REGR-L2 — explicit author choices are still honoured
// ─────────────────────────────────────────────────────────────────────────────

describe('REGR-L2 (RQ-022) — explicit Meeting.language is honoured', () => {
  it('dispatches language=EN when the author explicitly selected EN', async () => {
    const llm = makeLlm(VALID_BILINGUAL_MARKDOWN)
    wire(makePgJob({ meetingLanguage: 'EN', transcriptText: ENGLISH_TRANSCRIPT }))

    await processProtocolGenerationJob(makeJob('rl-3'), makeLogger(), { llm: llm as never })

    expect(llm.generate).toHaveBeenCalledWith(expect.objectContaining({ language: 'EN' }))
  })

  it('dispatches language=EN when the author selected EN for a Russian recording', async () => {
    /*
     * MUTATION PROOF:
     *   EN is the ONLY exception in DEC-003. If a fix over-corrects to
     *   "always RU", this turns RED.
     */
    const llm = makeLlm(VALID_BILINGUAL_MARKDOWN)
    wire(makePgJob({ meetingLanguage: 'EN', transcriptText: RUSSIAN_TRANSCRIPT }))

    await processProtocolGenerationJob(makeJob('rl-4'), makeLogger(), { llm: llm as never })

    expect(llm.generate).toHaveBeenCalledWith(expect.objectContaining({ language: 'EN' }))
  })

  it('dispatches language=RU when the author explicitly selected RU', async () => {
    const llm = makeLlm(VALID_BILINGUAL_MARKDOWN)
    wire(makePgJob({ meetingLanguage: 'RU', transcriptText: RUSSIAN_TRANSCRIPT }))

    await processProtocolGenerationJob(makeJob('rl-5'), makeLogger(), { llm: llm as never })

    expect(llm.generate).toHaveBeenCalledWith(expect.objectContaining({ language: 'RU' }))
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// REGR-L3 — anti-regression: a wrong-language response must FAIL, not persist
// ─────────────────────────────────────────────────────────────────────────────

describe('REGR-L3 (RQ-022 + RQ-023) — wrong-language output fails validation loudly', () => {
  it('rejects an English protocol for an AUTO meeting instead of persisting it', async () => {
    /*
     * MUTATION PROOF — this is the assertion that would have caught the
     * production bug. Under the broken code the pipeline selects EN, validates
     * against REQUIRED_SECTIONS.EN, and happily persists the English protocol,
     * so `protocol.create` IS called and no error is thrown.
     *
     * Correct behavior: language resolves to RU, validation runs against the RU
     * headings, the English markdown is missing all four of them, and the job
     * throws before any Protocol row is written (RQ-023, permanent failure).
     */
    const llm = makeLlm(VALID_EN_MARKDOWN)
    const { protocolCreate } = wire(
      makePgJob({ meetingLanguage: 'AUTO', transcriptText: RUSSIAN_TRANSCRIPT }),
    )

    await expect(
      processProtocolGenerationJob(makeJob('rl-6'), makeLogger(), { llm: llm as never }),
    ).rejects.toThrow(/missing required sections/i)

    expect(protocolCreate).not.toHaveBeenCalled()
  })
})
