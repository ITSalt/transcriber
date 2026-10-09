import { describe, it, expect } from 'vitest'
import { guardProtocolParticipants } from './protocol-guard.js'

const TRANSCRIPT = [
  '[00:00] Мария: Всем привет, начинаем.',
  '[00:05] Speaker 2: Иван сегодня не придёт, Ивана заменит Олег.',
].join('\n')

const md = (participants: string) =>
  `## Участники\n${participants}\n\n## Обсуждение\n- Ильнур упомянут здесь\n\n## Решения\nРешения не зафиксированы.\n\n## Задачи\nЗадачи не зафиксированы.`

describe('guardProtocolParticipants (WP-WORKER-07)', () => {
  it('removes a card participant absent from the transcript', () => {
    const r = guardProtocolParticipants(md('- Мария — юрист\n- Ильнур — разработчик\n- Павел'), TRANSCRIPT, {})
    expect(r.removed).toEqual(['- Ильнур — разработчик', '- Павел'])
    expect(r.markdown).toContain('- Мария — юрист')
    expect(r.markdown).not.toContain('- Павел')
    // only the Участники section is touched
    expect(r.markdown).toContain('- Ильнур упомянут здесь')
  })

  it('keeps a participant named in the transcript only in an oblique case', () => {
    const t = '[00:00] Мария: Передай Ивана Петрова Олегу.'
    const r = guardProtocolParticipants(md('- Иван Петров\n- Олег'), t, {})
    expect(r.removed).toEqual([])
    expect(r.markdown).toContain('- Иван Петров')
  })

  it.each([
    ['Антон', 'Антону'], ['Антон', 'Антона'], ['Тенгиз', 'Тенгизу'], ['Роман', 'Романа'], ['Роман', 'Роману'],
    ['Борис', 'Борису'], ['Максим', 'Максимом'], ['Ильнур', 'Ильнура'], ['Павел', 'Павла'], ['Мария', 'Марии'],
    // reverse direction: the protocol has the oblique form, the transcript the nominative
    ['Антона', 'Антон'], ['Максимом', 'Максим'], ['Ильнура', 'Ильнур'], ['Борису', 'Борис'],
  ])('bullet «%s» matches transcript form «%s»', (bullet, inTranscript) => {
    const r = guardProtocolParticipants(md(`- ${bullet} — упоминается`), `[00:00] Мария: передай ${inTranscript} и всё`, {})
    expect(r.removed).toEqual([])
  })

  it('does not match unrelated names or short words that prefix a long name', () => {
    const t = '[00:00] Мария: Антон и Тенгиз тут, хадж обсудим, иль нет'
    const r = guardProtocolParticipants(md('- Хаджимурад\n- Ильнур\n- Павел'), t, {})
    expect(r.removed).toEqual(['- Хаджимурад', '- Ильнур', '- Павел'])
  })

  it('keeps a participant known only from speaker_map', () => {
    const r = guardProtocolParticipants(md('- Дарья Смирнова'), '[00:00] Speaker 1: привет', { SPEAKER_0: 'Дарья' })
    expect(r.removed).toEqual([])
  })

  it('never touches "Спикер N" lines', () => {
    const r = guardProtocolParticipants(md('- Спикер 1\n- Спикер 3 — юрист\n- Павел'), '[00:00] Мария: привет', {})
    expect(r.markdown).toContain('- Спикер 1')
    expect(r.markdown).toContain('- Спикер 3 — юрист')
  })

  it('never touches "Speaker N" lines', () => {
    // the transcript has no "Speaker" word at all, so only the label rule can keep these lines
    const r = guardProtocolParticipants(md('- Speaker 1\n- Speaker 3 — юрист\n- Павел'), '[00:00] Мария: привет', {})
    expect(r.removed).toEqual(['- Павел'])
    expect(r.markdown).toContain('- Speaker 1')
    expect(r.markdown).toContain('- Speaker 3 — юрист')
  })

  it('keeps a mentioned participant marked "упоминается" when the transcript names them', () => {
    const r = guardProtocolParticipants(md('- Олег (упоминается)'), TRANSCRIPT, {})
    expect(r.removed).toEqual([])
  })

  it('treats ё/е alike and ignores bold markup', () => {
    const r = guardProtocolParticipants(md('- **Фёдор**'), '[00:00] Федор: здравствуйте', {})
    expect(r.removed).toEqual([])
  })

  it('returns the very same string when nothing is removed', () => {
    const input = md('- Мария')
    expect(guardProtocolParticipants(input, TRANSCRIPT, {}).markdown).toBe(input)
  })

  it('works with the English heading', () => {
    const r = guardProtocolParticipants('## Participants\n- Mary\n- Ilnur\n\n## Discussion\n- x', '[00:00] Mary: hi', {})
    expect(r.removed).toEqual(['- Ilnur'])
  })
})
