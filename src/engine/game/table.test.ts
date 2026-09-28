import { describe, it, expect } from 'vitest'
import { startHand, applyAction, legalActions, positionLabels, potTotal, BB, type HandState, type GameConfig, type SeatConfig } from './table'
import { createRng } from '../rng'
import { parseCards } from '../cards'

const cfg: GameConfig = { smallBlind: 500, bigBlind: 1000, ante: 0, straddle: false }
const seats = (n: number, stack = 100 * BB): SeatConfig[] => Array.from({ length: n }, (_, i) => ({ name: `P${i}`, isHero: i === 0, stack }))

/** Replace dealt cards (and put the given board on top of the deck) for deterministic showdowns. */
function rig(s: HandState, holes: string[], board: string): HandState {
  const holeCards = holes.map((h) => parseCards(h))
  const boardCards = parseCards(board)
  const used = new Set([...holeCards.flat(), ...boardCards])
  const rest = s.deck.concat(s.seats.flatMap((x) => x.cards)).filter((c) => !used.has(c))
  s.seats.forEach((x, i) => { x.cards = holeCards[i] })
  // deck pops from the end: burn, flop x3, burn, turn, burn, river
  const order = [rest[0], boardCards[0], boardCards[1], boardCards[2], rest[1], boardCards[3], rest[2], boardCards[4]]
  s.deck = [...rest.slice(3), ...order.reverse()]
  return s
}

describe('table: setup', () => {
  it('labels positions', () => {
    expect(positionLabels(6)).toEqual(['BTN', 'SB', 'BB', 'UTG', 'HJ', 'CO'])
    expect(positionLabels(2)).toEqual(['BTN', 'BB'])
    expect(positionLabels(9)).toEqual(['BTN', 'SB', 'BB', 'UTG', 'UTG+1', 'UTG+2', 'LJ', 'HJ', 'CO'])
  })

  it('posts blinds and starts with UTG (6-max)', () => {
    const s = startHand(cfg, seats(6), 0, createRng(1))
    expect(s.seats[1].bet).toBe(500)
    expect(s.seats[2].bet).toBe(1000)
    expect(s.toAct).toBe(3)
    expect(s.seats.every((x) => x.cards.length === 2)).toBe(true)
    expect(potTotal(s)).toBe(1500)
  })

  it('heads-up: button posts the small blind, acts first preflop and last postflop', () => {
    let s = startHand(cfg, seats(2), 0, createRng(2))
    expect(s.seats[0].bet).toBe(500)
    expect(s.toAct).toBe(0)
    s = applyAction(s, { kind: 'call' })
    expect(s.toAct).toBe(1) // BB option
    s = applyAction(s, { kind: 'check' })
    expect(s.street).toBe('flop')
    expect(s.toAct).toBe(1) // BB first postflop
  })

  it('antes are dead money and straddle acts last preflop', () => {
    const s = startHand({ ...cfg, ante: 125, straddle: true }, seats(6), 0, createRng(3))
    expect(potTotal(s)).toBe(6 * 125 + 500 + 1000 + 2000)
    expect(s.seats[3].bet).toBe(2000)
    expect(s.toAct).toBe(4)
    expect(s.currentBet).toBe(2000)
  })
})

