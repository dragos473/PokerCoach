import { describe, it, expect } from 'vitest'
import {
  calculateEquity, exactEquity, monteCarloEquity, handPlayer, rangePlayer, estimateExactEvaluations,
  type EquityResult,
} from '../equity'
import { parseCards, type Card } from '../cards'
import { parseRange } from '../range'
import { comboIndex } from '../combos'
import { binomial } from '../formulas'

const h = (s: string) => parseCards(s) as [Card, Card]
const hvh = (a: string, b: string, board = '') =>
  exactEquity({ players: [handPlayer(h(a)), handPlayer(h(b))], board: board ? parseCards(board) : [] })
const eq = (r: EquityResult, i = 0) => r.players[i].equity

/** Naive independent evaluator (best of all 5-card subsets, sort-based) for cross-checks. */
function naive5(cards: number[]): number {
  const ranks = cards.map((c) => c >> 2).sort((a, b) => b - a)
  const flush = cards.every((c) => (c & 3) === (cards[0] & 3))
  const counts = new Map<number, number>()
  for (const r of ranks) counts.set(r, (counts.get(r) ?? 0) + 1)
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])
  let sh = -1
  if (counts.size === 5) sh = ranks[0] - ranks[4] === 4 ? ranks[0] : ranks[0] === 12 && ranks[1] === 3 ? 3 : -1
  const pack = (cat: number, ks: number[]) => ks.reduce((a, k, i) => a | (k << (16 - 4 * i)), cat << 20)
  if (sh >= 0 && flush) return pack(8, [sh])
  if (groups[0][1] === 4) return pack(7, [groups[0][0], groups[1][0]])
  if (groups[0][1] === 3 && groups[1][1] === 2) return pack(6, [groups[0][0], groups[1][0]])
  if (flush) return pack(5, ranks)
  if (sh >= 0) return pack(4, [sh])
  if (groups[0][1] === 3) return pack(3, groups.map((g) => g[0]))
  if (groups[0][1] === 2 && groups[1][1] === 2) return pack(2, groups.map((g) => g[0]))
  if (groups[0][1] === 2) return pack(1, groups.map((g) => g[0]))
  return pack(0, ranks)
}
function naiveBest(cards: number[]): number {
  let best = -1
  const n = cards.length
  for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) for (let c = b + 1; c < n; c++)
    for (let d = c + 1; d < n; d++) for (let e = d + 1; e < n; e++)
      best = Math.max(best, naive5([cards[a], cards[b], cards[c], cards[d], cards[e]]))
  return best
}
/** Independent exact equity for known hands on a flop/turn: loops over runouts with the naive evaluator. */
function naiveEquity(hands: number[][], board: number[]): number[] {
  const used = new Set([...hands.flat(), ...board])
  const deck = [...Array(52).keys()].filter((c) => !used.has(c))
  const missing = 5 - board.length
  const share = hands.map(() => 0)
  let total = 0
  const run = (start: number, cur: number[]) => {
    if (cur.length === missing) {
      const full = [...board, ...cur]
      const scores = hands.map((hh) => naiveBest([...hh, ...full]))
      const best = Math.max(...scores)
      const winners = scores.filter((s) => s === best).length
      scores.forEach((s, i) => { if (s === best) share[i] += 1 / winners })
      total++
      return
    }
    for (let k = start; k < deck.length; k++) run(k + 1, [...cur, deck[k]])
  }
  run(0, [])
  return share.map((s) => s / total)
}

describe('equity: reference preflop values (exact enumeration)', () => {
  it('AA vs KK ≈ 81.95 / 18.05 (range average over the 36 suit combinations)', () => {
    // Suit structure of AA vs KK: of the 6 KK combos facing a given AA, 1 shares no suit,
    // 4 share one suit and 1 shares both. Weighted average of the three exact cases = exact range result.
    const none = eq(hvh('AsAh', 'KdKc'))
    const one = eq(hvh('AsAh', 'KsKd'))
    const both = eq(hvh('AsAh', 'KsKh'))
    const avg = (none + 4 * one + both) / 6
    expect(avg).toBeCloseTo(0.81946, 4)
    expect(none).toBeCloseTo(0.81255, 4)
    expect(both).toBeCloseTo(0.82637, 4)
  })

  it('AKs vs QQ ≈ 46.0 / 54.0', () => {
    // QQ contains AKs's suit in 3 of 6 combos.
    const avg = (eq(hvh('AhKh', 'QhQd')) + eq(hvh('AhKh', 'QsQd'))) / 2
    expect(avg).toBeCloseTo(0.46049, 4)
  })

  it('AKo vs 22 is a coin flip slightly favouring the pair (~47 / 53)', () => {
    const r = hvh('AsKd', '2c2h')
    expect(eq(r)).toBeCloseTo(0.4696, 3)
  })

  it('enumerates exactly C(48,5) boards heads-up preflop, and equities sum to 1', () => {
    const r = hvh('AsAh', 'KdKc')
    expect(r.method).toBe('exact')
    expect(r.samples).toBe(binomial(48, 5))
    expect(eq(r, 0) + eq(r, 1)).toBeCloseTo(1, 12)
    for (const p of r.players) expect(p.equity).toBeCloseTo(p.win + p.tie / 2, 12) // heads-up: a tie is a half share
  })

  it('suit-symmetric hands split 50/50', () => {
    expect(eq(hvh('AcKc', 'AdKd'))).toBeCloseTo(0.5, 12)
  })
})

