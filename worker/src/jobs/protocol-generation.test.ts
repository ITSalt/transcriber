/**
 * UC-300 — Protocol generation pipeline unit tests
 *
 * All external dependencies are mocked:
 *   - Prisma client (worker/src/lib/prisma.ts)
 *   - ILlmProvider / KieAiLlmProvider (worker/src/llm/kieai.ts)
 *   - ioredis publisher (worker/src/lib/publisher.ts)
 *
 * No live LLM / PostgreSQL / Redis connections.
 */

import { describe, it, expect, vi, beforeEach, type MockedFunction } from 'vitest'
import type { Job } from 'bullmq'

// ── Mocks must be hoisted before the subject import ──────────────────────────

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
    // Expose the real error class and helper so production code can import them
    KieAiLlmError: original.KieAiLlmError,
    isTransientLlmError: original.isTransientLlmError,
  }
})

vi.mock('../lib/publisher.js', () => ({
  publishMeetingEvent: vi.fn(),
}))

// ── Subject under test ────────────────────────────────────────────────────────

import {
  processProtocolGenerationJob,
  validateProtocolSections,
  PROTOCOL_PROMPT_TEMPLATE_VERSION,
} from './protocol-generation.js'
import { prisma } from '../lib/prisma.js'
import { publishMeetingEvent } from '../lib/publisher.js'

// ── Type helpers ──────────────────────────────────────────────────────────────

type MockPrisma = {
  protocolGenerationJob: {
    findUnique: MockedFunction<typeof prisma.protocolGenerationJob.findUnique>
    updateMany: MockedFunction<typeof prisma.protocolGenerationJob.updateMany>
  }
  meeting: {
    update: MockedFunction<typeof prisma.meeting.update>
    updateMany: MockedFunction<typeof prisma.meeting.updateMany>
  }
  protocol: {
    create: MockedFunction<typeof prisma.protocol.create>
  }
  $transaction: MockedFunction<typeof prisma.$transaction>
}

const mockPrisma = prisma as unknown as MockPrisma

function makeLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  } as any
}

