/**
 * FR-005 / D-12 — extraction of Word review data from a .docx (a zip of XML parts).
 *
 *   word/comments.xml   w:comment {id, author, date} → comment text
 *   word/document.xml   w:commentRangeStart/End → the text each comment is anchored to,
 *                       w:ins (w:t) / w:del (w:delText) → tracked changes
 *
 * mammoth ignores comments and tracked changes, so the XML is walked directly.
 * accepted_text = insertions kept, deletions dropped; original_text = the opposite.
 * Never throws: a broken file yields `{ error }` (the file itself is stored by the caller).
 */
import JSZip from 'jszip'
import { XMLParser, XMLValidator } from 'fast-xml-parser'
import type { DocxComment, DocxRevision, FeedbackExtract } from '@transcrib/shared'

/** Guard against zip bombs: a 20 MB upload may not inflate past this per XML part. */
const MAX_PART_BYTES = 64 * 1024 * 1024

type XmlNode = Record<string, unknown>
type Mode = 'both' | 'ins' | 'del'

const parser = new XMLParser({
  preserveOrder: true,
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  trimValues: false,
  parseTagValue: false,
  parseAttributeValue: false,
})

/** fast-xml-parser is lenient about broken markup; validate first so a damaged part is an error. */
function parseXml(xml: string): XmlNode[] {
  const valid = XMLValidator.validate(xml)
  if (valid !== true) throw new Error(`invalid XML: ${valid.err.msg}`)
  return parser.parse(xml) as XmlNode[]
}

const attrsOf =(node: XmlNode): Record<string, string> => (node[':@'] as Record<string, string> | undefined) ?? {}
const tagOf = (node: XmlNode): string | undefined => Object.keys(node).find((k) => k !== ':@')
const childrenOf = (node: XmlNode, tag: string): XmlNode[] => {
  const c = node[tag]
  return Array.isArray(c) ? (c as XmlNode[]) : []
}
const textOf = (nodes: XmlNode[]): string =>
  nodes.map((n) => (typeof n['#text'] === 'string' ? (n['#text'] as string) : '')).join('')

