/**
 * Lesson content checks. Every lesson must:
 *   - parse, have a unique id and valid widgets,
 *   - contain no hand-typed percentages or "x : 1" odds in prose (they must be {{expressions}}),
 *   - have every {{expression}} evaluate with the engine,
 *   - have computable quiz answers and valid hands / ranges.
 */
import { describe, it, expect } from 'vitest'
import { LESSONS } from './loader'
import { expressionsIn, findUncomputedNumbers } from './format'
import { evaluateExpr, parseExpr } from './expressions'
import { calculateEquity } from '../../engine/equity'
import { parseCards, assertDistinct } from '../../engine/cards'
import { parseRange } from '../../engine/range'
import { BASELINE_CHARTS, COMPUTED_CHARTS } from '../../data/ranges/library'
import { QUIZ_TOPICS } from '../../store/settingsSchema'

const run = (req: Parameters<typeof calculateEquity>[0]) => Promise.resolve(calculateEquity({ ...req, maxExactEvaluations: 5_000_000, iterations: 100_000 }))

describe('lessons', () => {
  it('has a full curriculum with unique ids', () => {
    const ids = LESSONS.map((l) => l.meta.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(LESSONS.length).toBeGreaterThanOrEqual(14)
    for (const l of LESSONS) expect(l.meta.summary.length, l.meta.id).toBeGreaterThan(10)
  })

  for (const lesson of LESSONS) {
    describe(lesson.meta.id, () => {
      const texts: string[] = []
      for (const s of lesson.segments) {
        if (s.kind === 'markdown') texts.push(s.text)
        else texts.push(...Object.entries(s.config).filter(([k]) => !['answer', 'players', 'board', 'range', 'call'].includes(k)).map(([, v]) => v))
      }

      it('has no hand-typed percentages or odds', () => {
        expect(texts.flatMap(findUncomputedNumbers)).toEqual([])
      })

      it('evaluates every expression', async () => {
        const exprs = [...texts.flatMap(expressionsIn), ...lesson.segments.flatMap((s) => (s.kind === 'widget' && s.config.answer ? expressionsIn(s.config.answer) : []))]
        for (const e of exprs) {
          await expect(evaluateExpr(parseExpr(e), run), e).resolves.toBeDefined()
        }
      }, 120_000)

      it('has valid widgets', () => {
        for (const s of lesson.segments) {
          if (s.kind !== 'widget') continue
          const c = s.config
          if (s.type === 'quiz') {
            if (c.topic) expect(QUIZ_TOPICS.map((t) => t.id)).toContain(c.topic)
            else if (c.options) {
              const n = c.options.split('|').length
              expect(Number(c.correct)).toBeGreaterThanOrEqual(1)
              expect(Number(c.correct)).toBeLessThanOrEqual(n)
              expect(c.question?.length).toBeGreaterThan(5)
            } else {
              expect(c.question?.length).toBeGreaterThan(5)
              expect(c.answer, 'quiz needs answer').toBeTruthy()
              expect(['percent', 'count', 'ratio', 'number']).toContain(c.unit ?? 'number')
              if (!/^\{\{.+\}\}$/.test(c.answer)) expect(Number.isFinite(Number(c.answer))).toBe(true)
            }
          }
          if (s.type === 'hand') {
            const cards = c.players.split('|').flatMap((p) => parseCards(p.split('=')[1]))
            const board = parseCards(c.board ?? '')
            expect(() => assertDistinct([...cards, ...board])).not.toThrow()
            expect([0, 3, 4, 5]).toContain(board.length)
          }
          if (s.type === 'range-grid') {
            if (c.range.startsWith('chart:')) expect([...BASELINE_CHARTS, ...COMPUTED_CHARTS].map((x) => x.id)).toContain(c.range.slice(6))
            else expect(() => parseRange(c.range)).not.toThrow()
          }
          if (s.type === 'equity-calc') {
            for (const p of c.players.split('|')) expect(() => (/^([2-9TJQKA][cdhs]){2}$/i.test(p.trim()) ? parseCards(p) : parseRange(p))).not.toThrow()
          }
        }
      })
    })
  }
})

describe('number lint', () => {
  it('flags hand-typed numbers but not expressions', () => {
    expect(findUncomputedNumbers('You need 33% equity')).toEqual(['33%'])
    expect(findUncomputedNumbers('odds of 3 to 1')).toEqual(['3 to 1'])
    expect(findUncomputedNumbers('You need {{formula requiredEquity pot=10 call=5}} equity')).toEqual([])
    expect(findUncomputedNumbers('a 100 bb stack')).toEqual([])
  })
})
