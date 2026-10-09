import { describe, expect, it } from 'vitest'
import type { PrismaClient } from '@prisma/client'
import { createMeetingLoader } from './postgres.js'

function loaderFor(language: 'RU' | 'EN' | 'AUTO') {
  const prisma = {
    meeting: {
      findUnique: async () => ({
        id: 'm1',
        title: 'T',
        createdAt: new Date('2026-10-01T10:00:00Z'),
        workspaceId: 'w1',
        projectId: 'p1',
        language,
        transcript: { segmentsBlob: [{ speaker: 'SPEAKER_0', start: 0, end: 1, text: 'Hello' }], speakerMap: {} },
        protocol: null,
        project: { participants: [] },
      }),
    },
  } as unknown as PrismaClient
  return createMeetingLoader(prisma)
}

describe('createMeetingLoader speaker label language', () => {
  it.each([
    ['RU', 'Спикер 1'],
    ['AUTO', 'Спикер 1'],
    ['EN', 'Speaker 1'],
  ] as const)('%s meeting → %s', async (language, label) => {
    const src = await loaderFor(language)('m1')
    expect(src!.segments[0]!.label).toBe(label)
  })
})