async function readPart(zip: JSZip, path: string): Promise<string | null> {
  const file = zip.file(path)
  if (!file) return null
  const declared = (file as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize
  if (typeof declared === 'number' && declared > MAX_PART_BYTES) throw new Error(`${path} is too large`)
  const text = await file.async('string')
  if (text.length > MAX_PART_BYTES) throw new Error(`${path} is too large`)
  return text
}

/** Concatenated w:t / w:delText text of a subtree, paragraphs separated by "\n". */
function plainText(nodes: XmlNode[]): string {
  let out = ''
  const walk = (list: XmlNode[]): void => {
    for (const node of list) {
      const tag = tagOf(node)
      if (tag === undefined || tag === '#text') continue
      if (tag === 'w:t' || tag === 'w:delText') out += textOf(childrenOf(node, tag))
      else if (tag === 'w:tab') out += '\t'
      else if (tag === 'w:br' || tag === 'w:cr') out += '\n'
      else {
        walk(childrenOf(node, tag))
        if (tag === 'w:p') out += '\n'
      }
    }
  }
  walk(nodes)
  return out.replace(/\n+$/, '')
}

function parseComments(xml: string): Array<Omit<DocxComment, 'anchored_text'>> {
  const root = parseXml(xml).find((n) => tagOf(n) === 'w:comments')
  if (!root) return []
  const out: Array<Omit<DocxComment, 'anchored_text'>> = []
  for (const node of childrenOf(root, 'w:comments')) {
    if (tagOf(node) !== 'w:comment') continue
    const a = attrsOf(node)
    const id = a['@_w:id']
    if (id === undefined) continue
    out.push({
      id,
      author: a['@_w:author'] ?? null,
      date: a['@_w:date'] ?? null,
      text: plainText(childrenOf(node, 'w:comment')),
    })
  }
  return out
}

interface DocumentWalk {
  anchors: Map<string, string>
  revisions: DocxRevision[]
  accepted: string
  original: string
}

function walkDocument(xml: string): DocumentWalk {
  const anchors = new Map<string, string>()
  const open = new Set<string>()
  const revisions: DocxRevision[] = []
  let accepted = ''
  let original = ''

  const emit = (text: string, mode: Mode): void => {
    if (mode !== 'del') accepted += text
    if (mode !== 'ins') original += text
    // anchored text is what the reader sees: normal + inserted text
    if (mode !== 'del') for (const id of open) anchors.set(id, (anchors.get(id) ?? '') + text)
  }

  const walk = (list: XmlNode[], mode: Mode): void => {
    for (const node of list) {
      const tag = tagOf(node)
      if (tag === undefined || tag === '#text') continue
      const a = attrsOf(node)
      switch (tag) {
        case 'w:commentRangeStart': {
          const id = a['@_w:id']
          if (id !== undefined) {
            open.add(id)
            if (!anchors.has(id)) anchors.set(id, '')
          }
          break
        }
        case 'w:commentRangeEnd': {
          const id = a['@_w:id']
          if (id !== undefined) open.delete(id)
          break
        }
        case 'w:ins':
        case 'w:del': {
          const type = tag === 'w:ins' ? 'ins' : 'del'
          const children = childrenOf(node, tag)
          const text = plainText(children).replace(/\n/g, '')
          // paragraph-mark revisions (inside w:rPr) carry no text — not a visible change
          if (text.length > 0) {
            revisions.push({ type, author: a['@_w:author'] ?? null, date: a['@_w:date'] ?? null, text })
          }
          walk(children, type)
          break
        }
        case 'w:t':
          emit(textOf(childrenOf(node, tag)), mode)
          break
        case 'w:delText':
          emit(textOf(childrenOf(node, tag)), 'del')
          break
        case 'w:tab':
          emit('\t', mode)
          break
        case 'w:br':
        case 'w:cr':
          emit('\n', mode)
          break
        case 'w:rPr':
        case 'w:pPr':
          break // formatting and paragraph-mark revisions only, no content
        default:
          walk(childrenOf(node, tag), mode)
          if (tag === 'w:p') emit('\n', 'both')
      }
    }
  }

  const doc = parseXml(xml).find((n) => tagOf(n) === 'w:document')
  if (!doc) throw new Error('word/document.xml has no w:document')
  walk(childrenOf(doc, 'w:document'), 'both')
  const tidy = (s: string): string => s.replace(/\n+$/, '')
  return { anchors, revisions, accepted: tidy(accepted), original: tidy(original) }
}

export function extractFailed(err: unknown): FeedbackExtract {
  const message = err instanceof Error ? err.message : String(err)
  return { comments: [], revisions: [], accepted_text: null, original_text: null, plain_text: null, error: message.slice(0, 500) }
}

/** DOCX_REVIEW: comments with anchored text, tracked changes, accepted and original text. */
export async function extractDocxReview(buffer: Uint8Array): Promise<FeedbackExtract> {
  try {
    const zip = await JSZip.loadAsync(buffer)
    const documentXml = await readPart(zip, 'word/document.xml')
    if (documentXml === null) throw new Error('not a Word document: word/document.xml is missing')
    const commentsXml = await readPart(zip, 'word/comments.xml')
    const walked = walkDocument(documentXml)
    const comments: DocxComment[] = (commentsXml === null ? [] : parseComments(commentsXml)).map((c) => ({
      ...c,
      anchored_text: (walked.anchors.get(c.id) ?? '').trim(),
    }))
    return {
      comments,
      revisions: walked.revisions,
      accepted_text: walked.accepted,
      original_text: walked.original,
      plain_text: null,
      error: null,
    }
  } catch (err) {
    return extractFailed(err)
  }
}

/** CORRECTED_PROTOCOL as .docx: the flat text with all tracked changes accepted. */
export async function extractDocxPlainText(buffer: Uint8Array): Promise<FeedbackExtract> {
  const review = await extractDocxReview(buffer)
  if (review.error) return review
  return { comments: [], revisions: [], accepted_text: null, original_text: null, plain_text: review.accepted_text, error: null }
}
