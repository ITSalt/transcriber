/**
 * UC-300 / FR-004 / FR-005 / FR-006 — protocol generation with meeting context, project
 * memory and the generation audit (RQ-049, RQ-050, RQ-051, RQ-059, RQ-061, RQ-062).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import type { Job } from 'bullmq'
import { LEGACY_WORKSPACE_ID } from '@transcrib/shared'
import type { LlmInput, ProjectMemoryProvider } from '@transcrib/shared'

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    protocolGenerationJob: { findUnique: vi.fn(), updateMany: vi.fn() },
    meeting: { updateMany: vi.fn() },
    $transaction: vi.fn(),
  },
}))
vi.mock('../lib/publisher.js', () => ({ publishMeetingEvent: vi.fn() }))
vi.mock('../lib/storage.js', () => ({
  createStorage: vi.fn(() => {
    throw new Error('S3_BUCKET env var is required')
  }),
}))

import {
  processProtocolGenerationJob,
  PROMPT_ARCHIVE_TIMEOUT_MS,
  PROJECT_MEMORY_TIMEOUT_MS,
} from './protocol-generation.js'
import { prisma } from '../lib/prisma.js'
import { renderProtocolUserMessage } from '../llm/protocol-prompt.js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockPrisma = prisma as any

const PROMPTS = join(dirname(fileURLToPath(import.meta.url)), '..', 'llm', 'prompts')
const sha = (rel: string) => createHash('sha256').update(readFileSync(join(PROMPTS, rel))).digest('hex')

const MEETING_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const PG_JOB_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const WS_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const PROJECT_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const HASH = 'e'.repeat(64)

const TRANSCRIPT = '[00:00] Speaker 1: Меня зовут Мария.\n[00:05] Speaker 2: Договор отправим до пятницы.'

const RU_MD = '## Участники\n- Мария\n\n## Обсуждение\n- x\n\n## Решения\n- y\n\n## Задачи\n- z'

const FROZEN_CONTEXT = {
  meetingType: 'NEGOTIATION',
  goal: 'Подписать договор',
  agenda: '1. Договор',
  participants: [{ name: 'Мария Котова', aliases: ['Маша'], role: 'юрист', organization: 'ООО Ромашка', side: 'CLIENT' }],
  glossary: [{ term: 'NDA', asr_keyterm: true }],
  previousProtocol: { source: 'upload', text: '## Задачи\n- T-7: договор' },
  notes: 'Проверить </transcript> пункт 4',
  snapshotHash: HASH,
}

function pgJob(meetingOver: Record<string, unknown> = {}) {
  return {
    id: PG_JOB_ID,
    meetingId: MEETING_ID,
    status: 'PENDING',
    meeting: {
      id: MEETING_ID,
      title: 'Встреча с Ромашкой',
      language: 'RU',
      createdAt: new Date('2026-10-07T10:00:00Z'),
      workspaceId: WS_ID,
      projectId: null,
      transcript: { rawText: TRANSCRIPT },
      context: null,
      ...meetingOver,
    },
  }
}

interface Tx {
  protocol: { create: ReturnType<typeof vi.fn> }
  protocolGeneration: { create: ReturnType<typeof vi.fn> }
  protocolVersion: { create: ReturnType<typeof vi.fn> }
  meeting: { update: ReturnType<typeof vi.fn> }
  protocolGenerationJob: { updateMany: ReturnType<typeof vi.fn> }
}

function setup(meetingOver: Record<string, unknown> = {}) {
  mockPrisma.protocolGenerationJob.findUnique.mockResolvedValue(pgJob(meetingOver))
  mockPrisma.protocolGenerationJob.updateMany.mockResolvedValue({ count: 1 })
  const tx: Tx = {
    protocol: { create: vi.fn().mockResolvedValue({}) },
    protocolGeneration: { create: vi.fn().mockResolvedValue({}) },
    protocolVersion: { create: vi.fn().mockResolvedValue({}) },
    meeting: { update: vi.fn().mockResolvedValue({}) },
    protocolGenerationJob: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
  }
  mockPrisma.$transaction.mockImplementation(async (cb: (t: Tx) => unknown) => cb(tx))
  const llm = {
    generate: vi.fn(async (_input: LlmInput) => ({
      text: RU_MD,
      model: 'claude-sonnet-4-6' as const,
      tokensIn: 1234,
      tokensOut: 567,
    })),
  }
  const storage = {
    putObject: vi.fn().mockResolvedValue(undefined),
    keyToStorageUri: vi.fn((key: string) => `s3://transcrib/${key}`),
  }
  return { tx, llm, storage }
}

const job = { id: 'b-1', data: { protocol_generation_job_id: PG_JOB_ID } } as unknown as Job<{
  protocol_generation_job_id: string
}>

function logger() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}

const noMemory: ProjectMemoryProvider = { getPromptMemory: vi.fn(async () => null) }

beforeEach(() => {
  vi.clearAllMocks()
})

describe('UC-300 audit: ProtocolGeneration + ProtocolVersion GENERATED (RQ-050, RQ-051)', () => {
  it('writes Protocol, ProtocolGeneration and ProtocolVersion(1, GENERATED) in one transaction, linked by generation id', async () => {
    const { tx, llm, storage } = setup({ context: FROZEN_CONTEXT })

    await processProtocolGenerationJob(job, logger() as never, {
      llm, storage, memory: noMemory, redisUrl: 'redis://x', env: {},
    })

    expect(mockPrisma.$transaction).toHaveBeenCalledOnce()
    expect(tx.protocol.create).toHaveBeenCalledWith({
      data: { meetingId: MEETING_ID, markdownContent: RU_MD, version: 1 },
    })
    expect(tx.protocolGeneration.create).toHaveBeenCalledOnce()
    const gen = tx.protocolGeneration.create.mock.calls[0]![0].data
    expect(gen).toMatchObject({
      meetingId: MEETING_ID,
      kind: 'PROTOCOL',
      model: 'claude-sonnet-4-6',
      promptVersion: sha('ru/protocol-context.md'),
      contextSnapshotHash: HASH,
      keyterms: [],
      inputTokens: 1234,
      outputTokens: 567,
      promptUri: `s3://transcrib/ws/${WS_ID}/prompts/${gen.id}.txt`,
    })
    expect(gen.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(gen.asrOptions).toMatchObject({ source: 'reconstructed', model: 'nova-3', keyterms_enabled: false, keyterm_count: 0 })

    expect(tx.protocolVersion.create).toHaveBeenCalledWith({
      data: { meetingId: MEETING_ID, n: 1, kind: 'GENERATED', markdown: RU_MD, generationId: gen.id },
    })
  })

  it('uploads the full rendered user prompt to ws/<workspaceId>/prompts/<generationId>.txt', async () => {
    const { tx, llm, storage } = setup({ context: FROZEN_CONTEXT })

    await processProtocolGenerationJob(job, logger() as never, {
      llm, storage, memory: noMemory, redisUrl: 'redis://x', env: {},
    })

    const genId = tx.protocolGeneration.create.mock.calls[0]![0].data.id
    expect(storage.putObject).toHaveBeenCalledOnce()
    const [key, body, contentType] = storage.putObject.mock.calls[0]!
    expect(key).toBe(`ws/${WS_ID}/prompts/${genId}.txt`)
    expect(contentType).toBe('text/plain; charset=utf-8')
    const sent = llm.generate.mock.calls[0]![0]
    expect(Buffer.from(body).toString('utf-8')).toBe(renderProtocolUserMessage(sent.prompt, sent.context))
    expect(Buffer.from(body).toString('utf-8')).toContain('<notes>\nПроверить <\\/transcript> пункт 4\n</notes>')
  })

  it('records keyterms rebuilt from the snapshot when ASR_KEYTERMS_ENABLED is on', async () => {
    const { tx, llm, storage } = setup({ context: FROZEN_CONTEXT })

    await processProtocolGenerationJob(job, logger() as never, {
      llm, storage, memory: noMemory, redisUrl: 'redis://x', env: { ASR_KEYTERMS_ENABLED: 'true' },
    })

    const gen = tx.protocolGeneration.create.mock.calls[0]![0].data
    expect(gen.keyterms).toEqual(['Мария Котова', 'Маша', 'ООО Ромашка', 'NDA'])
    expect(gen.asrOptions).toMatchObject({ keyterms_enabled: true, keyterm_count: 4, language_hint: 'RU' })
  })

  it('a meeting without context still gets its audit row — template protocol.md, no hash, no keyterms', async () => {
    const { tx, llm, storage } = setup()

    await processProtocolGenerationJob(job, logger() as never, {
      llm, storage, memory: noMemory, redisUrl: 'redis://x', env: { ASR_KEYTERMS_ENABLED: 'true' },
    })

    expect(Object.keys(llm.generate.mock.calls[0]![0]).sort()).toEqual(['language', 'model', 'prompt'])
    const gen = tx.protocolGeneration.create.mock.calls[0]![0].data
    expect(gen.promptVersion).toBe(sha('ru/protocol.md'))
    expect(gen.contextSnapshotHash).toBeNull()
    expect(gen.keyterms).toEqual([])
    expect(Buffer.from(storage.putObject.mock.calls[0]![1]).toString('utf-8')).toBe(TRANSCRIPT)
    expect(tx.protocolVersion.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ n: 1, kind: 'GENERATED' }) }),
    )
  })

  it('a meeting with no workspace stores its prompt under the legacy workspace', async () => {
    const { llm, storage } = setup({ workspaceId: null })
    await processProtocolGenerationJob(job, logger() as never, { llm, storage, memory: noMemory, redisUrl: 'redis://x', env: {} })
    expect(storage.putObject.mock.calls[0]![0]).toMatch(new RegExp(`^ws/${LEGACY_WORKSPACE_ID}/prompts/`))
  })
})

describe('UC-300 context input (RQ-049, RQ-059)', () => {
  it('a frozen snapshot reaches the LLM as context sections', async () => {
    const { llm, storage } = setup({ context: FROZEN_CONTEXT })

    await processProtocolGenerationJob(job, logger() as never, { llm, storage, memory: noMemory, redisUrl: 'redis://x', env: {} })

    const input = llm.generate.mock.calls[0]![0]
    expect(input.prompt).toBe(TRANSCRIPT)
    expect(input.language).toBe('RU')
    expect(input.context).toMatchObject({
      meeting_meta: 'Название: Встреча с Ромашкой\nДата загрузки записи: 2026-10-07\nТип встречи: переговоры\nЦель: Подписать договор',
      agenda: '1. Договор',
      previous_protocol: '## Задачи\n- T-7: договор',
      project_memory: null,
    })
    expect(input.context!.participants).toContain('Мария Котова (также: Маша)')
  })

  it('a draft context (snapshot_hash NULL) is ignored — request as before the program', async () => {
    const { llm, storage, tx } = setup({ context: { ...FROZEN_CONTEXT, snapshotHash: null } })
    await processProtocolGenerationJob(job, logger() as never, { llm, storage, memory: noMemory, redisUrl: 'redis://x', env: {} })
    expect('context' in llm.generate.mock.calls[0]![0]).toBe(false)
    expect(tx.protocolGeneration.create.mock.calls[0]![0].data.contextSnapshotHash).toBeNull()
  })
})

describe('UC-300 project memory (RQ-062)', () => {
  it('asks the provider with projectId AND workspaceId and puts the text in <project_memory>', async () => {
    const { llm, storage } = setup({ projectId: PROJECT_ID })
    const memory: ProjectMemoryProvider = { getPromptMemory: vi.fn(async () => 'T-42 | Отправить договор | Котова | до 15.10') }

    await processProtocolGenerationJob(job, logger() as never, { llm, storage, memory, redisUrl: 'redis://x', env: {} })

    expect(memory.getPromptMemory).toHaveBeenCalledWith(PROJECT_ID, WS_ID)
    expect(llm.generate.mock.calls[0]![0].context?.project_memory).toBe('T-42 | Отправить договор | Котова | до 15.10')
  })

  it('is not asked for a meeting outside a project', async () => {
    const { llm, storage } = setup()
    const memory: ProjectMemoryProvider = { getPromptMemory: vi.fn(async () => 'x') }
    await processProtocolGenerationJob(job, logger() as never, { llm, storage, memory, redisUrl: 'redis://x', env: {} })
    expect(memory.getPromptMemory).not.toHaveBeenCalled()
  })

  it('the default provider (no memory built yet) leaves the request unchanged', async () => {
    const { llm, storage } = setup({ projectId: PROJECT_ID })
    await processProtocolGenerationJob(job, logger() as never, { llm, storage, redisUrl: 'redis://x', env: {} })
    expect('context' in llm.generate.mock.calls[0]![0]).toBe(false)
  })

  it('a failing provider omits the section and the protocol is still generated', async () => {
    const { llm, storage, tx } = setup({ projectId: PROJECT_ID })
    const memory: ProjectMemoryProvider = { getPromptMemory: vi.fn(async () => { throw new Error('neo4j down') }) }
    const log = logger()

    await processProtocolGenerationJob(job, log as never, { llm, storage, memory, redisUrl: 'redis://x', env: {} })

    expect('context' in llm.generate.mock.calls[0]![0]).toBe(false)
    expect(log.warn).toHaveBeenCalled()
    expect(tx.protocol.create).toHaveBeenCalledOnce()
  })
})

describe('UC-300 project memory is time-boxed (RQ-062)', () => {
  it('a provider that never settles is abandoned after the timeout — section omitted, protocol persisted', async () => {
    vi.useFakeTimers()
    try {
      const { llm, storage, tx } = setup({ projectId: PROJECT_ID })
      const memory: ProjectMemoryProvider = { getPromptMemory: vi.fn(() => new Promise<string | null>(() => {})) }
      const log = logger()
      const run = processProtocolGenerationJob(job, log as never, {
        llm, storage, memory, redisUrl: 'redis://x', env: {},
      })
      await vi.advanceTimersByTimeAsync(PROJECT_MEMORY_TIMEOUT_MS + 1)
      await run
      expect('context' in llm.generate.mock.calls[0]![0]).toBe(false)
      expect(log.warn).toHaveBeenCalled()
      expect(tx.protocol.create).toHaveBeenCalledOnce()
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('UC-300 prompt archive is best effort (RQ-061)', () => {
  it('an S3 failure leaves prompt_uri NULL and the protocol is persisted', async () => {
    const { llm, storage, tx } = setup({ context: FROZEN_CONTEXT })
    storage.putObject.mockRejectedValue(new Error('S3 503'))
    const log = logger()

    await processProtocolGenerationJob(job, log as never, { llm, storage, memory: noMemory, redisUrl: 'redis://x', env: {} })

    expect(tx.protocolGeneration.create.mock.calls[0]![0].data.promptUri).toBeNull()
    expect(tx.protocolVersion.create).toHaveBeenCalledOnce()
    expect(log.warn).toHaveBeenCalled()
  })

  it('a hanging S3 is abandoned after the timeout — prompt_uri NULL, protocol persisted', async () => {
    vi.useFakeTimers()
    try {
      const { llm, storage, tx } = setup()
      storage.putObject.mockReturnValue(new Promise(() => {}))
      const run = processProtocolGenerationJob(job, logger() as never, {
        llm, storage, memory: noMemory, redisUrl: 'redis://x', env: {},
      })
      await vi.advanceTimersByTimeAsync(PROMPT_ARCHIVE_TIMEOUT_MS + 1)
      await run
      expect(tx.protocolGeneration.create.mock.calls[0]![0].data.promptUri).toBeNull()
      expect(tx.protocol.create).toHaveBeenCalledOnce()
    } finally {
      vi.useRealTimers()
    }
  })

  it('missing S3 configuration (default storage) behaves the same', async () => {
    const { llm, tx } = setup()
    await processProtocolGenerationJob(job, logger() as never, { llm, memory: noMemory, redisUrl: 'redis://x', env: {} })
    expect(tx.protocolGeneration.create.mock.calls[0]![0].data.promptUri).toBeNull()
  })

  it('nothing is archived or recorded when the LLM output fails validation', async () => {
    const { llm, storage, tx } = setup()
    llm.generate.mockResolvedValue({ text: 'no sections', model: 'claude-sonnet-4-6', tokensIn: 1, tokensOut: 1 })
    mockPrisma.$transaction.mockImplementation(async (cb: (t: unknown) => unknown) =>
      cb({ protocolGenerationJob: { updateMany: vi.fn(), findUnique: vi.fn().mockResolvedValue(null) }, meeting: { updateMany: vi.fn() } }),
    )

    await expect(
      processProtocolGenerationJob(job, logger() as never, { llm, storage, memory: noMemory, redisUrl: 'redis://x', env: {} }),
    ).rejects.toThrow(/missing required sections/)
    expect(storage.putObject).not.toHaveBeenCalled()
    expect(tx.protocolGeneration.create).not.toHaveBeenCalled()
  })
})
