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

  it('keeps a participant named in the transcript, including case forms', () => {
    const r = guardProtocolParticipants(md('- Иван Петров\n- Олег'), TRANSCRIPT, {})
    expect(r.removed).toEqual([])
    expect(r.markdown).toContain('- Иван Петров')
  })

  it('keeps a participant known only from speaker_map', () => {
    const r = guardProtocolParticipants(md('- Дарья Смирнова'), '[00:00] Speaker 1: привет', { SPEAKER_0: 'Дарья' })
    expect(r.removed).toEqual([])
  })

  it('never touches "Speaker N" lines', () => {
    const r = guardProtocolParticipants(md('- Speaker 1\n- Speaker 3 — предположительно юрист\n- Павел'), TRANSCRIPT, {})
    expect(r.removed).toEqual(['- Павел'])
    expect(r.markdown).toContain('- Speaker 1')
    expect(r.markdown).toContain('- Speaker 3 — предположительно юрист')
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
