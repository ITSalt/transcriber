/**
 * FR-004 / RQ-048 — the real @deepgram/sdk request, captured at the fetch boundary.
 *
 * Unlike src/asr/deepgram-adapter.test.ts (which mocks the SDK), this drives the real
 * SDK with an injected fetch, so the asserted query string is exactly what would go on
 * the wire: repeated `keyterm=` parameters, no commas, within the term/token caps — and
 * no `keyterm` at all when there are no keyterms (the pre-FR-004 request).
 * It also pins the Q-2 fact (D-21): speakerCount never reaches the query.
 */
import { describe, it, expect } from 'vitest'
import { ASR_KEYTERMS_MAX, ASR_KEYTERMS_MAX_TOKENS } from '@transcrib/shared'

import { DeepgramAsrProvider } from '../../src/asr/deepgram-adapter.js'
import { buildAsrKeyterms, estimateKeytermTokens } from '../../src/asr/keyterms.js'

const EMPTY_RESPONSE = { metadata: { duration: 1 }, results: { channels: [], utterances: [] } }

function capture(): { fetch: typeof fetch; urls: URL[] } {
  const urls: URL[] = []
  const fake = (async (input: string | URL | Request) => {
    urls.push(new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url))
    return new Response(JSON.stringify(EMPTY_RESPONSE), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }) as typeof fetch
  return { fetch: fake, urls }
}

const AUDIO = new Uint8Array([0, 1, 2, 3])

describe('Deepgram request — keyterm on the wire (RQ-048)', () => {
  it('sends each keyterm as its own repeated keyterm= parameter, without commas', async () => {
    const { fetch, urls } = capture()
    const asr = new DeepgramAsrProvider('test-key', { fetch })

    await asr.transcribe({ audio: AUDIO, languageHint: 'RU', keyterms: ['Иван Петров', 'Acme, Inc.', 'ITSALT'] })

    expect(urls).toHaveLength(1)
    const sent = urls[0]!.searchParams.getAll('keyterm')
    expect(sent).toEqual(['Иван Петров', 'Acme Inc.', 'ITSALT'])
    for (const k of sent) expect(k).not.toContain(',')
    // repeated parameter, not one comma-joined value
    expect(urls[0]!.search.match(/(?:^|[?&])keyterm=/g)).toHaveLength(3)
  })

  it('never sends more than 50 terms or more than ≈450 estimated tokens', async () => {
    const { fetch, urls } = capture()
    const asr = new DeepgramAsrProvider('test-key', { fetch })
    const flood = Array.from({ length: 120 }, (_, i) => `Участник проекта номер ${i}`)

    await asr.transcribe({ audio: AUDIO, languageHint: 'RU', keyterms: flood })

    const sent = urls[0]!.searchParams.getAll('keyterm')
    expect(sent.length).toBeGreaterThan(0)
    expect(sent.length).toBeLessThanOrEqual(ASR_KEYTERMS_MAX)
    expect(sent.reduce((n, k) => n + estimateKeytermTokens(k), 0)).toBeLessThanOrEqual(ASR_KEYTERMS_MAX_TOKENS)
  })

  it('keyterms built from a snapshot reach the wire in priority order', async () => {
    const { fetch, urls } = capture()
    const asr = new DeepgramAsrProvider('test-key', { fetch })
    const keyterms = buildAsrKeyterms({
      meeting_type: null, goal: null, agenda: null, notes: null,
      previous_protocol: { source: 'none' },
      participants: [{
        name: 'Мария Котова', aliases: ['Маша'], role: null, organization: 'ООО Ромашка',
        side: 'CLIENT', source: 'project', participant_id: null,
      }],
      glossary: [{
        term: 'Transcrib', variants: [], definition: null, asr_keyterm: true,
        source: 'project', term_id: null,
      }],
    })

    await asr.transcribe({ audio: AUDIO, languageHint: null, keyterms })

    expect(urls[0]!.searchParams.getAll('keyterm')).toEqual(['Мария Котова', 'Маша', 'ООО Ромашка', 'Transcrib'])
  })

  it('without keyterms the query is exactly the pre-FR-004 request', async () => {
    for (const keyterms of [undefined, [] as string[], ['  ', ',']]) {
      const { fetch, urls } = capture()
      const asr = new DeepgramAsrProvider('test-key', { fetch })
      await asr.transcribe({ audio: AUDIO, languageHint: 'RU', ...(keyterms ? { keyterms } : {}) })
      expect(urls[0]!.pathname).toBe('/v1/listen')
      expect(urls[0]!.search).toBe(
        '?diarize=true&language=ru&model=nova-3&punctuate=true&smart_format=true&utterances=true',
      )
    }
  })

  it('Q-2 / D-21: the speaker count is not part of the ASR request', async () => {
    const { fetch, urls } = capture()
    const asr = new DeepgramAsrProvider('test-key', { fetch })
    await asr.transcribe({ audio: AUDIO, languageHint: 'RU', speakerCount: 3 })
    expect(urls[0]!.searchParams.has('min_speakers')).toBe(false)
    expect(urls[0]!.searchParams.has('max_speakers')).toBe(false)
  })
})
