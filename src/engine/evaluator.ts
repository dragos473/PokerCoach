/**
 * Hand evaluator for 5, 6 and 7 cards.
 *
 * Algorithm (bitmask evaluator, no huge lookup tables):
 *   1. Build four 13-bit masks, one per suit, of the ranks held in that suit.
 *   2. Build "rank multiplicity" masks with the carry trick
 *        r4 |= r3 & b; r3 |= r2 & b; r2 |= r1 & b; r1 |= b
 *      so r1 = ranks held at least once, r2 = at least twice, r3 = three times, r4 = four times.
 *   3. Resolve the category from these masks in strength order, reading kickers from
 *      small precomputed 8192-entry tables (highest bit, popcount, straight high card, top-5 ranks).
 *
 * The returned score is a single integer where a larger number is a stronger hand and equal numbers
 * are exact ties (split pots):
 *
 *   score = category << 20 | k1 << 16 | k2 << 12 | k3 << 8 | k4 << 4 | k5
 *
 * category 0..8 (HIGH_CARD..STRAIGHT_FLUSH), k1..k5 are ranks 0..12 in decreasing significance.
 * Correctness is verified in tests by exhaustive enumeration of all 2,598,960 five-card hands
 * (exact category frequencies and exactly 7,462 distinct hand values), a brute-force cross-check on
 * random 7-card hands, and optionally all 133,784,560 seven-card hands (SLOW=1).
 */
import type { Card } from './cards'

export const HandCategory = {
  HIGH_CARD: 0,
  PAIR: 1,
  TWO_PAIR: 2,
  TRIPS: 3,
  STRAIGHT: 4,
  FLUSH: 5,
  FULL_HOUSE: 6,
  QUADS: 7,
  STRAIGHT_FLUSH: 8,
} as const
export type HandCategory = (typeof HandCategory)[keyof typeof HandCategory]

export const CATEGORY_NAMES = [
  'High card',
  'One pair',
  'Two pair',
  'Three of a kind',
  'Straight',
  'Flush',
  'Full house',
  'Four of a kind',
  'Straight flush',
] as const

// ---------------------------------------------------------------------------------------------
// Precomputed 13-bit tables
// ---------------------------------------------------------------------------------------------
const SIZE = 1 << 13
/** Index of the highest set bit (rank), or -1 for 0. */
const TOP = new Int8Array(SIZE)
const POPCOUNT = new Uint8Array(SIZE)
/** High-card rank of the best straight in the mask, or -1. The wheel A-2-3-4-5 has high card 3 (the five). */
const STRAIGHT_HIGH = new Int8Array(SIZE)
/** Up to five highest ranks packed as nibbles: r1 << 16 | r2 << 12 | r3 << 8 | r4 << 4 | r5. */
const TOP5 = new Int32Array(SIZE)

;(function buildTables() {
  for (let m = 0; m < SIZE; m++) {
    let top = -1
    let pop = 0
    let packed = 0
    let taken = 0
    for (let r = 12; r >= 0; r--) {
      if (m & (1 << r)) {
        if (top < 0) top = r
        pop++
        if (taken < 5) {
          packed |= r << (16 - 4 * taken)
          taken++
        }
      }
    }
    TOP[m] = top
    POPCOUNT[m] = pop
    TOP5[m] = packed

    let sh = -1
    for (let high = 12; high >= 4; high--) {
      const run = 0b11111 << (high - 4)
      if ((m & run) === run) {
        sh = high
        break
      }
    }
    // Wheel: A,5,4,3,2 -> bits 12,3,2,1,0
    if (sh < 0 && (m & 0b1000000001111) === 0b1000000001111) sh = 3
    STRAIGHT_HIGH[m] = sh
  }
})()

const CAT_SHIFT = 20

/**
 * Core scoring from the suit masks and the multiplicity masks.
 * Kept as one function so every entry point (array or fixed-arity) shares identical logic.
 */