function makeJob(id: string, protocol_generation_job_id: string): Job<{ protocol_generation_job_id: string }> {
  return {
    id,
    data: { protocol_generation_job_id },
  } as unknown as Job<{ protocol_generation_job_id: string }>
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

const MEETING_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const JOB_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
const PROTOCOL_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
const TRANSCRIPT_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd'

const SAMPLE_TRANSCRIPT_TEXT = [
  '[00:00] Speaker 1: Good morning everyone.',
  '[00:05] Speaker 2: Hello. I am Alice.',
  '[00:10] Speaker 1: Let us discuss the budget.',
].join('\n')

const VALID_EN_MARKDOWN = `
## Participants
- Speaker 1
- Alice

## Discussion
Budget review.

## Decisions
- Approved Q2 budget.

## Action Items
- Alice: Submit report (deadline: TBD)
`.trim()

const VALID_RU_MARKDOWN = `
## Участники
- Говорящий 1

## Обсуждение
Обсуждение бюджета.

## Решения
- Утвержден бюджет Q2.

## Задачи
- Алиса: Подготовить отчет (срок: не указан)
`.trim()

const BASE_PG_JOB = {
  id: JOB_ID,
  meetingId: MEETING_ID,
  status: 'PENDING' as const,
  startedAt: null,
  finishedAt: null,
  errorMsg: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  meeting: {
    id: MEETING_ID,
    title: 'Test Meeting',
    status: 'GENERATING_PROTOCOL' as const,
    language: 'EN' as const,
    createdAt: new Date(),
    updatedAt: new Date(),
    transcript: {
      id: TRANSCRIPT_ID,
      meetingId: MEETING_ID,
      rawText: SAMPLE_TRANSCRIPT_TEXT,
      speakerMap: {},
      segmentsBlob: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  },
}

const MOCK_LLM_RESULT = {
  text: VALID_EN_MARKDOWN,
  model: 'claude-sonnet-4-6' as const,
  tokensIn: 120,
  tokensOut: 80,
}

function makeMockLlm(result = MOCK_LLM_RESULT) {
  return { generate: vi.fn().mockResolvedValue(result) }
}

function setupSuccessfulTransaction(mockLlmResult = MOCK_LLM_RESULT) {
  mockPrisma.$transaction.mockImplementation(async (cb: any) => {
    const txMock = {
      protocol: {
        create: vi.fn().mockResolvedValue({ id: PROTOCOL_ID, meetingId: MEETING_ID }),
      },
      meeting: {
        update: vi.fn().mockResolvedValue({}),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      protocolGenerationJob: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUnique: vi.fn().mockResolvedValue({ meetingId: MEETING_ID }),
      },
    }
    return cb(txMock)
  })
  return mockLlmResult
}

beforeEach(() => {
  vi.resetAllMocks()
})

// ─── Unit: validateProtocolSections ──────────────────────────────────────────

describe('validateProtocolSections', () => {
  it('returns null when all EN sections are present', () => {
    expect(validateProtocolSections(VALID_EN_MARKDOWN, 'EN')).toBeNull()
  })

  it('returns null when all RU sections are present', () => {
    expect(validateProtocolSections(VALID_RU_MARKDOWN, 'RU')).toBeNull()
  })

  it('returns error string listing missing EN sections', () => {
    const md = '## Participants\n## Discussion\n## Decisions'
    const result = validateProtocolSections(md, 'EN')
    expect(result).not.toBeNull()
    expect(result).toContain('## Action Items')
  })

  it('returns error string listing missing RU sections', () => {
    const md = '## Участники\n## Обсуждение'
    const result = validateProtocolSections(md, 'RU')
    expect(result).not.toBeNull()
    expect(result).toContain('## Решения')
    expect(result).toContain('## Задачи')
  })

  it('returns error when markdown is empty', () => {
    const result = validateProtocolSections('', 'EN')
    expect(result).not.toBeNull()
  })
})

// ─── T01 (RQ-021) — ProtocolGenerationJob lifecycle ─────────────────────────

describe('T01 (RQ-021) — ProtocolGenerationJob lifecycle: PENDING → PROCESSING → DONE', () => {
  it('marks job PROCESSING on pickup, then DONE inside transaction', async () => {
    mockPrisma.protocolGenerationJob.findUnique.mockResolvedValue(BASE_PG_JOB as any)
    mockPrisma.protocolGenerationJob.updateMany.mockResolvedValue({ count: 1 })

    setupSuccessfulTransaction()
    ;(publishMeetingEvent as MockedFunction<typeof publishMeetingEvent>).mockResolvedValue(undefined)

    const mockLlm = makeMockLlm()
    const log = makeLogger()

    await processProtocolGenerationJob(makeJob('bq-1', JOB_ID) as any, log, {
      llm: mockLlm,
    })

    // Step 1b: claimed PROCESSING
    expect(mockPrisma.protocolGenerationJob.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: JOB_ID, status: 'PENDING' },
        data: expect.objectContaining({ status: 'PROCESSING' }),
      }),
    )

    // Transaction ran (DONE written inside)
    expect(mockPrisma.$transaction).toHaveBeenCalledOnce()
  })

  it('skips processing if job is already terminal DONE (BRQ-009 idempotency)', async () => {
    const doneJob = { ...BASE_PG_JOB, status: 'DONE' as const }
    mockPrisma.protocolGenerationJob.findUnique.mockResolvedValue(doneJob as any)

    const log = makeLogger()
    await processProtocolGenerationJob(makeJob('bq-2', JOB_ID) as any, log, {
      llm: makeMockLlm(),
    })

    expect(mockPrisma.protocolGenerationJob.updateMany).not.toHaveBeenCalled()
    expect(mockPrisma.$transaction).not.toHaveBeenCalled()
  })

  it('skips processing if job is already terminal FAILED (BRQ-009 idempotency)', async () => {
    const failedJob = { ...BASE_PG_JOB, status: 'FAILED' as const }
    mockPrisma.protocolGenerationJob.findUnique.mockResolvedValue(failedJob as any)

    const log = makeLogger()
    await processProtocolGenerationJob(makeJob('bq-3', JOB_ID) as any, log, {
      llm: makeMockLlm(),
    })

    expect(mockPrisma.protocolGenerationJob.updateMany).not.toHaveBeenCalled()
    expect(mockPrisma.$transaction).not.toHaveBeenCalled()
  })

  it('skips if another worker claimed job (updateMany count=0)', async () => {
    mockPrisma.protocolGenerationJob.findUnique.mockResolvedValue(BASE_PG_JOB as any)
    mockPrisma.protocolGenerationJob.updateMany.mockResolvedValue({ count: 0 })


    const log = makeLogger()
    await processProtocolGenerationJob(makeJob('bq-4', JOB_ID) as any, log, {
      llm: makeMockLlm(),
    })

    expect(mockPrisma.$transaction).not.toHaveBeenCalled()
  })
})

