import { describe, it, expect } from 'vitest'
import { equityVector, equityVsRange, evaluateOptions } from './decision'
import { exactEquity, handPlayer, rangePlayer } from '../equity'
import { parseCards, type Card } from '../cards'
import { comboIndex, NUM_COMBOS } from '../combos'
import { parseRange } from '../range'
import type { Policy } from './bots'

const h = (s: string) => parseCards(s) as [Card, Card]

describe('equity vector', () => {
  it('matches exact equity vs single hands and vs ranges (flop, turn, river)', () => {
    for (const board of ['7h8h2c', '7h8h2c9s', '7h8h2c9s3d']) {
      const vec = equityVector(h('AhKh'), parseCards(board))
      const c = comboIndex(...h('7s7d'))
      const ex = exactEquity({ players: [handPlayer(h('AhKh')), handPlayer(h('7s7d'))], board: parseCards(board) })
      expect(vec[c]).toBeCloseTo(ex.players[0].equity, 12)
      const r = parseRange('77, 88, AQ, JTs')
      const exR = exactEquity({ players: [handPlayer(h('AhKh')), rangePlayer(r)], board: parseCards(board) })
      expect(equityVsRange(vec, r).equity).toBeCloseTo(exR.players[0].equity, 12)
    }
  })

  it('marks blocked combos NaN', () => {
    const vec = equityVector(h('AhKh'), parseCards('7h8h2c'))
    expect(Number.isNaN(vec[comboIndex(...h('AhQd'))])).toBe(true)
    expect(Number.isNaN(vec[comboIndex(...h('7h9d'))])).toBe(true)
  })
})

describe('option EVs', () => {
  it('matches the formulas for call and a raise with a given response', () => {
    const vec = new Float64Array(NUM_COMBOS).fill(0.3)
    const range = parseRange('AA')
    const fold = new Float64Array(NUM_COMBOS).fill(0.5)
    const call = new Float64Array(NUM_COMBOS).fill(0.5)
    const policy = { fold, call, raise: new Float64Array(NUM_COMBOS), raiseTo: 0, freq: { fold: 0.5, call: 0.5, raise: 0 }, explanation: [], callLabel: 'call', raiseLabel: 'raise' } as Policy
    const r = evaluateOptions({ vec, range, pot: 15, toCall: 5, heroBet: 0, villainBet: 5, responses: [{ to: 20, policy }], chip: String })
    expect(r.equity).toBeCloseTo(0.3, 12)
    expect(r.options.find((o) => o.kind === 'call')!.ev).toBeCloseTo(0.3 * 20 - 5, 12)
    const raise = r.options.find((o) => o.kind === 'raise')!
    // f = 0.5, risk 20, villain adds 15 to call, eq 0.3: 0.5·15 + 0.5·(0.3·(15 + 20 + 15) − 20)
    expect(raise.ev).toBeCloseTo(0.5 * 15 + 0.5 * (0.3 * 50 - 20), 12)
  })
})