describe('table: betting rules', () => {
  it('enforces the minimum raise', () => {
    let s = startHand(cfg, seats(3), 0, createRng(4)) // BTN acts first 3-handed
    expect(s.toAct).toBe(0)
    expect(legalActions(s).minRaiseTo).toBe(2000)
    s = applyAction(s, { kind: 'raise', to: 3000 }) // raise size 2000
    expect(legalActions(s).minRaiseTo).toBe(5000)
    s = applyAction(s, { kind: 'raise', to: 1000 }) // below min: bumped to min
    expect(s.seats[1].bet).toBe(5000)
  })

  it('an incomplete all-in raise does not reopen the action', () => {
    const cfgSeats = [{ name: 'A', isHero: true, stack: 100 * BB }, { name: 'B', isHero: false, stack: 14 * BB }, { name: 'C', isHero: false, stack: 100 * BB }]
    let s = startHand(cfg, cfgSeats, 2, createRng(5)) // button = C(2): SB = A(0), BB = B(1), C first
    s = applyAction(s, { kind: 'call' })         // C limps 1 bb
    s = applyAction(s, { kind: 'raise', to: 10 * BB }) // A (SB) raises to 10 bb
    s = applyAction(s, { kind: 'raise', to: 14 * BB }) // B all-in 14 bb: raise of 4 bb < 9 bb, incomplete
    expect(s.toAct).toBe(2) // C has not faced the raise to 10 yet, may still raise
    expect(legalActions(s).canRaise).toBe(true)
    s = applyAction(s, { kind: 'call' })
    expect(s.toAct).toBe(0)
    expect(legalActions(s).canRaise).toBe(false) // A already acted; only call or fold
    expect(legalActions(s).callAmount).toBe(4 * BB)
  })

  it('ends the hand when everyone folds, returning the uncalled bet', () => {
    let s = startHand(cfg, seats(3), 0, createRng(6))
    s = applyAction(s, { kind: 'raise', to: 3000 })
    s = applyAction(s, { kind: 'fold' })
    s = applyAction(s, { kind: 'fold' })
    expect(s.finished).toBe(true)
    expect(s.net).toEqual([1500, -500, -1000])
    expect(s.showdown).toBe(false)
  })
})

describe('table: showdown and side pots', () => {
  it('splits side pots correctly with three all-ins', () => {
    const cfgSeats = [100, 300, 500].map((b, i) => ({ name: `P${i}`, isHero: i === 0, stack: b * BB / 100 * 10 }))
    // stacks: 10 bb, 30 bb, 50 bb
    let s = startHand(cfg, cfgSeats, 2, createRng(7)) // button P2; SB P0, BB P1; P2 first
    s = rig(s, ['AsAh', 'KsKh', 'QsQh'], '2c 7d 9c Jd 3s')
    s = applyAction(s, { kind: 'raise', to: 50 * BB }) // P2 all-in 50
    s = applyAction(s, { kind: 'call' }) // P0 all-in 10
    s = applyAction(s, { kind: 'call' }) // P1 all-in 30
    expect(s.finished).toBe(true)
    // main pot 30 bb to AA, side pot 40 bb to KK, 20 bb uncalled back to QQ
    expect(s.pots.map((p) => p.amount)).toEqual([30 * BB, 40 * BB])
    expect(s.pots[0].winners).toEqual([0])
    expect(s.pots[1].winners).toEqual([1])
    expect(s.net).toEqual([20 * BB, 10 * BB, -30 * BB])
  })

  it('splits a tied pot', () => {
    let s = startHand(cfg, seats(2), 0, createRng(8))
    s = rig(s, ['AsKd', 'AhKc'], '2c 7d 9c Jd 3s')
    s = applyAction(s, { kind: 'raise', to: 100 * BB })
    s = applyAction(s, { kind: 'call' })
    expect(s.net).toEqual([0, 0])
  })

  it('conserves chips over many random hands with random legal actions', () => {
    const rng = createRng(9)
    for (let h = 0; h < 400; h++) {
      const n = 2 + rng.int(8)
      const cfgSeats = Array.from({ length: n }, (_, i) => ({ name: `P${i}`, isHero: i === 0, stack: (5 + rng.int(200)) * 100 }))
      const total = cfgSeats.reduce((a, x) => a + x.stack, 0)
      let s = startHand({ smallBlind: 50, bigBlind: 100, ante: rng.next() < 0.3 ? 10 : 0, straddle: rng.next() < 0.2 }, cfgSeats, rng.int(n), rng)
      let guard = 0
      while (!s.finished && guard++ < 500) {
        const l = legalActions(s)
        const r = rng.next()
        if (l.canRaise && r < 0.25) s = applyAction(s, { kind: 'raise', to: l.minRaiseTo + rng.int(Math.max(1, l.maxRaiseTo - l.minRaiseTo + 1)) })
        else if (l.canCheck) s = applyAction(s, { kind: 'check' })
        else if (r < 0.6) s = applyAction(s, { kind: 'call' })
        else s = applyAction(s, { kind: 'fold' })
      }
      expect(s.finished).toBe(true)
      expect(s.seats.reduce((a, x) => a + x.stack, 0)).toBe(total)
      expect(s.net.reduce((a, b) => a + b, 0)).toBe(0)
      if (s.showdown) expect(s.board).toHaveLength(5)
    }
  })
})