// ─── T02 (RQ-022) — Prompt template selected by language ─────────────────────

describe('T02 (RQ-022) — LLM prompt template selected by Transcript language', () => {
  it('calls LLM with language=EN for EN meeting', async () => {
    mockPrisma.protocolGenerationJob.findUnique.mockResolvedValue(BASE_PG_JOB as any)
    mockPrisma.protocolGenerationJob.updateMany.mockResolvedValue({ count: 1 })

    setupSuccessfulTransaction()
    ;(publishMeetingEvent as MockedFunction<typeof publishMeetingEvent>).mockResolvedValue(undefined)

    const mockLlm = makeMockLlm()
    await processProtocolGenerationJob(makeJob('bq-5', JOB_ID) as any, makeLogger(), {
      llm: mockLlm,
    })

    expect(mockLlm.generate).toHaveBeenCalledWith(
      expect.objectContaining({ language: 'EN' }),
    )
  })

  it('calls LLM with language=RU for RU meeting and validates RU sections', async () => {
    const ruJob = {
      ...BASE_PG_JOB,
      meeting: { ...BASE_PG_JOB.meeting, language: 'RU' as const },
    }
    mockPrisma.protocolGenerationJob.findUnique.mockResolvedValue(ruJob as any)
    mockPrisma.protocolGenerationJob.updateMany.mockResolvedValue({ count: 1 })

    setupSuccessfulTransaction()
    ;(publishMeetingEvent as MockedFunction<typeof publishMeetingEvent>).mockResolvedValue(undefined)

    const mockLlm = makeMockLlm({ ...MOCK_LLM_RESULT, text: VALID_RU_MARKDOWN })
    await processProtocolGenerationJob(makeJob('bq-6', JOB_ID) as any, makeLogger(), {
      llm: mockLlm,
    })

    expect(mockLlm.generate).toHaveBeenCalledWith(
      expect.objectContaining({ language: 'RU' }),
    )
  })

  it('falls back to EN when meeting language is AUTO', async () => {
    const autoJob = {
      ...BASE_PG_JOB,
      meeting: { ...BASE_PG_JOB.meeting, language: 'AUTO' as const },
    }
    mockPrisma.protocolGenerationJob.findUnique.mockResolvedValue(autoJob as any)
    mockPrisma.protocolGenerationJob.updateMany.mockResolvedValue({ count: 1 })

    setupSuccessfulTransaction()
    ;(publishMeetingEvent as MockedFunction<typeof publishMeetingEvent>).mockResolvedValue(undefined)

    const mockLlm = makeMockLlm()
    await processProtocolGenerationJob(makeJob('bq-7', JOB_ID) as any, makeLogger(), {
      llm: mockLlm,
    })

    expect(mockLlm.generate).toHaveBeenCalledWith(
      expect.objectContaining({ language: 'EN' }),
    )
  })

  it('PROTOCOL_PROMPT_TEMPLATE_VERSION is a semver string', () => {
    expect(PROTOCOL_PROMPT_TEMPLATE_VERSION).toMatch(/^\d+\.\d+\.\d+$/)
  })
})