describe('equity: postflop scenarios', () => {
  it('turn: flush draw vs set wins exactly 7/44 (analytic)', () => {
    // Board 7h 8h 2c 9s; AhKh vs 7s7d. 9 hearts left, but 2h and 9h pair the board and give the set a full house.
    const r = hvh('AhKh', '7s7d', '7h8h2c9s')
    expect(r.samples).toBe(44)
    expect(eq(r)).toBeCloseTo(7 / 44, 12)
  })

  it('flop: set vs nut flush draw + overcards matches an independent naive enumeration', () => {
    const r = hvh('7s7d', 'AhKh', '7h8h2c')
    const ref = naiveEquity([parseCards('7s7d'), parseCards('AhKh')], parseCards('7h8h2c'))
    expect(r.samples).toBe(binomial(45, 2))
    expect(eq(r, 0)).toBeCloseTo(ref[0], 12)
    expect(eq(r, 0)).toBeGreaterThan(0.74)
    expect(eq(r, 0)).toBeLessThan(0.77)
  })

  it('flop: several random matchups match the naive enumeration exactly', () => {
    const cases: [string, string, string][] = [
      ['AsKs', 'QdQc', 'Js Ts 2h'],
      ['9c8c', 'AhAd', '7c 6d 2c'],
      ['5h5d', 'KsQs', 'Kd 5s 2s'],
      ['AhTd', 'AcTc', 'Ad Th 3c'], // lots of ties
    ]
    for (const [a, b, board] of cases) {
      const r = hvh(a, b, board)
      const ref = naiveEquity([parseCards(a), parseCards(b)], parseCards(board))
      expect(eq(r, 0)).toBeCloseTo(ref[0], 12)
    }
  })

  it('multiway (3 players) on the flop matches the naive enumeration', () => {
    const hands = ['AsKs', 'QdQc', '9h8h']
    const board = 'Js Th 2h'
    const r = exactEquity({ players: hands.map((x) => handPlayer(h(x))), board: parseCards(board) })
    const ref = naiveEquity(hands.map((x) => parseCards(x)), parseCards(board))
    r.players.forEach((p, i) => expect(p.equity).toBeCloseTo(ref[i], 12))
    expect(r.players.reduce((s, p) => s + p.equity, 0)).toBeCloseTo(1, 12)
  })

  it('river: equity is 0, 1/2 or 1', () => {
    expect(eq(hvh('AsKs', 'QdQc', 'Ac 7d 2c 3h 9s'))).toBe(1)
    expect(eq(hvh('AsKs', 'AdKd', 'Qs Jd Tc 3h 9s'))).toBe(0.5)
  })

  it('3-way preflop AA / KK / QQ sums to 1 and orders correctly', () => {
    const r = calculateEquity({ players: ['AsAh', 'KsKh', 'QsQh'].map((x) => handPlayer(h(x))) })
    expect(r.method).toBe('exact')
    expect(r.players.reduce((s, p) => s + p.equity, 0)).toBeCloseTo(1, 12)
    expect(eq(r, 0)).toBeGreaterThan(eq(r, 1))
    expect(eq(r, 1)).toBeGreaterThan(eq(r, 2))
  })
})

