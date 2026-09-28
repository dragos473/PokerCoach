import { describe, it, expect } from 'vitest'
import {
  FORMULAS, binomial, potOddsRatio, requiredEquity, evCall, evBet, breakEvenFold, breakEvenFoldWithEquity,
  mdf, alpha, bluffFraction, spr, hitNextCard, hitByRiver, ruleOf2, ruleOf4, impliedOddsNeeded,
  evWithImpliedOdds, foldEquityValue,
} from '../formulas'
import { analyzeOuts } from '../outs'
import { parseCards, type Card } from '../cards'
import { comboIndex } from '../combos'
import { liveCombos, parseRange } from '../range'
import { exactEquity, handPlayer } from '../equity'
import { createRng } from '../rng'

describe('formulas: values', () => {
  // Pot 100, villain bets 50 → pot facing us = 150, call = 50.
  it('pot odds and required equity', () => {
    expect(potOddsRatio.compute({ pot: 150, call: 50 })).toBe(3)
    expect(requiredEquity.compute({ pot: 150, call: 50 })).toBe(0.25)
    expect(requiredEquity.compute({ pot: 200, call: 100 })).toBeCloseTo(1 / 3, 12) // pot-sized bet
  })

  it('EV of calling is zero exactly at the required equity', () => {
    expect(evCall.compute({ pot: 150, call: 50, equity: 0.3 })).toBeCloseTo(10, 12)
    expect(evCall.compute({ pot: 150, call: 50, equity: 0.25 })).toBeCloseTo(0, 12)
  })

  it('EV of a bet with fold equity', () => {
    // 50 into 100, pure bluff, villain folds 40%: 0.4·100 − 0.6·50 = 10
    expect(evBet.compute({ pot: 100, risk: 50, villainCall: 50, foldProb: 0.4, equityWhenCalled: 0 })).toBeCloseTo(10, 12)
    expect(foldEquityValue.compute({ pot: 100, foldProb: 0.4 })).toBe(40)
  })

  it('break-even fold % makes EV(bet) zero (pure bluff and semi-bluff)', () => {
    expect(breakEvenFold.compute({ pot: 100, risk: 50 })).toBeCloseTo(1 / 3, 12)
    const rng = createRng(3)
    for (let t = 0; t < 500; t++) {
      const pot = 10 + rng.next() * 200
      const risk = 1 + rng.next() * 300
      const villainCall = risk * (0.3 + rng.next())
      const equityWhenCalled = rng.next() * 0.5
      const f = breakEvenFoldWithEquity.compute({ pot, risk, villainCall, equityWhenCalled })
      const ev = evBet.compute({ pot, risk, villainCall, foldProb: f, equityWhenCalled })
      if (f > 0) expect(ev).toBeCloseTo(0, 8)
      else expect(ev).toBeGreaterThanOrEqual(-1e-9)
      const f0 = breakEvenFoldWithEquity.compute({ pot, risk, villainCall: risk, equityWhenCalled: 0 })
      expect(f0).toBeCloseTo(breakEvenFold.compute({ pot, risk }), 10)
    }
  })

  it('MDF, alpha and bluff share', () => {
    expect(mdf.compute({ pot: 100, bet: 50 })).toBeCloseTo(2 / 3, 12)
    expect(alpha.compute({ pot: 100, bet: 50 })).toBeCloseTo(1 / 3, 12)
    expect(mdf.compute({ pot: 100, bet: 100 }) + alpha.compute({ pot: 100, bet: 100 })).toBe(1)
    expect(bluffFraction.compute({ pot: 100, bet: 100 })).toBeCloseTo(1 / 3, 12)
    // Bluff share equals the caller's required equity when facing the bet
    expect(bluffFraction.compute({ pot: 100, bet: 75 })).toBeCloseTo(requiredEquity.compute({ pot: 175, call: 75 }), 12)
  })

  it('SPR', () => {
    expect(spr.compute({ effectiveStack: 97, pot: 6.5 })).toBeCloseTo(14.923, 3)
  })

  it('drawing probabilities: exact vs rules of 2 and 4', () => {
    expect(hitNextCard.compute({ outs: 9, unseen: 46 })).toBeCloseTo(9 / 46, 12)
    // 1 − C(38,2)/C(47,2) = 1 − 703/1081
    expect(binomial(38, 2)).toBe(703)
    expect(binomial(47, 2)).toBe(1081)
    expect(hitByRiver.compute({ outs: 9, unseen: 47 })).toBeCloseTo(1 - 703 / 1081, 12)
    // equivalently 1 − (38/47)(37/46)
    expect(hitByRiver.compute({ outs: 9, unseen: 47 })).toBeCloseTo(1 - (38 / 47) * (37 / 46), 12)
    expect(ruleOf2.compute({ outs: 9 })).toBe(0.18)
    expect(ruleOf4.compute({ outs: 9 })).toBe(0.36)
    expect(ruleOf2.kind).toBe('heuristic')
  })

  it('implied odds needed makes the call break even', () => {
    const p = 9 / 46
    const W = impliedOddsNeeded.compute({ pot: 150, call: 50, hitProb: p })
    expect(W).toBeCloseTo(50 / p - 200, 10)
    const ev = evWithImpliedOdds.compute({ pot: 150, call: 50, pHitWin: p, pHitLose: 0, impliedWin: W, reverseImpliedLoss: 0 })
    expect(ev).toBeCloseTo(0, 10)
    // With W = 0, pHitLose = 0 it reduces to EV(call) with equity = pHitWin
    expect(evWithImpliedOdds.compute({ pot: 150, call: 50, pHitWin: 0.3, pHitLose: 0, impliedWin: 0, reverseImpliedLoss: 0 }))
      .toBeCloseTo(evCall.compute({ pot: 150, call: 50, equity: 0.3 }), 12)
  })
})

