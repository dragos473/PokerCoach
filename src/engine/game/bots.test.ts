import { describe, it, expect } from 'vitest'
import { botPolicy, topOfRange, narrowRange, chooseAction } from './bots'
import { startHand, applyAction, BB } from './table'
import { strengthTable } from './handStrength'
import { createRng } from '../rng'
import { fullRange, rangePercent, parseRange } from '../range'
import { handClassByLabel, NUM_COMBOS } from '../combos'
import { DEFAULT_BOT_PROFILES } from '../../store/settingsSchema'

const sizing = { openSizeBB: 2.5, threeBetMultiple: 3.5, betPresets: [33, 50, 75, 100], raisePresets: [3] }
const tag = DEFAULT_BOT_PROFILES.find((p) => p.id === 'tag')!
const cfg = { smallBlind: 500, bigBlind: 1000, ante: 0, straddle: false }
const seats = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `P${i}`, isHero: i === 0, stack: 100 * BB }))

describe('topOfRange', () => {
  it('takes exactly the requested share, splitting ties', () => {
    const r = fullRange()
    const m = topOfRange(r, (c) => c, 0.25)
    expect(m.reduce((a, b) => a + b, 0)).toBeCloseTo(0.25 * NUM_COMBOS, 9)
    const flat = topOfRange(r, () => 1, 0.1)
    expect(flat[0]).toBeCloseTo(0.1, 12)
  })
})

describe('bot policy', () => {
  it('opens roughly PFR × position factor from the button, with the strongest hands', () => {
    const s = startHand(cfg, seats(6), 3, createRng(1)) // button = seat 3 → UTG = seat 0 acts first
    const btnState = applyAction(applyAction(applyAction(s, { kind: 'fold' }), { kind: 'fold' }), { kind: 'fold' })
    expect(btnState.seats[btnState.toAct!].position).toBe('BTN')
    const pol = botPolicy(btnState, btnState.toAct!, fullRange(), tag, sizing, null)
    expect(pol.freq.raise).toBeCloseTo((tag.pfr / 100) * 1.45, 6)
    expect(pol.raise[handClassByLabel('AA')!.combos[0]]).toBe(1)
    expect(pol.raise[handClassByLabel('72o')!.combos[0]]).toBe(0)
    expect(pol.raiseTo).toBe(2500)
    const sum = pol.fold[5] + pol.call[5] + pol.raise[5]
    expect(sum).toBeCloseTo(1, 12)
  })

  it('narrows its range consistently with the chosen action', () => {
    let s = startHand(cfg, seats(2), 0, createRng(2))
    const pol = botPolicy(s, 0, fullRange(), tag, sizing, null)
    const combo = s.seats[0].cards
    void combo
    const narrowed = narrowRange(fullRange(), pol, 'raise')
    expect(rangePercent(narrowed)).toBeCloseTo(pol.freq.raise, 9)
    s = applyAction(s, { kind: 'raise', to: pol.raiseTo })
    expect(s.toAct).toBe(1)
    expect(chooseAction(pol, handClassByLabel('AA')!.combos[0], 0.99)).toBe('raise')
  })

  it('postflop: bets the top of its range and continues facing bets roughly by MDF', () => {
    let s = startHand(cfg, seats(2), 0, createRng(3))
    s = applyAction(s, { kind: 'raise', to: 2500 })
    s = applyAction(s, { kind: 'call' }) // flop, BB acts first
    const t = strengthTable(s.board)
    const range = parseRange('22+, A2s+, K9s+, ATo+, KTo+')
    const pol = botPolicy(s, s.toAct!, range, tag, sizing, t)
    expect(pol.callLabel).toBe('check')
    expect(pol.freq.fold).toBe(0)
    s = applyAction(s, { kind: 'check' })
    const cb = botPolicy(s, s.toAct!, range, tag, sizing, t)
    expect(cb.freq.raise).toBeCloseTo(tag.cbet / 100, 1)
    s = applyAction(s, { kind: 'raise', to: cb.raiseTo })
    const def = botPolicy(s, s.toAct!, range, tag, sizing, t)
    expect(def.freq.fold).toBeCloseTo(tag.foldToCbet / 100, 1)
    for (let c = 0; c < NUM_COMBOS; c++) if (range[c] > 0) expect(def.fold[c] + def.call[c] + def.raise[c]).toBeCloseTo(1, 9)
  })
})