describe('equity: ranges and card removal', () => {
  it('a weighted range equals the weighted average of its combos (no card interaction)', () => {
    const e1 = eq(hvh('AsAh', 'QcQd', '2c 7d 9h'))
    const e2 = eq(hvh('KsKh', 'QcQd', '2c 7d 9h'))
    const r = exactEquity({
      players: [
        { combos: [{ combo: comboIndex(...h('AsAh')), weight: 1 }, { combo: comboIndex(...h('KsKh')), weight: 0.5 }] },
        handPlayer(h('QcQd')),
      ],
      board: parseCards('2c 7d 9h'),
    })
    expect(eq(r)).toBeCloseTo((e1 + 0.5 * e2) / 1.5, 12)
  })

  it('scaling all weights of a range does not change equity', () => {
    const a = exactEquity({ players: [rangePlayer(parseRange('AK')), rangePlayer(parseRange('TT+'))], board: parseCards('Ks 8d 3c 2h') })
    const b = exactEquity({ players: [rangePlayer(parseRange('AK:40%')), rangePlayer(parseRange('TT+:10%'))], board: parseCards('Ks 8d 3c 2h') })
    expect(eq(a)).toBeCloseTo(eq(b), 12)
  })

  it('removes combos blocked by the board', () => {
    // Villain AA on an ace-high board has only 3 combos left; hero KK is drawing nearly dead.
    const r = exactEquity({ players: [handPlayer(h('KsKh')), rangePlayer(parseRange('AA'))], board: parseCards('Ad 7c 2s') })
    expect(r.samples).toBe(3 * binomial(45, 2))
    expect(eq(r)).toBeLessThan(0.1)
  })

  it('skips colliding assignments between ranges', () => {
    // AA vs AA: only disjoint pairs of AA combos exist (3 of them per first combo); result is ~50%.
    const r = exactEquity({ players: [rangePlayer(parseRange('AA')), rangePlayer(parseRange('AA'))], board: parseCards('2c 7d 9h Js') })
    expect(eq(r)).toBeCloseTo(0.5, 12)
    expect(r.samples).toBe(6 * 1 * 44) // each AA combo has exactly one disjoint AA combo
  })

  it('throws when ranges cannot coexist', () => {
    expect(() => calculateEquity({ players: [handPlayer(h('AhKh')), handPlayer(h('AhQd'))] })).toThrow()
    expect(() => calculateEquity({ players: [handPlayer(h('AhKh')), rangePlayer(parseRange('AA'))], board: parseCards('As Ad Ac') })).toThrow()
  })

  it('respects dead cards', () => {
    const withDead = exactEquity({ players: [handPlayer(h('AhKh')), handPlayer(h('7s7d'))], board: parseCards('7h 8h 2c'), dead: parseCards('Qh Jh Th') })
    const without = hvh('AhKh', '7s7d', '7h8h2c')
    expect(withDead.samples).toBe(binomial(42, 2))
    expect(eq(withDead)).toBeLessThan(eq(without))
  })
})

describe('equity: Monte Carlo', () => {
  it('agrees with exact enumeration within 4 standard errors and reports a sensible SE', () => {
    const exact = hvh('AsAh', 'KdKc')
    const mc = monteCarloEquity({ players: [handPlayer(h('AsAh')), handPlayer(h('KdKc'))], iterations: 200_000, seed: 42 })
    const p = mc.players[0]
    expect(Math.abs(p.equity - eq(exact))).toBeLessThan(4 * p.stdError)
    // For a near-Bernoulli outcome SE ≈ sqrt(p(1-p)/n)
    expect(p.stdError).toBeCloseTo(Math.sqrt((eq(exact) * (1 - eq(exact))) / 200_000), 3)
    expect(p.marginOfError95).toBeCloseTo(1.96 * p.stdError, 12)
  })

  it('is reproducible with a seed', () => {
    const req = { players: [handPlayer(h('AsKd')), rangePlayer(parseRange('22+, AJ+'))], iterations: 20_000, seed: 9 }
    expect(monteCarloEquity(req).players[0].equity).toBe(monteCarloEquity(req).players[0].equity)
  })

  it('AA vs a random hand ≈ 85.2%', () => {
    const r = monteCarloEquity({ players: [handPlayer(h('AsAh')), rangePlayer(parseRange('any'))], iterations: 300_000, seed: 5 })
    expect(Math.abs(eq(r) - 0.852)).toBeLessThan(Math.max(0.003, 4 * r.players[0].stdError))
  })

  it('range vs range sampling matches exact enumeration on the flop', () => {
    const req = { players: [rangePlayer(parseRange('AQs+, TT+')), rangePlayer(parseRange('88+, AJs+, KQs'))], board: parseCards('Qs 9d 4c') }
    const exact = exactEquity(req)
    const mc = monteCarloEquity({ ...req, iterations: 200_000, seed: 11 })
    expect(Math.abs(eq(mc) - eq(exact))).toBeLessThan(4 * mc.players[0].stdError)
  })
})

describe('equity: method selection', () => {
  it('auto uses exact when cheap and Monte Carlo when expensive', () => {
    expect(calculateEquity({ players: [handPlayer(h('AsAh')), handPlayer(h('KdKc'))] }).method).toBe('exact')
    const big = { players: [rangePlayer(parseRange('any')), rangePlayer(parseRange('any'))], iterations: 2000, seed: 1 }
    expect(estimateExactEvaluations(big)).toBeGreaterThan(1e9)
    expect(calculateEquity(big).method).toBe('monte-carlo')
  })

  it('supports early stop via shouldStop', () => {
    let calls = 0
    const r = monteCarloEquity({
      players: [handPlayer(h('AsAh')), handPlayer(h('KdKc'))], iterations: 1_000_000, seed: 1,
      shouldStop: () => ++calls >= 2,
    })
    expect(r.stoppedEarly).toBe(true)
    expect(r.samples).toBe(10_000)
  })
})