function scoreFromMasks(s0: number, s1: number, s2: number, s3: number, r1: number, r2: number, r3: number, r4: number): number {
  // Flush / straight flush. With at most 7 cards at most one suit can hold 5+ cards,
  // and a flush cannot coexist with quads or a full house in 7 cards, so checking it first is safe.
  let fm = 0
  if (POPCOUNT[s0] >= 5) fm = s0
  else if (POPCOUNT[s1] >= 5) fm = s1
  else if (POPCOUNT[s2] >= 5) fm = s2
  else if (POPCOUNT[s3] >= 5) fm = s3
  if (fm) {
    const sf = STRAIGHT_HIGH[fm]
    if (sf >= 0) return (8 << CAT_SHIFT) | (sf << 16)
    return (5 << CAT_SHIFT) | TOP5[fm]
  }

  if (r4) {
    const q = TOP[r4]
    const kicker = TOP[r1 & ~(1 << q)]
    return (7 << CAT_SHIFT) | (q << 16) | (kicker << 12)
  }

  if (r3) {
    const t = TOP[r3]
    const pairMask = r2 & ~(1 << t) // a second set of trips also counts as the pair
    if (pairMask) return (6 << CAT_SHIFT) | (t << 16) | (TOP[pairMask] << 12)
  }

  const st = STRAIGHT_HIGH[r1]
  if (st >= 0) return (4 << CAT_SHIFT) | (st << 16)

  if (r3) {
    const t = TOP[r3]
    // two highest remaining ranks as kickers
    return (3 << CAT_SHIFT) | (t << 16) | ((TOP5[r1 & ~(1 << t)] >> 12) << 8)
  }

  if (r2) {
    const p1 = TOP[r2]
    const rest = r2 & ~(1 << p1)
    if (rest) {
      const p2 = TOP[rest]
      // kicker: best remaining rank, which may be a third pair
      const kicker = TOP[r1 & ~(1 << p1) & ~(1 << p2)]
      return (2 << CAT_SHIFT) | (p1 << 16) | (p2 << 12) | (kicker << 8)
    }
    // three kickers
    return (1 << CAT_SHIFT) | (p1 << 16) | ((TOP5[r1 & ~(1 << p1)] >> 8) << 4)
  }

  return TOP5[r1]
}

/** Evaluate 5, 6 or 7 distinct cards. Returns a comparable score (higher is better). */
export function evaluate(cards: ArrayLike<Card>): number {
  let s0 = 0, s1 = 0, s2 = 0, s3 = 0
  let r1 = 0, r2 = 0, r3 = 0, r4 = 0
  for (let i = 0; i < cards.length; i++) {
    const c = cards[i]
    const b = 1 << (c >> 2)
    switch (c & 3) {
      case 0: s0 |= b; break
      case 1: s1 |= b; break
      case 2: s2 |= b; break
      default: s3 |= b
    }
    r4 |= r3 & b
    r3 |= r2 & b
    r2 |= r1 & b
    r1 |= b
  }
  return scoreFromMasks(s0, s1, s2, s3, r1, r2, r3, r4)
}

/**
 * Incremental evaluation state: accumulate a fixed set of cards once (e.g. a board),
 * then evaluate "state + 2 hole cards" cheaply. Used by the enumeration hot loops.
 */
export interface MaskState {
  s0: number; s1: number; s2: number; s3: number
  r1: number; r2: number; r3: number; r4: number
}

export function emptyState(): MaskState {
  return { s0: 0, s1: 0, s2: 0, s3: 0, r1: 0, r2: 0, r3: 0, r4: 0 }
}

export function addCard(st: MaskState, c: Card): void {
  const b = 1 << (c >> 2)
  switch (c & 3) {
    case 0: st.s0 |= b; break
    case 1: st.s1 |= b; break
    case 2: st.s2 |= b; break
    default: st.s3 |= b
  }
  st.r4 |= st.r3 & b
  st.r3 |= st.r2 & b
  st.r2 |= st.r1 & b
  st.r1 |= b
}

/** Evaluate a precomputed state plus two extra cards, without mutating the state. */
export function evaluateWith2(st: MaskState, a: Card, b: Card): number {
  let s0 = st.s0, s1 = st.s1, s2 = st.s2, s3 = st.s3
  let r1 = st.r1, r2 = st.r2, r3 = st.r3, r4 = st.r4
  let bit = 1 << (a >> 2)
  switch (a & 3) {
    case 0: s0 |= bit; break
    case 1: s1 |= bit; break
    case 2: s2 |= bit; break
    default: s3 |= bit
  }
  r4 |= r3 & bit; r3 |= r2 & bit; r2 |= r1 & bit; r1 |= bit
  bit = 1 << (b >> 2)
  switch (b & 3) {
    case 0: s0 |= bit; break
    case 1: s1 |= bit; break
    case 2: s2 |= bit; break
    default: s3 |= bit
  }
  r4 |= r3 & bit; r3 |= r2 & bit; r2 |= r1 & bit; r1 |= bit
  return scoreFromMasks(s0, s1, s2, s3, r1, r2, r3, r4)
}

