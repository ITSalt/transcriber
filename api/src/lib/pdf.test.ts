/**
 * TECH-014 — renderPdf unit tests
 *
 * Puppeteer's real Chromium binary is NOT required.  All tests inject a mock
 * BrowserLauncher that returns a synthetic PDF buffer starting with `%PDF-`.
 *
 * Acceptance criteria (from test-spec.md):
 *   1. renderPdf(sampleMarkdown) returns a non-empty Buffer whose first bytes
 *      match `%PDF-`
 *   2. The mock simulates that the generated HTML passed to `setContent` contains
 *      all four BRQ-011 section headers: Participants, Discussion Topics,
 *      Decisions, Action Items
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderPdf, _setBrowserLauncher, type PdfBrowser, type PdfPage } from './pdf.js'

// ─── Sample protocol markdown ─────────────────────────────────────────────────

const SAMPLE_MARKDOWN = `
# Sprint Planning Meeting

## Participants
- Alice Smith (Product Owner)
- Bob Jones (Tech Lead)
- Carol White (Developer)

## Discussion Topics
1. Sprint goal alignment
2. Backlog refinement

## Decisions
- Sprint goal: deliver PDF export feature
- Story points capped at 40 per sprint

## Action Items
- [ ] Bob: set up Puppeteer in CI
- [ ] Carol: implement renderPdf function
- [ ] Alice: update roadmap
`

// ─── Mock browser factory ─────────────────────────────────────────────────────

/**
 * Builds a mock PdfBrowser whose `page.pdf()` returns a synthetic buffer
 * beginning with the PDF magic bytes `%PDF-1.4\n`.
 *
 * The captured HTML passed to `page.setContent` is stored in `capturedHtml`
 * so assertions can inspect the rendered document.
 */
function makeMockBrowser(): { browser: PdfBrowser; capturedHtml: () => string } {
  let html = ''

  const fakePdfBytes = Buffer.concat([
    Buffer.from('%PDF-1.4\n'),
    Buffer.from('%%EOF\n'),
  ])

  const page: PdfPage = {
    setContent: vi.fn().mockImplementation(async (content: string) => {
      html = content
    }),
    pdf: vi.fn().mockResolvedValue(new Uint8Array(fakePdfBytes)),
  }

  const browser: PdfBrowser = {
    newPage: vi.fn().mockResolvedValue(page),
    close: vi.fn().mockResolvedValue(undefined),
  }

  return { browser, capturedHtml: () => html }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('renderPdf', () => {
  beforeEach(() => {
    // Ensure each test gets its own mock (no state leaks between tests)
    vi.clearAllMocks()
  })

  it('returns a non-empty Buffer', async () => {
    const { browser } = makeMockBrowser()
    const result = await renderPdf({ markdown: SAMPLE_MARKDOWN }, async () => browser)

    expect(Buffer.isBuffer(result)).toBe(true)
    expect(result.length).toBeGreaterThan(0)
  })

  it('first bytes of the returned buffer match %PDF-', async () => {
    const { browser } = makeMockBrowser()
    const result = await renderPdf({ markdown: SAMPLE_MARKDOWN }, async () => browser)

    expect(result.subarray(0, 5).toString()).toBe('%PDF-')
  })

  it('HTML passed to page.setContent contains the Participants section header', async () => {
    const { browser, capturedHtml } = makeMockBrowser()
    await renderPdf({ markdown: SAMPLE_MARKDOWN }, async () => browser)

    expect(capturedHtml()).toContain('Participants')
  })

  it('HTML passed to page.setContent contains the Discussion Topics section header', async () => {
    const { browser, capturedHtml } = makeMockBrowser()
    await renderPdf({ markdown: SAMPLE_MARKDOWN }, async () => browser)

    expect(capturedHtml()).toContain('Discussion Topics')
  })

  it('HTML passed to page.setContent contains the Decisions section header', async () => {
    const { browser, capturedHtml } = makeMockBrowser()
    await renderPdf({ markdown: SAMPLE_MARKDOWN }, async () => browser)

    expect(capturedHtml()).toContain('Decisions')
  })

  it('HTML passed to page.setContent contains the Action Items section header', async () => {
    const { browser, capturedHtml } = makeMockBrowser()
    await renderPdf({ markdown: SAMPLE_MARKDOWN }, async () => browser)

    expect(capturedHtml()).toContain('Action Items')
  })

  it('injects the document title into the HTML', async () => {
    const { browser, capturedHtml } = makeMockBrowser()
    await renderPdf(
      { markdown: SAMPLE_MARKDOWN, meta: { title: 'Q1 Kickoff', version: '2.1' } },
      async () => browser,
    )

    expect(capturedHtml()).toContain('Q1 Kickoff')
    expect(capturedHtml()).toContain('2.1')
  })

  it('closes the browser after rendering (single-shot mode)', async () => {
    const { browser } = makeMockBrowser()
    await renderPdf({ markdown: SAMPLE_MARKDOWN }, async () => browser)

    expect(browser.close).toHaveBeenCalledOnce()
  })

  it('closes the browser even if page.pdf() throws', async () => {
    const fakePdfBytes = Buffer.concat([Buffer.from('%PDF-error\n')])
    const page: PdfPage = {
      setContent: vi.fn().mockResolvedValue(undefined),
      pdf: vi.fn().mockRejectedValue(new Error('PDF generation failed')),
    }
    const browser: PdfBrowser = {
      newPage: vi.fn().mockResolvedValue(page),
      close: vi.fn().mockResolvedValue(undefined),
    }

    await expect(renderPdf({ markdown: SAMPLE_MARKDOWN }, async () => browser)).rejects.toThrow(
      'PDF generation failed',
    )

    expect(browser.close).toHaveBeenCalledOnce()
  })

  it('_setBrowserLauncher sets the module-level default launcher', async () => {
    const { browser } = makeMockBrowser()
    const mockLauncher = vi.fn().mockResolvedValue(browser)

    _setBrowserLauncher(mockLauncher)

    // Call without passing explicit launcher — should use the module-level one
    const result = await renderPdf({ markdown: '# Test' })

    expect(mockLauncher).toHaveBeenCalledOnce()
    expect(Buffer.isBuffer(result)).toBe(true)
  })
})

// ─── Acceptance: all four BRQ-011 sections in a single pass ──────────────────

describe('Acceptance: all four BRQ-011 section headers present in rendered HTML', () => {
  it('Participants, Discussion Topics, Decisions, Action Items all appear', async () => {
    const { browser, capturedHtml } = makeMockBrowser()
    await renderPdf({ markdown: SAMPLE_MARKDOWN }, async () => browser)

    const html = capturedHtml()
    expect(html).toContain('Participants')
    expect(html).toContain('Discussion Topics')
    expect(html).toContain('Decisions')
    expect(html).toContain('Action Items')
  })
})
