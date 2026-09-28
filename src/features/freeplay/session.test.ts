import { describe, it, expect } from 'vitest'
import { newSession, dealNext, botAct, heroAct, mainVillain, gradeDecision, handHistoryText, sizingOf, sparse, type DecisionRecord } from './session'
import { analyze, candidateSizes, modelRange, rangeBreakdown, rangeAdvantage } from './analysis'
import { DEFAULT_SETTINGS } from '../../store/settingsSchema'
import { createRng } from '../../engine/rng'
import { strengthTable } from '../../engine/game/handStrength'
import { equityVector } from '../../engine/game/decision'
import { legalActions, toBB } from '../../engine/game/table'
import { comboIndex } from '../../engine/combos'
import type { Card } from '../../engine/cards'
import { fullRange } from '../../engine/range'

const f = { ...DEFAULT_SETTINGS.freeplay, players: 4 }

describe('freeplay session', () => {
  it('plays full hands: bots keep their real hand inside their tracked range, chips are conserved', () => {
    const rng = createRng(11)
    let s = newSession(f, 1, 'test')
    const cache = new Map<string, ReturnType<typeof strengthTable>>()
    const strength = (board: Card[]) => {
      const k = board.join(',')
      if (!cache.has(k)) cache.set(k, strengthTable(board))
      return cache.get(k)!
    }
    for (let hand = 0; hand < 12; hand++) {
      s = dealNext(s, f, rng)
      let guard = 0
      while (!s.hand.finished && guard++ < 200) {
        const h = s.hand
        if (h.toAct === 0) {
          const hero = h.seats[0].cards as [Card, Card]
          const vec = equityVector(hero, h.board)
          const st = h.street === 'preflop' ? null : strength(h.board)
          const villain = mainVillain(h)
          const sizes = candidateSizes(h, f.betPresets, f.raisePresets, f.openSizeBB, f.threeBetMultiple)
          const act = analyze(h, vec, villain, s.actualRanges[villain], s.profiles[villain], sizingOf(f), st, sizes)
          const est = analyze(h, vec, villain, s.estimates[villain], f.profiles[5], sizingOf(f), st, sizes)
          const legal = legalActions(h)
          const r = rng.next()
          const a = legal.canRaise && r < 0.3 && sizes.length ? { kind: 'raise' as const, to: sizes[0].to } : legal.canCheck ? { kind: 'check' as const } : r < 0.7 ? { kind: 'call' as const } : { kind: 'fold' as const }
          const g = gradeDecision(act.options, a.kind === 'raise' ? a : { kind: a.kind }, h.street, false, 1)
          expect(g.lossBB).toBeGreaterThanOrEqual(0)
          const rec: DecisionRecord = {
            street: h.street, board: h.board, potBB: 0, toCallBB: 0, villainSeat: villain, chosen: { kind: a.kind }, chosenLabel: a.kind,
            actual: act.options, estimate: est.options, equityActual: act.equity, equityEstimate: est.equity, evLossBB: g.lossBB,
            flagged: g.flagged, tags: g.tags, explanation: '', estimateRange: sparse(s.estimates[villain]), actualRange: sparse(s.actualRanges[villain]),
          }
          s = heroAct(s, a, rec)
        } else {
          const seat = s.hand.toAct!
          s = botAct(s, f, rng, s.hand.street === 'preflop' ? null : strength(s.hand.board))
          // The bot's actual hand must still be possible in its model range.
          const c = s.hand.seats[seat].cards
          if (!s.hand.seats[seat].folded) expect(s.actualRanges[seat][comboIndex(c[0], c[1])]).toBeGreaterThan(0)
        }
      }
      expect(s.hand.finished).toBe(true)
      expect(s.hand.net.reduce((a, b) => a + b, 0)).toBe(0)
      expect(handHistoryText(s)).toContain('RESULT')
    }
    expect(s.stats.hands).toBe(12)
  }, 60_000)

  it('replays a seat with a model and breaks ranges down on the board', () => {
    const rng = createRng(5)
    let s = dealNext(newSession(f, 2, 't2'), f, rng)
    while (!s.hand.finished && s.hand.street === 'preflop') {
      s = s.hand.toAct === 0 ? heroAct(s, legalActions(s.hand).canCheck ? { kind: 'check' } : { kind: 'call' }, null) : botAct(s, f, rng, null)
    }
    const r = modelRange(s, 1, f.profiles[5], sizingOf(f), (b) => strengthTable(b))
    expect(r).not.toBeNull()
    if (s.hand.board.length >= 3) {
      const rows = rangeBreakdown(fullRange(), s.hand.board, [])
      expect(rows.reduce((a, x) => a + x.share, 0)).toBeCloseTo(1, 9)
      const adv = rangeAdvantage(fullRange(), fullRange(), s.hand.board)!
      expect(adv.heroWins).toBeCloseTo(0.5, 6) // identical ranges
    }
    expect(toBB(s.hand.config.bigBlind)).toBe(1)
  })
})