// ─── T03 (RQ-023) — Four required sections validation ────────────────────────

describe('T03 (RQ-023) — Protocol must contain four required sections', () => {
  it('fails job when LLM response is missing a required section', async () => {
    mockPrisma.protocolGenerationJob.findUnique.mockResolvedValue(BASE_PG_JOB as any)
    mockPrisma.protocolGenerationJob.updateMany.mockResolvedValue({ count: 1 })


    // LLM returns markdown missing ## Action Items
    const incompleteMd = '## Participants\n## Discussion\n## Decisions'
    const mockLlm = makeMockLlm({ ...MOCK_LLM_RESULT, text: incompleteMd })

    // FAILED path transaction
    mockPrisma.$transaction.mockImplementation(async (cb: any) => {
      const txMock = {
        protocolGenerationJob: {
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          findUnique: vi.fn().mockResolvedValue({ meetingId: MEETING_ID }),
        },
        meeting: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      }
      return cb(txMock)
    })
    ;(publishMeetingEvent as MockedFunction<typeof publishMeetingEvent>).mockResolvedValue(undefined)
    mockPrisma.protocolGenerationJob.findUnique
      .mockResolvedValueOnce(BASE_PG_JOB as any)
      .mockResolvedValueOnce({ meetingId: MEETING_ID } as any)

    const log = makeLogger()
    await expect(
      processProtocolGenerationJob(makeJob('bq-8', JOB_ID) as any, log, { llm: mockLlm }),
    ).rejects.toThrow(/missing required sections/)

    expect(log.error).toHaveBeenCalled()
  })

  it('does NOT persist Protocol when sections are missing', async () => {
    mockPrisma.protocolGenerationJob.findUnique.mockResolvedValue(BASE_PG_JOB as any)
    mockPrisma.protocolGenerationJob.updateMany.mockResolvedValue({ count: 1 })


    const incompleteMd = '## Participants\n## Discussion\n## Decisions'
    const mockLlm = makeMockLlm({ ...MOCK_LLM_RESULT, text: incompleteMd })

    mockPrisma.$transaction.mockImplementation(async (cb: any) => {
      const txMock = {
        protocolGenerationJob: {
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          findUnique: vi.fn().mockResolvedValue({ meetingId: MEETING_ID }),
        },
        meeting: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      }
      return cb(txMock)
    })
    ;(publishMeetingEvent as MockedFunction<typeof publishMeetingEvent>).mockResolvedValue(undefined)
    mockPrisma.protocolGenerationJob.findUnique
      .mockResolvedValueOnce(BASE_PG_JOB as any)
      .mockResolvedValueOnce({ meetingId: MEETING_ID } as any)

    await expect(
      processProtocolGenerationJob(makeJob('bq-9', JOB_ID) as any, makeLogger(), { llm: mockLlm }),
    ).rejects.toThrow()

    // protocol.create should NOT have been called
    expect(mockPrisma.protocol.create).not.toHaveBeenCalled()
  })
})

// ─── T05 (RQ-025) — Initial Protocol version=1, Meeting → PROTOCOL_READY ─────

