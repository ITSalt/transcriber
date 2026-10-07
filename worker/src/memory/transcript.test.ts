import { describe, expect, it } from 'vitest'
import { createQuoteVerifier, renderNumberedTranscript, toMemorySegments, verifyQuote } from './transcript.js'

const segments = toMemorySegments(
  [
    { speaker: 'SPEAKER_0', start: 0, end: 3.2, text: 'Добрый день, начинаем.' },
    { speaker: 'SPEAKER_1', start: 3.5, end: 9.1, text: 'Договор отправил вчера вечером, ждём ответа.' },
    { speaker: 'SPEAKER_0', start: 9.4, end: 11.0, text: 'Хорошо. Ещё нужно' },
    { speaker: 'SPEAKER_0', start: 11.2, end: 15.0, text: 'подготовить смету по второму этапу.' },
    { speaker: 'SPEAKER_1', start: 16.0, end: 20.0, text: 'Договор отправил, повторю.' },
    { foo: 'malformed' },
  ],
  { SPEAKER_0: 'Петров' },
)

describe('memory transcript', () => {
  it('parses segments, skips malformed ones, labels speakers like the transcript', () => {
    expect(segments).toHaveLength(5)
    expect(segments[0]).toMatchObject({ index: 0, label: 'Петров', startMs: 0, endMs: 3200 })
    expect(segments[1]!.label).toBe('Speaker 2')
    expect(renderNumberedTranscript(segments).split('\n')[1]).toBe('[#1] [00:03] Speaker 2: Договор отправил вчера вечером, ждём ответа.')
  })

  it('accepts an exact quote regardless of case, punctuation and ё; timecode and speaker come from the segment', () => {
    const v = verifyQuote('договор ОТПРАВИЛ вчера вечером', segments, 1)
    expect(v).toMatchObject({ startMs: 3500, endMs: 9100, speakerLabel: 'Speaker 2', segmentIndex: 1, match: 'exact' })
  })

  it('a quote spanning two segments gets the start of the first and the end of the last', () => {
    expect(verifyQuote('Ещё нужно подготовить смету', segments, 2)).toMatchObject({ startMs: 9400, endMs: 15000, segmentIndex: 2 })
  })

  it('picks the occurrence nearest to the segment the LLM pointed at', () => {
    expect(verifyQuote('Договор отправил', segments, 4)!.segmentIndex).toBe(4)
    expect(verifyQuote('Договор отправил', segments, 0)!.segmentIndex).toBe(1)
  })

  it('accepts a near-verbatim quote (fuzzy ≥ 85 % of words) and rejects an invented one', () => {
    const verify = createQuoteVerifier(segments)
    expect(verify('договор отправил вчера вечером ждём ответа сегодня утром', 1)).toBeNull() // 6/8 words < 0.85
    expect(verify('отправил договор вчера вечером ждём ответа', 1)).toMatchObject({ match: 'fuzzy', segmentIndex: 1 })
    expect(verify('Сидоров обещал закупить сервер до конца недели', 1)).toBeNull()
  })

  it('rejects too short quotes', () => {
    expect(verifyQuote('да', segments, 0)).toBeNull()
  })
})
