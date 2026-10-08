/**
 * FR-004 / RQ-048 / RQ-059 — ASR keyterms from a frozen meeting-context snapshot.
 */
import { describe, it, expect } from 'vitest'
import { ASR_KEYTERMS_MAX, ASR_KEYTERMS_MAX_TOKENS } from '@transcrib/shared'
import type { MeetingContextSnapshot } from '@transcrib/shared'

import {
  buildAsrKeyterms,
  capKeyterms,
  estimateKeytermTokens,
  isAsrKeytermsEnabled,
  frozenContextSnapshot,
} from './keyterms.js'

function snapshot(over: Partial<MeetingContextSnapshot> = {}): MeetingContextSnapshot {
  return {
    meeting_type: null,
    goal: null,
    agenda: null,
    participants: [],
    glossary: [],
    previous_protocol: { source: 'none' },
    notes: null,
    ...over,
  }
}

function participant(name: string, extra: Record<string, unknown> = {}) {
  return {
    name,
    aliases: [],
    role: null,
    organization: null,
    side: 'OTHER' as const,
    source: 'meeting' as const,
    participant_id: null,
    ...extra,
  }
}

function term(t: string, asr_keyterm: boolean, extra: Record<string, unknown> = {}) {
  return {
    term: t,
    variants: [],
    definition: null,
    asr_keyterm,
    source: 'meeting' as const,
    term_id: null,
    ...extra,
  }
}

describe('buildAsrKeyterms — priority order and filtering (RQ-048)', () => {
  it('names and aliases first, then organizations, then asr_keyterm glossary terms', () => {
    const s = snapshot({
      participants: [
        participant('Иван Петров', { aliases: ['Ваня'], organization: 'ITSALT' }),
        participant('Anna Smith', { organization: 'Acme Corp' }),
      ],
      glossary: [term('Kubernetes', true), term('синергия', false), term('Transcrib', true)],
    })
    expect(buildAsrKeyterms(s)).toEqual([
      'Иван Петров',
      'Ваня',
      'Anna Smith',
      'ITSALT',
      'Acme Corp',
      'Kubernetes',
      'Transcrib',
    ])
  })

  it('drops glossary terms without asr_keyterm and does not send their variants', () => {
    const s = snapshot({ glossary: [term('ДДУ', false), term('Нова', true, { variants: ['Nova'] })] })
    expect(buildAsrKeyterms(s)).toEqual(['Нова'])
  })

  it('deduplicates case-insensitively, keeping the first spelling', () => {
    const s = snapshot({
      participants: [participant('ITSALT'), participant('Pavel', { organization: 'itsalt' })],
      glossary: [term('pavel', true)],
    })
    expect(buildAsrKeyterms(s)).toEqual(['ITSALT', 'Pavel'])
  })

  it('never emits a comma: commas become spaces, whitespace is collapsed', () => {
    const s = snapshot({ participants: [participant('Петров,  Иван'), participant('Acme, Inc.')] })
    const out = buildAsrKeyterms(s)
    expect(out).toEqual(['Петров Иван', 'Acme Inc.'])
    for (const k of out) expect(k).not.toContain(',')
  })

  it('an empty snapshot yields no keyterms', () => {
    expect(buildAsrKeyterms(snapshot())).toEqual([])
  })
})

describe('capKeyterms — ≤ ASR_KEYTERMS_MAX terms and ≈ ≤ ASR_KEYTERMS_MAX_TOKENS tokens', () => {
  it('stops at 50 terms even when the token budget is not reached', () => {
    const many = Array.from({ length: 80 }, (_, i) => `T${i}`)
    const out = capKeyterms(many)
    expect(out).toHaveLength(ASR_KEYTERMS_MAX)
    expect(out[0]).toBe('T0')
    expect(out[49]).toBe('T49')
  })

  it('stops before the token estimate would exceed 450, keeping priority order', () => {
    const long = Array.from({ length: 50 }, (_, i) => `Длинное составное наименование организации номер ${i}`)
    const out = capKeyterms(long)
    const total = out.reduce((n, k) => n + estimateKeytermTokens(k), 0)
    expect(out.length).toBeLessThan(50)
    expect(out.length).toBeGreaterThan(0)
    expect(total).toBeLessThanOrEqual(ASR_KEYTERMS_MAX_TOKENS)
    expect(out).toEqual(long.slice(0, out.length))
  })

  it('is idempotent', () => {
    const terms = ['a', 'b', 'A', 'c,d']
    expect(capKeyterms(capKeyterms(terms))).toEqual(capKeyterms(terms))
    expect(capKeyterms(terms)).toEqual(['a', 'b', 'c d'])
  })
})

