/**
 * WP-API-FEEDBACK-01 / D-12 — .docx review extraction on a fixture assembled in the test:
 * 2 comments, 1 insertion, 1 deletion.
 */
import { describe, it, expect } from 'vitest'
import { extractDocxPlainText, extractDocxReview } from './docx.js'
import { COMMENTS_XML, DOCUMENT_XML, W, buildDocx, reviewDocx } from './docx.fixture.js'

describe('extractDocxReview', () => {
  it('extracts both comments with author, date, text and anchored text', async () => {
    const out = await extractDocxReview(await reviewDocx())
    expect(out.error).toBeNull()
    expect(out.comments).toEqual([
      {
        id: '0',
        author: 'Анна',
        date: '2026-05-01T10:00:00Z',
        text: 'Это решение, а не обсуждение',
        anchored_text: 'запускаем в июне',
      },
      {
        id: '1',
        author: 'Борис',
        date: '2026-05-01T11:30:00Z',
        text: 'Задача\nназначена не тому',
        // the deleted word is not visible to a reader, the inserted one is
        anchored_text: 'Иван подготовит бюджет',
      },
    ])
  })

  it('extracts the insertion and the deletion', async () => {
    const out = await extractDocxReview(await reviewDocx())
    expect(out.revisions).toEqual([
      { type: 'ins', author: 'Анна', date: '2026-05-01T10:05:00Z', text: 'бюджет' },
      { type: 'del', author: 'Борис', date: '2026-05-01T10:06:00Z', text: 'отчёт' },
    ])
  })

  it('builds the accepted and the original text', async () => {
    const out = await extractDocxReview(await reviewDocx())
    expect(out.accepted_text).toBe('Итоги: запускаем в июне\nИван подготовит бюджет')
    expect(out.original_text).toBe('Итоги: запускаем в июне\nИван подготовит отчёт')
    expect(out.plain_text).toBeNull()
  })

  it('works without comments.xml', async () => {
    const out = await extractDocxReview(await buildDocx({ 'word/document.xml': DOCUMENT_XML }))
    expect(out.error).toBeNull()
    expect(out.comments).toEqual([])
    expect(out.revisions).toHaveLength(2)
  })

  it('a comment without a range has empty anchored text', async () => {
    const out = await extractDocxReview(
      await buildDocx({
        'word/document.xml': `<w:document ${W}><w:body><w:p><w:r><w:t>x</w:t></w:r></w:p></w:body></w:document>`,
        'word/comments.xml': COMMENTS_XML,
      }),
    )
    expect(out.comments.map((c) => c.anchored_text)).toEqual(['', ''])
  })

  it('ignores paragraph-mark revisions that carry no text', async () => {
    const xml = `<w:document ${W}><w:body><w:p><w:pPr><w:rPr><w:ins w:id="1" w:author="A"/></w:rPr></w:pPr><w:r><w:t>ok</w:t></w:r></w:p></w:body></w:document>`
    const out = await extractDocxReview(await buildDocx({ 'word/document.xml': xml }))
    expect(out.revisions).toEqual([])
    expect(out.accepted_text).toBe('ok')
  })

  it('a broken file does not throw: error is set, nothing else is extracted', async () => {
    const out = await extractDocxReview(Buffer.from('PK\u0003\u0004 this is not a real zip archive'))
    expect(out.error).toEqual(expect.any(String))
    expect(out.error).not.toBe('')
    expect(out.comments).toEqual([])
    expect(out.revisions).toEqual([])
    expect(out.accepted_text).toBeNull()
  })

  it('a zip without word/document.xml is an error, not a crash', async () => {
    const out = await extractDocxReview(await buildDocx({ 'other.xml': '<a/>' }))
    expect(out.error).toMatch(/document\.xml/)
  })

  it('malformed document xml is an error', async () => {
    const out = await extractDocxReview(await buildDocx({ 'word/document.xml': '<w:document><w:body></w:document>' }))
    expect(out.error).toEqual(expect.any(String))
  })
})

describe('extractDocxPlainText', () => {
  it('returns the flat text with tracked changes accepted', async () => {
    const out = await extractDocxPlainText(await reviewDocx())
    expect(out).toMatchObject({
      plain_text: 'Итоги: запускаем в июне\nИван подготовит бюджет',
      comments: [],
      revisions: [],
      error: null,
    })
  })

  it('keeps only the error for a broken file', async () => {
    const out = await extractDocxPlainText(Buffer.from('PK\u0003\u0004garbage'))
    expect(out.error).toEqual(expect.any(String))
    expect(out.plain_text).toBeNull()
  })
})
