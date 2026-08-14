/**
 * Unit tests for language resolution (RQ-018, RQ-022, BRQ-005, BRQ-013 / DEC-003).
 */

import { describe, it, expect } from 'vitest'

import {
  normalizeLanguageTag,
  resolveProtocolLanguage,
  type MeetingLanguageValue,
} from './language.js'

describe('normalizeLanguageTag (RQ-018 / BRQ-005)', () => {
  it.each([
    ['ru', 'RU'],
    ['RU', 'RU'],
    ['ru-RU', 'RU'],
    ['ru_RU', 'RU'],
    ['  ru  ', 'RU'],
    ['en', 'EN'],
    ['EN', 'EN'],
    ['en-US', 'EN'],
    ['en-GB', 'EN'],
  ])('maps %s -> %s', (input, expected) => {
    expect(normalizeLanguageTag(input)).toBe(expected)
  })

  it.each(['de', 'fr', 'es', 'multi', 'auto', '', '   '])(
    'maps unsupported/absent tag %s -> null',
    (input) => {
      expect(normalizeLanguageTag(input)).toBeNull()
    },
  )

  it.each([null, undefined])('maps %s -> null', (input) => {
    expect(normalizeLanguageTag(input)).toBeNull()
  })

  it('compares the primary subtag exactly, so rue (Rusyn) is not Russian', () => {
    /*
     * MUTATION PROOF: the previous implementation used
     * `l.startsWith('ru')`, which classified 'rue' as Russian.
     */
    expect(normalizeLanguageTag('rue')).toBeNull()
    expect(normalizeLanguageTag('enm')).toBeNull()
  })

  it('never returns AUTO — that value is only legal on Meeting.language', () => {
    const inputs = ['ru', 'en', 'de', 'auto', 'multi', '', null, undefined]
    for (const input of inputs) {
      expect(normalizeLanguageTag(input)).not.toBe('AUTO')
    }
  })
})

describe('resolveProtocolLanguage (RQ-022 / BRQ-013 / DEC-003)', () => {
  it.each<[MeetingLanguageValue, string]>([
    ['EN', 'EN'],
    ['RU', 'RU'],
    ['AUTO', 'RU'],
  ])('Meeting.language=%s -> protocol language %s', (meetingLanguage, expected) => {
    expect(resolveProtocolLanguage(meetingLanguage)).toBe(expected)
  })

  it('resolves AUTO to RU — the 2026-08-14 production defect', () => {
    /*
     * MUTATION PROOF: the broken implementation was
     * `meetingLanguage === 'RU' ? 'RU' : 'EN'`, which returned 'EN' here and
     * gave every default-configured Russian meeting an English protocol.
     */
    expect(resolveProtocolLanguage('AUTO')).toBe('RU')
  })

  it('EN is the only input that yields an English protocol', () => {
    const all: MeetingLanguageValue[] = ['RU', 'EN', 'AUTO']
    const enProducing = all.filter((l) => resolveProtocolLanguage(l) === 'EN')
    expect(enProducing).toEqual(['EN'])
  })

  it('is total over the enum — every value maps to a shipped template', () => {
    /*
     * There is deliberately no fallback branch: a fallback is what turned an
     * unresolved language into a silently-wrong document.
     */
    const all: MeetingLanguageValue[] = ['RU', 'EN', 'AUTO']
    for (const l of all) {
      expect(['RU', 'EN']).toContain(resolveProtocolLanguage(l))
    }
  })
})