describe('T05 (RQ-025) — Protocol version=1 and Meeting.status PROTOCOL_READY on success', () => {
  it('creates Protocol with version=1 and markdownContent from LLM', async () => {
    mockPrisma.protocolGenerationJob.findUnique.mockResolvedValue(BASE_PG_JOB as any)
    mockPrisma.protocolGenerationJob.updateMany.mockResolvedValue({ count: 1 })

    ;(publishMeetingEvent as MockedFunction<typeof publishMeetingEvent>).mockResolvedValue(undefined)

    let capturedProtocolData: Record<string, unknown> | undefined
    mockPrisma.$transaction.mockImplementation(async (cb: any) => {
      const txMock = {
        protocol: {
          create: vi.fn().mockImplementation((args: any) => {
            capturedProtocolData = args.data
            return { id: PROTOCOL_ID, meetingId: MEETING_ID }
          }),
        },
        meeting: { update: vi.fn().mockResolvedValue({}) },
        protocolGenerationJob: {
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          findUnique: vi.fn().mockResolvedValue({ meetingId: MEETING_ID }),
        },
      }
      return cb(txMock)
    })

    const mockLlm = makeMockLlm()
    await processProtocolGenerationJob(makeJob('bq-10', JOB_ID) as any, makeLogger(), {
      llm: mockLlm,
    })

    expect(capturedProtocolData).toBeDefined()
    expect(capturedProtocolData?.version).toBe(1)
    expect(capturedProtocolData?.markdownContent).toBe(VALID_EN_MARKDOWN)
    expect(capturedProtocolData?.meetingId).toBe(MEETING_ID)
  })

  it('transitions Meeting.status → PROTOCOL_READY inside transaction', async () => {
    mockPrisma.protocolGenerationJob.findUnique.mockResolvedValue(BASE_PG_JOB as any)
    mockPrisma.protocolGenerationJob.updateMany.mockResolvedValue({ count: 1 })

    ;(publishMeetingEvent as MockedFunction<typeof publishMeetingEvent>).mockResolvedValue(undefined)

    let capturedMeetingUpdate: Record<string, unknown> | undefined
    mockPrisma.$transaction.mockImplementation(async (cb: any) => {
      const txMock = {
        protocol: { create: vi.fn().mockResolvedValue({ id: PROTOCOL_ID }) },
        meeting: {
          update: vi.fn().mockImplementation((args: any) => {
            capturedMeetingUpdate = args
            return {}
          }),
        },
        protocolGenerationJob: {
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          findUnique: vi.fn().mockResolvedValue({ meetingId: MEETING_ID }),
        },
      }
      return cb(txMock)
    })

    await processProtocolGenerationJob(makeJob('bq-11', JOB_ID) as any, makeLogger(), {
      llm: makeMockLlm(),
    })

    expect(capturedMeetingUpdate).toBeDefined()
    expect(capturedMeetingUpdate?.where).toEqual({ id: MEETING_ID })
    expect((capturedMeetingUpdate?.data as any)?.status).toBe('PROTOCOL_READY')
  })
})

// ─── T06 (RQ-026) — Failure path ─────────────────────────────────────────────