describe('formulas: registry and explanations', () => {
  it('every formula has an expression, variables and a working explain()', () => {
    for (const f of Object.values(FORMULAS)) {
      expect(f.expression.length).toBeGreaterThan(3)
      expect(f.description.length).toBeGreaterThan(10)
      expect(['math', 'model', 'heuristic']).toContain(f.kind)
      if (f.kind === 'model') expect(f.assumptions.length).toBeGreaterThan(0)
    }
    const e = requiredEquity.explain({ pot: 150, call: 50 })
    expect(e.value).toBe(0.25)
    expect(e.steps.join(' ')).toContain('50 / (150 + 50)')
    expect(e.steps.join(' ')).toContain('25%')
  })
})

describe('outs', () => {
  const h = (s: string) => parseCards(s) as [Card, Card]

  it('improvement mode: nut flush draw + two overs has 15 outs on 7h8h2c', () => {
    const r = analyzeOuts({ hero: h('AhKh'), board: parseCards('7h 8h 2c') })
    expect(r.unseen).toBe(47)
    expect(r.cleanOuts + r.dirtyOuts).toBe(15) // 9 hearts + 3 aces + 3 kings
    expect(r.exactNextCard).toBeCloseTo(15 / 47, 12)
    expect(r.exactByRiver).toBeCloseTo(1 - binomial(32, 2) / binomial(47, 2), 12)
    expect(r.ruleOf4).toBeCloseTo(0.6, 12)
    // Heart that pairs the board is flagged (heuristic)
    const twoH = r.cards.find((c) => c.label === '2h')!
    expect(twoH.improves).toBe(true)
    expect(twoH.warnings.some((w) => w.includes('Pairs the board'))).toBe(true)
  })

  it('improvement mode: a card that only pairs the board is not an out', () => {
    const r = analyzeOuts({ hero: h('AhKh'), board: parseCards('7h 8h 2c') })
    expect(r.cards.find((c) => c.label === '7c')!.improves).toBe(false)
  })

  it('vs a set: only the 8 hearts that do not pair the board are outs', () => {
    const villain = [{ combo: comboIndex(...h('7s7d')), weight: 1 }]
    const r = analyzeOuts({ hero: h('AhKh'), board: parseCards('7h 8h 2c'), villain })
    expect(r.behindFraction).toBe(1)
    expect(r.cleanOuts).toBe(8)
    expect(r.dirtyOuts).toBe(0)
    expect(r.cards.find((c) => c.label === '2h')!.status).toBe('none') // gives villain a full house
    // Villain's hand is known, so 45 cards can actually come.
    expect(r.exactNextCard).toBeCloseTo(8 / 45, 12)
    const eq = exactEquity({ players: [handPlayer(h('AhKh')), handPlayer(h('7s7d'))], board: parseCards('7h 8h 2c') })
    expect(r.exactByRiver).toBeCloseTo(eq.players[0].equity, 12)
  })

  it('vs a range: a flush card is clean against an overpair, a brick is not an out', () => {
    const r = analyzeOuts({ hero: h('KsQs'), board: parseCards('7h 8s 2s'), villain: liveCombos(parseRange('77, AhAd'), []) })
    expect(r.mode).toBe('vs-villain')
    expect(r.cards.find((c) => c.label === '2s')).toBeUndefined() // on the board
    expect(r.cards.find((c) => c.label === '6s')!.status).toBe('clean')
    expect(r.cards.find((c) => c.label === '8d')!.status).toBe('none')
  })

  it('vs a range: pairing-the-board flush card is dirty', () => {
    // Board 7h 8s 3s; hero KsQs. Villain: 77 (set) or AhAd (overpair). 3s-less deck: the 7s would
    // make hero a flush and villain 77 quads → loses to sets but beats AA: dirty.
    const r = analyzeOuts({ hero: h('KsQs'), board: parseCards('7h 8s 3s'), villain: liveCombos(parseRange('77, AhAd'), []) })
    const sevenS = r.cards.find((c) => c.label === '7s')!
    expect(sevenS.status).toBe('dirty')
    expect(sevenS.winShare).toBeGreaterThan(0)
    expect(sevenS.winShare).toBeLessThan(1)
    expect(r.effectiveOuts).toBeGreaterThan(r.cleanOuts)
    expect(r.effectiveOuts).toBeLessThan(r.cleanOuts + r.dirtyOuts)
  })
})