export function categoryOf(score: number): HandCategory {
  return (score >> CAT_SHIFT) as HandCategory
}

export function categoryName(score: number): string {
  return CATEGORY_NAMES[categoryOf(score)]
}

const RANK_WORDS = ['Twos', 'Threes', 'Fours', 'Fives', 'Sixes', 'Sevens', 'Eights', 'Nines', 'Tens', 'Jacks', 'Queens', 'Kings', 'Aces']
const RANK_WORD = ['Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Jack', 'Queen', 'King', 'Ace']

/** Human-readable description, e.g. "Full house, Kings full of Sevens". */
export function describeScore(score: number): string {
  const cat = categoryOf(score)
  const k = (i: number) => (score >> (16 - 4 * i)) & 0xf
  switch (cat) {
    case HandCategory.STRAIGHT_FLUSH:
      return k(0) === 12 ? 'Royal flush' : `Straight flush, ${RANK_WORD[k(0)]} high`
    case HandCategory.QUADS:
      return `Four of a kind, ${RANK_WORDS[k(0)]}`
    case HandCategory.FULL_HOUSE:
      return `Full house, ${RANK_WORDS[k(0)]} full of ${RANK_WORDS[k(1)]}`
    case HandCategory.FLUSH:
      return `Flush, ${RANK_WORD[k(0)]} high`
    case HandCategory.STRAIGHT:
      return `Straight, ${RANK_WORD[k(0)]} high`
    case HandCategory.TRIPS:
      return `Three of a kind, ${RANK_WORDS[k(0)]}`
    case HandCategory.TWO_PAIR:
      return `Two pair, ${RANK_WORDS[k(0)]} and ${RANK_WORDS[k(1)]}`
    case HandCategory.PAIR:
      return `Pair of ${RANK_WORDS[k(0)]}`
    default:
      return `${RANK_WORD[k(0)]} high`
  }
}

/**
 * Category of any 1..7 cards (used for partial boards, where a full score is undefined).
 * Flushes and straights require five cards of course.
 */
export function categoryOfCards(cards: ArrayLike<Card>): HandCategory {
  let s = [0, 0, 0, 0]
  let r1 = 0, r2 = 0, r3 = 0, r4 = 0
  for (let i = 0; i < cards.length; i++) {
    const c = cards[i]
    const b = 1 << (c >> 2)
    s[c & 3] |= b
    r4 |= r3 & b; r3 |= r2 & b; r2 |= r1 & b; r1 |= b
  }
  s = s.map((m) => POPCOUNT[m])
  const flush = s.some((n) => n >= 5)
  if (flush) {
    for (let suit = 0; suit < 4; suit++) {
      let m = 0
      for (let i = 0; i < cards.length; i++) if ((cards[i] & 3) === suit) m |= 1 << (cards[i] >> 2)
      if (POPCOUNT[m] >= 5 && STRAIGHT_HIGH[m] >= 0) return HandCategory.STRAIGHT_FLUSH
    }
  }
  if (r4) return HandCategory.QUADS
  if (r3 && (r2 & ~(1 << TOP[r3]))) return HandCategory.FULL_HOUSE
  if (flush) return HandCategory.FLUSH
  if (STRAIGHT_HIGH[r1] >= 0) return HandCategory.STRAIGHT
  if (r3) return HandCategory.TRIPS
  if (r2 && (r2 & ~(1 << TOP[r2]))) return HandCategory.TWO_PAIR
  if (r2) return HandCategory.PAIR
  return HandCategory.HIGH_CARD
}

/** Rank bitmask (13 bits) of a set of cards. */
export function rankMask(cards: ArrayLike<Card>): number {
  let m = 0
  for (let i = 0; i < cards.length; i++) m |= 1 << (cards[i] >> 2)
  return m
}

/** True if some 5-rank straight window has at least `need` ranks present in the mask (wheel included). */
export function straightWindowCount(mask: number): number {
  let best = 0
  for (let high = 12; high >= 3; high--) {
    const window = high === 3 ? 0b1000000001111 : 0b11111 << (high - 4)
    best = Math.max(best, POPCOUNT[mask & window])
  }
  return best
}