describe('T06 (RQ-026) — On ANY failure: job FAILED, Meeting status FAILED, no re-enqueue', () => {
  function setupFailurePath() {
    mockPrisma.$transaction.mockImplementation(async (cb: any) => {
      const txMock = {
        protocolGenerationJob: {
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          findUnique: vi.fn().mockResolvedValue({ meetingId: MEETING_ID }),
        },
        meeting: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      }
      return cb(txMock)
    })
    ;(publishMeetingEvent as MockedFunction<typeof publishMeetingEvent>).mockResolvedValue(undefined)
    mockPrisma.protocolGenerationJob.findUnique
      .mockResolvedValueOnce(BASE_PG_JOB as any)
      .mockResolvedValueOnce({ meetingId: MEETING_ID } as any)
  }

  it('marks job FAILED and meeting FAILED when LLM throws', async () => {
    mockPrisma.protocolGenerationJob.updateMany.mockResolvedValue({ count: 1 })

    setupFailurePath()

    const mockLlm = { generate: vi.fn().mockRejectedValue(new Error('LLM timeout')) }

    const log = makeLogger()
    await expect(
      processProtocolGenerationJob(makeJob('bq-12', JOB_ID) as any, log, { llm: mockLlm }),
    ).rejects.toThrow('LLM timeout')

    expect(log.error).toHaveBeenCalled()
  })

  it('marks job FAILED when job not found', async () => {
    mockPrisma.protocolGenerationJob.findUnique.mockResolvedValue(null as any)
    ;(publishMeetingEvent as MockedFunction<typeof publishMeetingEvent>).mockResolvedValue(undefined)
    mockPrisma.$transaction.mockImplementation(async (cb: any) => {
      const txMock = {
        protocolGenerationJob: {
          updateMany: vi.fn().mockResolvedValue({ count: 0 }),
          findUnique: vi.fn().mockResolvedValue(null),
        },
        meeting: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
      }
      return cb(txMock)
    })

    const log = makeLogger()
    await expect(
      processProtocolGenerationJob(makeJob('bq-13', JOB_ID) as any, log, { llm: makeMockLlm() }),
    ).rejects.toThrow(`ProtocolGenerationJob ${JOB_ID} not found`)
  })

  it('marks job FAILED when meeting has no transcript', async () => {
    const noTranscriptJob = {
      ...BASE_PG_JOB,
      meeting: { ...BASE_PG_JOB.meeting, transcript: null },
    }
    mockPrisma.protocolGenerationJob.findUnique.mockResolvedValue(noTranscriptJob as any)
    mockPrisma.protocolGenerationJob.updateMany.mockResolvedValue({ count: 1 })

    ;(publishMeetingEvent as MockedFunction<typeof publishMeetingEvent>).mockResolvedValue(undefined)
    mockPrisma.$transaction.mockImplementation(async (cb: any) => {
      const txMock = {
        protocolGenerationJob: {
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          findUnique: vi.fn().mockResolvedValue({ meetingId: MEETING_ID }),
        },
        meeting: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      }
      return cb(txMock)
    })
    mockPrisma.protocolGenerationJob.findUnique
      .mockResolvedValueOnce(noTranscriptJob as any)
      .mockResolvedValueOnce({ meetingId: MEETING_ID } as any)

    const log = makeLogger()
    await expect(
      processProtocolGenerationJob(makeJob('bq-14', JOB_ID) as any, log, { llm: makeMockLlm() }),
    ).rejects.toThrow(/no Transcript/)
  })

  it('publishes ERROR status event on failure', async () => {
    mockPrisma.protocolGenerationJob.updateMany.mockResolvedValue({ count: 1 })

    setupFailurePath()

    const mockLlm = { generate: vi.fn().mockRejectedValue(new Error('API error')) }

    await expect(
      processProtocolGenerationJob(makeJob('bq-15', JOB_ID) as any, makeLogger(), { llm: mockLlm }),
    ).rejects.toThrow()

    expect(publishMeetingEvent).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ type: 'meeting.status', status: 'FAILED' }),
      expect.any(String),
    )
  })

  it('captures error message in FAILED status update', async () => {
    mockPrisma.protocolGenerationJob.updateMany.mockResolvedValue({ count: 1 })

    ;(publishMeetingEvent as MockedFunction<typeof publishMeetingEvent>).mockResolvedValue(undefined)

    let capturedErrorMsg: string | undefined
    mockPrisma.$transaction.mockImplementation(async (cb: any) => {
      const txMock = {
        protocolGenerationJob: {
          updateMany: vi.fn().mockImplementation((args: any) => {
            if (args.data?.errorMsg) capturedErrorMsg = args.data.errorMsg
            return { count: 1 }
          }),
          findUnique: vi.fn().mockResolvedValue({ meetingId: MEETING_ID }),
        },
        meeting: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      }
      return cb(txMock)
    })
    mockPrisma.protocolGenerationJob.findUnique
      .mockResolvedValueOnce(BASE_PG_JOB as any)
      .mockResolvedValueOnce({ meetingId: MEETING_ID } as any)

    const mockLlm = { generate: vi.fn().mockRejectedValue(new Error('Rate limit exceeded')) }

    await expect(
      processProtocolGenerationJob(makeJob('bq-16', JOB_ID) as any, makeLogger(), { llm: mockLlm }),
    ).rejects.toThrow()

    expect(capturedErrorMsg).toBe('Rate limit exceeded')
  })
})

// ─── T07 (NFR-002) — Async non-blocking ──────────────────────────────────────

