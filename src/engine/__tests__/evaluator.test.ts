import { describe, it, expect } from 'vitest'
import { evaluate, categoryOf, HandCategory, describeScore, categoryOfCards } from '../evaluator'
import { parseCards } from '../cards'
import { createRng } from '../rng'
import { binomial } from '../formulas'

const ev = (s: string) => evaluate(parseCards(s))

/**
 * Independent brute-force reference: evaluate every 5-card subset with a naive,
 * sort-based classifier and take the max. Shares no code with the fast evaluator.
 */
function naive5(cards: number[]): number {
  const ranks = cards.map((c) => c >> 2).sort((a, b) => b - a)
  const suits = cards.map((c) => c & 3)
  const flush = suits.every((s) => s === suits[0])
  const uniq = [...new Set(ranks)]
  let straightHigh = -1
  if (uniq.length === 5) {
    if (ranks[0] - ranks[4] === 4) straightHigh = ranks[0]
    else if (ranks[0] === 12 && ranks[1] === 3) straightHigh = 3
  }
  const counts = new Map<number, number>()
  for (const r of ranks) counts.set(r, (counts.get(r) ?? 0) + 1)
  // Groups ordered by (count desc, rank desc)
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])
  const pack = (cat: number, ks: number[]) => ks.reduce((acc, k, i) => acc | (k << (16 - 4 * i)), cat << 20)
  if (straightHigh >= 0 && flush) return pack(8, [straightHigh])
  if (groups[0][1] === 4) return pack(7, [groups[0][0], groups[1][0]])
  if (groups[0][1] === 3 && groups[1][1] === 2) return pack(6, [groups[0][0], groups[1][0]])
  if (flush) return pack(5, ranks)
  if (straightHigh >= 0) return pack(4, [straightHigh])
  if (groups[0][1] === 3) return pack(3, groups.map((g) => g[0]))
  if (groups[0][1] === 2 && groups[1][1] === 2) return pack(2, groups.map((g) => g[0]))
  if (groups[0][1] === 2) return pack(1, groups.map((g) => g[0]))
  return pack(0, ranks)
}

function naiveBest(cards: number[]): number {
  let best = -1
  const n = cards.length
  for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) for (let c = b + 1; c < n; c++)
    for (let d = c + 1; d < n; d++) for (let e = d + 1; e < n; e++) {
      best = Math.max(best, naive5([cards[a], cards[b], cards[c], cards[d], cards[e]]))
    }
  return best
}

describe('evaluator: spot checks', () => {
  it('orders the categories correctly', () => {
    const hands = [
      '2c3d4h5s7c', // high card
      '2c2d4h5s7c', // pair
      '2c2d4h4s7c', // two pair
      '2c2d2h5s7c', // trips
      'Ac2d3h4s5c', // wheel straight
      '2c4c6c8cTc', // flush
      '2c2d2h5s5c', // full house
      '2c2d2h2s7c', // quads
      'Ac2c3c4c5c', // steel wheel
      'AcKcQcJcTc', // royal
    ].map(ev)
    for (let i = 1; i < hands.length; i++) expect(hands[i]).toBeGreaterThan(hands[i - 1])
    expect(categoryOf(hands[9])).toBe(HandCategory.STRAIGHT_FLUSH)
  })

  it('handles the wheel as the lowest straight', () => {
    expect(ev('Ac2d3h4s5c')).toBeLessThan(ev('2c3d4h5s6c'))
    expect(describeScore(ev('Ac2d3h4s5c'))).toBe('Straight, Five high')
  })

  it('uses kickers and ties exact duplicates', () => {
    expect(ev('AhAd Kc Qs 2h')).toBeGreaterThan(ev('AsAc Kd Js Th'))
    expect(ev('AhAd Kc Qs 2h')).toBe(ev('AsAc Kd Qc 2d'))
    // Two pair on a paired board with a third pair: best kicker counts
    expect(ev('KhKd 7c7s 3h3d Ac')).toBe(ev('KhKd 7c7s Ac 2d 4h'))
  })

  it('picks the best 5 of 7', () => {
    expect(describeScore(ev('AhKh QhJhTh 2c 3d'))).toBe('Royal flush')
    expect(describeScore(ev('7h7d 7c 2s 2h 2d Kc'))).toBe('Full house, Sevens full of Twos')
    expect(describeScore(ev('9h8h 7h6h 5h 4h 3h'))).toBe('Straight flush, Nine high')
    expect(categoryOf(ev('AhAd AcAs Kh Kd Kc'))).toBe(HandCategory.QUADS)
  })

  it('classifies partial boards', () => {
    expect(categoryOfCards(parseCards('AhAd7c'))).toBe(HandCategory.PAIR)
    expect(categoryOfCards(parseCards('7h7d7c2s'))).toBe(HandCategory.TRIPS)
    expect(categoryOfCards(parseCards('KhQd'))).toBe(HandCategory.HIGH_CARD)
  })
})

