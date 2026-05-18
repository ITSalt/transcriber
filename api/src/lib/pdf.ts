/**
 * TECH-014 — Puppeteer PDF renderer
 *
 * Converts a Markdown string to a PDF Buffer using:
 *   1. remark + remark-html  — Markdown → HTML fragment
 *   2. An HTML template       — wraps the fragment with page styles
 *   3. Puppeteer              — renders the full HTML document to PDF
 *
 * The rendered PDF is returned as a Buffer and is NEVER persisted (BRQ-017).
 * Puppeteer is launched in single-shot mode: one browser per call, closed
 * immediately after the PDF byte-array is captured.
 *
 * The `_launchBrowser` export exists solely to allow unit tests to inject a
 * mock browser without reaching for Puppeteer's real Chromium binary.
 */

import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { remark } from 'remark'
import remarkHtml from 'remark-html'

// ─── Types ─────────────────────────────────────────────────────────────────────

/** Minimal interface that mirrors the parts of a Puppeteer Browser we use. */
export interface PdfBrowser {
  newPage(): Promise<PdfPage>
  close(): Promise<void>
}

/** Minimal interface that mirrors the parts of a Puppeteer Page we use. */
export interface PdfPage {
  setContent(html: string, options?: { waitUntil?: string }): Promise<void>
  pdf(options?: { format?: string; printBackground?: boolean }): Promise<Uint8Array>
}

/** Factory type for launching a browser instance. */
export type BrowserLauncher = () => Promise<PdfBrowser>

// ─── Default launcher (real Puppeteer) ────────────────────────────────────────

/**
 * Launches a real headless Chromium via Puppeteer.
 * Exported so tests can replace it with a mock.
 */
export let _launchBrowser: BrowserLauncher = async (): Promise<PdfBrowser> => {
  const puppeteer = await import('puppeteer')
  return puppeteer.default.launch({ headless: true }) as Promise<PdfBrowser>
}

/**
 * Override the browser launcher (for testing).
 * Call this in your test `beforeEach` / `vi.mock` setup.
 */
export function _setBrowserLauncher(launcher: BrowserLauncher): void {
  _launchBrowser = launcher
}

// ─── Template loader ──────────────────────────────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const TEMPLATE_PATH = path.join(__dirname, 'pdf', 'template.html')

let _cachedTemplate: string | null = null

async function loadTemplate(): Promise<string> {
  if (_cachedTemplate === null) {
    _cachedTemplate = await readFile(TEMPLATE_PATH, 'utf-8')
  }
  return _cachedTemplate
}

// ─── Markdown → HTML ──────────────────────────────────────────────────────────

async function markdownToHtml(markdown: string): Promise<string> {
  const processor = remark().use(remarkHtml, { sanitize: false })
  const file = await processor.process(markdown)
  return String(file)
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Input options for renderPdf. */
export interface RenderPdfInput {
  /** Markdown source of the meeting protocol. */
  markdown: string
  /** Document metadata. */
  meta?: {
    /** Document title shown in the PDF header. */
    title?: string
    /** Protocol version (e.g. "1.0"). */
    version?: string
  }
}

/**
 * Renders a meeting-protocol Markdown document to a PDF Buffer.
 *
 * @param input - Markdown source and optional metadata.
 * @param launcher - Optional browser launcher override (for testing).
 * @returns A Buffer whose content begins with the PDF magic bytes `%PDF-`.
 */
export async function renderPdf(
  input: RenderPdfInput,
  launcher?: BrowserLauncher,
): Promise<Buffer> {
  const { markdown, meta } = input
  const title = meta?.title ?? 'Meeting Protocol'
  const version = meta?.version ?? '1.0'
  const date = new Date().toISOString().slice(0, 10)

  // 1. Markdown → HTML fragment
  const bodyHtml = await markdownToHtml(markdown)

  // 2. Inject into page template
  const template = await loadTemplate()
  const fullHtml = template
    .replace('{{TITLE}}', escapeHtml(title))
    .replace('{{TITLE}}', escapeHtml(title)) // second occurrence in <title> vs header
    .replace('{{VERSION}}', escapeHtml(version))
    .replace('{{DATE}}', escapeHtml(date))
    .replace('{{BODY}}', bodyHtml)

  // 3. Puppeteer: render HTML → PDF
  const launch = launcher ?? _launchBrowser
  const browser = await launch()

  try {
    const page = await browser.newPage()
    await page.setContent(fullHtml, { waitUntil: 'networkidle0' })
    const pdfBytes = await page.pdf({ format: 'A4', printBackground: true })
    return Buffer.from(pdfBytes)
  } finally {
    await browser.close()
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}
