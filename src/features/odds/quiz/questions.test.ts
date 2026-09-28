import { describe, it, expect } from 'vitest'
import { generateParams, buildQuestion, grade, parseAnswer, formatAnswer, type Difficulty } from './questions'
import { updateSrs, dueItems } from './srs'
import { QUIZ_TOPICS } from '../../../store/settingsSchema'
import { createRng } from '../../../engine/rng'
import { parseCards } from '../../../engine/cards'
import { exactEquity, handPlayer } from '../../../engine/equity'
import type { Card } from '../../../engine/cards'

describe('quiz generation', () => {
  it('generates valid, deterministic questions for every topic and difficulty', () => {
    const rng = createRng(2024)
    for (const t of QUIZ_TOPICS) {
      for (const d of ['easy', 'medium', 'hard'] as Difficulty[]) {
        for (let k = 0; k < 4; k++) {
          const params = generateParams(t.id, d, rng)
          const q = buildQuestion(t.id, JSON.parse(JSON.stringify(params)))
          const again = buildQuestion(t.id, params)
          expect(q.key).toBe(again.key)
          expect(q.answer).toEqual(again.answer)
          expect(q.prompt.length).toBeGreaterThan(10)
          if (q.answer.kind === 'numeric') expect(Number.isFinite(q.answer.value)).toBe(true)
        }
      }
    }
  })

  it('computes answers with the engine', () => {
    const q = buildQuestion('required-equity', { pot: 10, bet: 5, callers: 0, variant: 'mdf' })
    expect(q.answer).toEqual({ kind: 'numeric', value: 0.25, unit: 'percent' })
    const po = buildQuestion('pot-odds', { pot: 10, bet: 5, callers: 1, variant: 'mdf' })
    expect(po.answer.kind === 'numeric' && po.answer.value).toBe(4) // (10 + 5 + 5) : 5
    const c = buildQuestion('blockers', { target: 'AA', dead: 'As Kd' })
    expect(c.answer.kind === 'numeric' && c.answer.value).toBe(3)
    const o = buildQuestion('outs', { hero: 'Ah Kh', villain: '7s 7d', board: '7h 8h 2c' })
    expect(o.answer.kind === 'numeric' && o.answer.value).toBe(8)
    const e = buildQuestion('equity-estimate', { hero: 'Ah Kh', villain: '7s 7d', board: '7h 8h 2c 9s' })
    expect(e.answer.kind === 'numeric' && e.answer.value).toBeCloseTo(7 / 44, 12)
    const cf = buildQuestion('call-or-fold', { hero: 'Ah Kh', villain: '7s 7d', board: '7h 8h 2c 9s', pot: 10, bet: 10 })
    // equity 15.9 % < required 33.3 % → fold
    expect(cf.answer.kind === 'choice' && cf.answer.correct).toBe(0)
    const eq = exactEquity({ players: [handPlayer(parseCards('AhKh') as [Card, Card]), handPlayer(parseCards('7s7d') as [Card, Card])], board: parseCards('7h8h2c9s') })
    expect(eq.players[0].equity).toBeCloseTo(7 / 44, 12)
  })
})

describe('grading', () => {
  const g = { percentTolerance: 2, relativeTolerance: 5 }
  it('parses answers', () => {
    expect(parseAnswer('33%', 'percent')).toBeCloseTo(0.33, 12)
    expect(parseAnswer('3:1', 'ratio')).toBe(3)
    expect(parseAnswer('2,5', 'ratio')).toBe(2.5)
    expect(parseAnswer('x', 'count')).toBeNull()
  })
  it('applies tolerances', () => {
    const q = buildQuestion('required-equity', { pot: 10, bet: 5, callers: 0, variant: 'mdf' })
    expect(grade(q, 0.265, g)).toBe(true)
    expect(grade(q, 0.28, g)).toBe(false)
    const r = buildQuestion('pot-odds', { pot: 10, bet: 5, callers: 0, variant: 'mdf' })
    expect(grade(r, 3.1, g)).toBe(true)
    expect(grade(r, 3.3, g)).toBe(false)
    const c = buildQuestion('blockers', { target: 'AA', dead: 'As Kd' })
    expect(grade(c, 3, g)).toBe(true)
    expect(grade(c, 3.2, g)).toBe(false)
    expect(formatAnswer(q.answer)).toBe('25%')
  })
})

describe('spaced repetition', () => {
  const q = { key: 'k', topic: 'mdf' as const, params: {} }
  it('schedules missed questions and grows intervals', () => {
    expect(updateSrs(undefined, q, true, 0)).toBeUndefined()
    const a = updateSrs(undefined, q, false, 0)!
    expect(a.lapses).toBe(1)
    expect(a.due).toBe(10 * 60 * 1000)
    const b = updateSrs(a, q, true, a.due)!
    expect(b.intervalDays).toBe(1)
    const c = updateSrs(b, q, true, b.due)!
    expect(c.intervalDays).toBe(Math.round(1 * b.ease))
    expect(dueItems([a, b, c], a.due, ['mdf'])).toEqual([a])
    expect(dueItems([a], a.due, ['outs'])).toEqual([])
  })
})