describe('evaluator: exhaustive 5-card enumeration', () => {
  it('reproduces the exact category frequencies of all C(52,5) hands and 7,462 distinct values', () => {
    const counts = new Array(9).fill(0)
    const distinct = new Set<number>()
    const cards = [0, 0, 0, 0, 0]
    let total = 0
    let royal = 0
    for (let a = 0; a < 52; a++) for (let b = a + 1; b < 52; b++) for (let c = b + 1; c < 52; c++)
      for (let d = c + 1; d < 52; d++) for (let e = d + 1; e < 52; e++) {
        cards[0] = a; cards[1] = b; cards[2] = c; cards[3] = d; cards[4] = e
        const s = evaluate(cards)
        counts[s >> 20]++
        distinct.add(s)
        if (s >> 20 === 8 && ((s >> 16) & 0xf) === 12) royal++
        total++
      }
    expect(total).toBe(binomial(52, 5)) // 2,598,960
    expect(counts).toEqual([1302540, 1098240, 123552, 54912, 10200, 5108, 3744, 624, 40])
    expect(royal).toBe(4)
    expect(distinct.size).toBe(7462)
  })
})

describe('evaluator: brute-force cross-check', () => {
  it('matches a naive best-5-of-7 evaluator on 30,000 random 7-card hands', () => {
    const rng = createRng(12345)
    for (let t = 0; t < 30_000; t++) {
      const deck = Array.from({ length: 52 }, (_, i) => i)
      for (let k = 0; k < 7; k++) {
        const j = k + rng.int(52 - k)
        ;[deck[k], deck[j]] = [deck[j], deck[k]]
      }
      const hand = deck.slice(0, 7)
      expect(evaluate(hand)).toBe(naiveBest(hand))
    }
  })

  it('matches the naive evaluator on 20,000 random 6-card hands', () => {
    const rng = createRng(999)
    for (let t = 0; t < 20_000; t++) {
      const deck = Array.from({ length: 52 }, (_, i) => i)
      for (let k = 0; k < 6; k++) {
        const j = k + rng.int(52 - k)
        ;[deck[k], deck[j]] = [deck[j], deck[k]]
      }
      const hand = deck.slice(0, 6)
      expect(evaluate(hand)).toBe(naiveBest(hand))
    }
  })
})

describe.runIf(process.env.SLOW)('evaluator: exhaustive 7-card enumeration (SLOW=1)', () => {
  it('reproduces the category frequencies of all 133,784,560 seven-card hands', () => {
    const counts = new Array(9).fill(0)
    const h = [0, 0, 0, 0, 0, 0, 0]
    for (h[0] = 0; h[0] < 52; h[0]++) for (h[1] = h[0] + 1; h[1] < 52; h[1]++)
      for (h[2] = h[1] + 1; h[2] < 52; h[2]++) for (h[3] = h[2] + 1; h[3] < 52; h[3]++)
        for (h[4] = h[3] + 1; h[4] < 52; h[4]++) for (h[5] = h[4] + 1; h[5] < 52; h[5]++)
          for (h[6] = h[5] + 1; h[6] < 52; h[6]++) counts[evaluate(h) >> 20]++
    // Straight flush count includes the 4,324 royal flushes.
    expect(counts).toEqual([23294460, 58627800, 31433400, 6461620, 6180020, 4047644, 3473184, 224848, 41584])
  }, 600_000)
})
