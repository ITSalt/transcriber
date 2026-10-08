/**
 * UC-300 / FR-004 / FR-006 — the frozen meeting context and the project memory rendered
 * as plain text per LLM context section (RQ-049). Tag wrapping and escaping are done by
 * the shared renderer at request time; this module only decides what each section says.
 */
import type {
  ContextGlossaryTerm,
  ContextParticipant,
  LlmContextSections,
  MeetingContextSnapshot,
  MeetingType,
  ParticipantSide,
} from '@transcrib/shared'

type Lang = 'RU' | 'EN'

const MEETING_TYPE_LABEL: Record<Lang, Record<MeetingType, string>> = {
  RU: {
    NEGOTIATION: 'переговоры',
    STATUS: 'статус-встреча',
    PLANNING: 'планирование',
    INTERVIEW: 'интервью',
    OTHER: 'другое',
  },
  EN: {
    NEGOTIATION: 'negotiation',
    STATUS: 'status meeting',
    PLANNING: 'planning',
    INTERVIEW: 'interview',
    OTHER: 'other',
  },
}

/** OTHER is the default side and carries no information, so it is not printed. */
const SIDE_LABEL: Record<Lang, Partial<Record<ParticipantSide, string>>> = {
  RU: { OURS: 'наша сторона', CLIENT: 'клиент', CONTRACTOR: 'подрядчик' },
  EN: { OURS: 'our side', CLIENT: 'client', CONTRACTOR: 'contractor' },
}

const LABEL = {
  RU: {
    title: 'Название',
    date: 'Дата загрузки записи',
    type: 'Тип встречи',
    goal: 'Цель',
    aka: 'также',
    role: 'роль',
    org: 'организация',
    side: 'сторона',
    variants: 'варианты',
  },
  EN: {
    title: 'Title',
    date: 'Recording uploaded',
    type: 'Meeting type',
    goal: 'Goal',
    aka: 'also',
    role: 'role',
    org: 'organization',
    side: 'side',
    variants: 'variants',
  },
} as const

function participantLine(p: ContextParticipant, lang: Lang): string {
  const l = LABEL[lang]
  const name = p.aliases.length > 0 ? `${p.name} (${l.aka}: ${p.aliases.join(', ')})` : p.name
  const side = SIDE_LABEL[lang][p.side]
  const facts = [
    p.role ? `${l.role}: ${p.role}` : null,
    p.organization ? `${l.org}: ${p.organization}` : null,
    side ? `${l.side}: ${side}` : null,
  ].filter((x): x is string => x !== null)
  return facts.length > 0 ? `- ${name} — ${facts.join('; ')}` : `- ${name}`
}

function glossaryLine(g: ContextGlossaryTerm, lang: Lang): string {
  const term = g.variants.length > 0 ? `${g.term} (${LABEL[lang].variants}: ${g.variants.join(', ')})` : g.term
  return g.definition ? `- ${term} — ${g.definition}` : `- ${term}`
}

function previousProtocolText(snapshot: MeetingContextSnapshot): string | null {
  const prev = snapshot.previous_protocol
  if (prev.source === 'none') return null
  return prev.text ?? null
}

/**
 * Meeting.createdAt is when the recording was uploaded, not when the meeting happened, so
 * it is labelled as such. Shown in Moscow time (the product's users), not UTC, so an
 * upload just after midnight does not land on the previous day.
 */
const UPLOAD_DATE_FORMAT = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Moscow',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/**
 * WP-WORKER-07: the project summary describes other meetings and the model carried its
 * facts into the protocol, so <project_memory> keeps only what the model needs for
 * <carried_tasks>: open tasks and decisions. The provider renders
 * "Сводка проекта:\n…" first, then "Открытые задачи (…" and/or "Последние решения:"; the
 * summary is cut at the first of those headers (null when nothing else is left). The summary
 * stays available in the Memory tab. Done here, not in the provider, so every provider is covered.
 */
const SUMMARY_HEADER = 'Сводка проекта:'
const KEPT_HEADERS = ['Открытые задачи (', 'Последние решения:']

export function stripProjectSummary(memory: string | null): string | null {
  if (memory === null || !memory.startsWith(SUMMARY_HEADER)) return memory
  const cuts = KEPT_HEADERS.map((h) => memory.indexOf(`\n\n${h}`)).filter((i) => i >= 0)
  if (cuts.length === 0) return null
  return memory.slice(Math.min(...cuts) + 2)
}

const nonEmpty = (s: string | null | undefined): s is string => typeof s === 'string' && s.trim() !== ''

export interface ProtocolContextInput {
  snapshot: MeetingContextSnapshot | null
  /** <project_memory> text from ProjectMemoryProvider; null = no memory */
  memory: string | null
  meeting: { title: string; createdAt: Date }
  language: Lang
}

/**
 * Sections for LlmInput.context, or undefined when there is nothing to say — in which
 * case the protocol request must stay byte-for-byte the pre-FR-004 one (RQ-049).
 * <meeting_meta> (title, upload date, type, goal) is only emitted alongside real context: a
 * title and a date alone would change every existing meeting's request.
 */
export function buildProtocolContext(input: ProtocolContextInput): LlmContextSections | undefined {
  const { snapshot, memory, meeting, language } = input
  const l = LABEL[language]
  const promptMemory = stripProjectSummary(memory)

  const participants = snapshot?.participants.map((p) => participantLine(p, language)).join('\n') ?? ''
  const glossary = snapshot?.glossary.map((g) => glossaryLine(g, language)).join('\n') ?? ''
  const sections: LlmContextSections = {
    participants: nonEmpty(participants) ? participants : null,
    agenda: nonEmpty(snapshot?.agenda) ? snapshot!.agenda : null,
    glossary: nonEmpty(glossary) ? glossary : null,
    previous_protocol: snapshot ? previousProtocolText(snapshot) : null,
    notes: nonEmpty(snapshot?.notes) ? snapshot!.notes : null,
    project_memory: nonEmpty(promptMemory) ? promptMemory : null,
  }

  const meetingType = snapshot?.meeting_type ?? null
  const goal = nonEmpty(snapshot?.goal) ? snapshot!.goal : null
  const substantive =
    meetingType !== null || goal !== null || Object.values(sections).some((v) => nonEmpty(v))
  if (!substantive) return undefined

  sections.meeting_meta = [
    `${l.title}: ${meeting.title}`,
    `${l.date}: ${UPLOAD_DATE_FORMAT.format(meeting.createdAt)}`,
    meetingType ? `${l.type}: ${MEETING_TYPE_LABEL[language][meetingType]}` : null,
    goal ? `${l.goal}: ${goal}` : null,
  ]
    .filter((x): x is string => x !== null)
    .join('\n')

  return sections
}