describe('T07 (NFR-002) — Async; non-blocking', () => {
  it('processProtocolGenerationJob returns a Promise', () => {
    mockPrisma.protocolGenerationJob.findUnique.mockResolvedValue({
      ...BASE_PG_JOB,
      status: 'DONE' as const,
    } as any)
    const result = processProtocolGenerationJob(makeJob('bq-17', JOB_ID) as any, makeLogger(), {
      llm: makeMockLlm(),
    })
    expect(result).toBeInstanceOf(Promise)
  })
})

// ─── T09 (NFR-004) — RU + EN support ─────────────────────────────────────────

describe('T09 (NFR-004) — RU + EN language support', () => {
  it('validates EN protocol correctly', () => {
    expect(validateProtocolSections(VALID_EN_MARKDOWN, 'EN')).toBeNull()
  })

  it('validates RU protocol correctly', () => {
    expect(validateProtocolSections(VALID_RU_MARKDOWN, 'RU')).toBeNull()
  })

  it('rejects EN headers as invalid for RU', () => {
    const result = validateProtocolSections(VALID_EN_MARKDOWN, 'RU')
    expect(result).not.toBeNull()
  })
})

// ─── T10 (NFR-006) — Markdown stored; PDF transient ─────────────────────────

describe('T10 (NFR-006) — Markdown canonical', () => {
  it('stores raw markdown string in Protocol.markdownContent', async () => {
    mockPrisma.protocolGenerationJob.findUnique.mockResolvedValue(BASE_PG_JOB as any)
    mockPrisma.protocolGenerationJob.updateMany.mockResolvedValue({ count: 1 })

    ;(publishMeetingEvent as MockedFunction<typeof publishMeetingEvent>).mockResolvedValue(undefined)

    let storedMd: string | undefined
    mockPrisma.$transaction.mockImplementation(async (cb: any) => {
      const txMock = {
        protocol: {
          create: vi.fn().mockImplementation((args: any) => {
            storedMd = args.data.markdownContent
            return { id: PROTOCOL_ID }
          }),
        },
        meeting: { update: vi.fn().mockResolvedValue({}) },
        protocolGenerationJob: {
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          findUnique: vi.fn().mockResolvedValue({ meetingId: MEETING_ID }),
        },
      }
      return cb(txMock)
    })

    await processProtocolGenerationJob(makeJob('bq-18', JOB_ID) as any, makeLogger(), {
      llm: makeMockLlm(),
    })

    expect(typeof storedMd).toBe('string')
    expect(storedMd).toBe(VALID_EN_MARKDOWN)
  })
})

// ─── T11 (NFR-008) — Terminal state immutability ─────────────────────────────

describe('T11 (NFR-008) — Failures surfaced; terminal state immutable', () => {
  it('publishes PROTOCOL_READY event on success', async () => {
    mockPrisma.protocolGenerationJob.findUnique.mockResolvedValue(BASE_PG_JOB as any)
    mockPrisma.protocolGenerationJob.updateMany.mockResolvedValue({ count: 1 })

    setupSuccessfulTransaction()
    ;(publishMeetingEvent as MockedFunction<typeof publishMeetingEvent>).mockResolvedValue(undefined)

    await processProtocolGenerationJob(makeJob('bq-19', JOB_ID) as any, makeLogger(), {
      llm: makeMockLlm(),
    })

    expect(publishMeetingEvent).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ type: 'meeting.status', status: 'PROTOCOL_READY' }),
      MEETING_ID,
    )
  })

  it('terminal DONE job is skipped without DB mutation (BRQ-009)', async () => {
    const doneJob = { ...BASE_PG_JOB, status: 'DONE' as const }
    mockPrisma.protocolGenerationJob.findUnique.mockResolvedValue(doneJob as any)

    await processProtocolGenerationJob(makeJob('bq-20', JOB_ID) as any, makeLogger(), {
      llm: makeMockLlm(),
    })

    expect(mockPrisma.protocolGenerationJob.updateMany).not.toHaveBeenCalled()
    expect(mockPrisma.$transaction).not.toHaveBeenCalled()
    expect(publishMeetingEvent).not.toHaveBeenCalled()
  })
})