describe('estimateKeytermTokens — conservative', () => {
  it('Cyrillic costs more than Latin of the same length', () => {
    expect(estimateKeytermTokens('Петров')).toBeGreaterThan(estimateKeytermTokens('Petrov'))
  })
  it('digits and punctuation count a token each', () => {
    // 1С:ERP-2026 → 1,:,-,2,0,2,6 = 7 symbols + ceil(3/3 + 1/2) = 2 letters + 1 separator
    expect(estimateKeytermTokens('1С:ERP-2026')).toBe(10)
    expect(estimateKeytermTokens('ABC123')).toBeGreaterThanOrEqual(5)
  })
  it('never estimates less than one token per word', () => {
    expect(estimateKeytermTokens('a b c d')).toBeGreaterThanOrEqual(4)
  })
})

describe('isAsrKeytermsEnabled — ASR_KEYTERMS_ENABLED, off by default (Q-1)', () => {
  it('is off when unset or anything but an explicit yes', () => {
    expect(isAsrKeytermsEnabled({})).toBe(false)
    expect(isAsrKeytermsEnabled({ ASR_KEYTERMS_ENABLED: '' })).toBe(false)
    expect(isAsrKeytermsEnabled({ ASR_KEYTERMS_ENABLED: 'false' })).toBe(false)
    expect(isAsrKeytermsEnabled({ ASR_KEYTERMS_ENABLED: '0' })).toBe(false)
  })
  it('is on for true / 1 / yes (case-insensitive)', () => {
    expect(isAsrKeytermsEnabled({ ASR_KEYTERMS_ENABLED: 'true' })).toBe(true)
    expect(isAsrKeytermsEnabled({ ASR_KEYTERMS_ENABLED: 'TRUE' })).toBe(true)
    expect(isAsrKeytermsEnabled({ ASR_KEYTERMS_ENABLED: '1' })).toBe(true)
    expect(isAsrKeytermsEnabled({ ASR_KEYTERMS_ENABLED: ' yes ' })).toBe(true)
  })
})

describe('frozenContextSnapshot — RQ-059', () => {
  const row = {
    meetingType: 'STATUS',
    goal: 'Договориться о сроках',
    agenda: null,
    participants: [{ name: 'Иван' }],
    glossary: [],
    previousProtocol: { source: 'none' },
    notes: null,
    snapshotHash: 'abc123',
  }

  it('returns null without a row', () => {
    expect(frozenContextSnapshot(null)).toBeNull()
    expect(frozenContextSnapshot(undefined)).toBeNull()
  })

  it('returns null for a draft (snapshotHash NULL)', () => {
    expect(frozenContextSnapshot({ ...row, snapshotHash: null })).toBeNull()
  })

  it('parses a frozen row into the shared snapshot shape with defaults applied', () => {
    const out = frozenContextSnapshot(row)
    expect(out).not.toBeNull()
    expect(out!.hash).toBe('abc123')
    expect(out!.snapshot.meeting_type).toBe('STATUS')
    expect(out!.snapshot.participants[0]).toMatchObject({ name: 'Иван', aliases: [], side: 'OTHER' })
  })

  it('treats a frozen row that fails the schema as no context and reports it', () => {
    const warnings: string[] = []
    const out = frozenContextSnapshot({ ...row, participants: 'not-an-array' }, (m) => warnings.push(m))
    expect(out).toBeNull()
    expect(warnings).toHaveLength(1)
  })
})
