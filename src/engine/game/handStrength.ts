/**
 * Postflop hand classification and hand strength.
 *
 * classifyHand(): made-hand category relative to the board (the board's own pair or straight does
 * not count as the player's), plus draws. Used for range breakdowns and HUD labels.
 *
 * strengthTable(): for every combo, HS = share of all opponent holdings it beats right now (ties 1/2),
 * computed exactly by comparing against every card-disjoint two-card holding, and
 * EHS = HS + (1 − HS) · Ppot where Ppot is the probability that the next card (or cards) complete a
 * straight or flush the hand does not have yet. EHS is a heuristic ranking signal (classic poker-AI
 * idea), used only to ORDER hands inside a range for the bot model; it is labelled as such in the UI.
 */
import { type Card, rankOf, suitOf, DECK_SIZE } from '../cards'
import { COMBO_CARDS, NUM_COMBOS } from '../combos'
import { evaluate, categoryOf, HandCategory, addCard, emptyState, evaluateWith2 } from '../evaluator'
import { binomial } from '../formulas'

export type MadeCategory =
  | 'straight-flush' | 'quads' | 'full-house' | 'flush' | 'straight' | 'set' | 'trips' | 'two-pair'
  | 'overpair' | 'top-pair' | 'middle-pair' | 'weak-pair' | 'underpair' | 'no-pair'

export interface Classification {
  made: MadeCategory
  flushDraw: boolean
  straightDraw: 'oesd' | 'gutshot' | null
  /** Group used for breakdown tables. */
  group: BreakdownGroup
  label: string
}

export type BreakdownGroup = 'nuts' | 'sets' | 'two-pair' | 'top-pair' | 'pairs' | 'strong-draws' | 'weak-draws' | 'air'

export const GROUP_LABELS: Record<BreakdownGroup, string> = {
  nuts: 'Straights, flushes, boats+',
  sets: 'Sets & trips',
  'two-pair': 'Two pair',
  'top-pair': 'Overpairs & top pair',
  pairs: 'Middle / weak pairs',
  'strong-draws': 'Strong draws (FD, OESD)',
  'weak-draws': 'Gutshots',
  air: 'Air',
}
export const GROUP_ORDER: BreakdownGroup[] = ['nuts', 'sets', 'two-pair', 'top-pair', 'pairs', 'strong-draws', 'weak-draws', 'air']

const MADE_LABEL: Record<MadeCategory, string> = {
  'straight-flush': 'Straight flush', quads: 'Quads', 'full-house': 'Full house', flush: 'Flush', straight: 'Straight',
  set: 'Set', trips: 'Trips', 'two-pair': 'Two pair', overpair: 'Overpair', 'top-pair': 'Top pair',
  'middle-pair': 'Middle pair', 'weak-pair': 'Bottom pair', underpair: 'Underpair', 'no-pair': 'No pair',
}

function straightRanks(mask: number): boolean {
  if ((mask & 0b1000000001111) === 0b1000000001111) return true
  for (let h = 12; h >= 4; h--) { const run = 0b11111 << (h - 4); if ((mask & run) === run) return true }
  return false
}

export function classifyHand(hole: Card[], board: Card[]): Classification {
  const all = [...hole, ...board]
  const cat = categoryOf(evaluate(all))
  const boardCat = board.length >= 5 ? categoryOf(evaluate(board)) : -1
  const br = board.map(rankOf)
  const hr = hole.map(rankOf)
  const boardCount = (r: number) => br.filter((x) => x === r).length
  const topBoard = Math.max(...br)
  const sortedBoardRanks = [...new Set(br)].sort((a, b) => b - a)

  let made: MadeCategory
  if (cat >= HandCategory.STRAIGHT && cat > boardCat) {
    made = cat === HandCategory.STRAIGHT_FLUSH ? 'straight-flush' : cat === HandCategory.QUADS ? 'quads' : cat === HandCategory.FULL_HOUSE ? 'full-house' : cat === HandCategory.FLUSH ? 'flush' : 'straight'
    // A "full house" or "quads" made only by the board plus a pair on the board is still counted here.
  } else if (hr[0] === hr[1] && boardCount(hr[0]) === 1) made = 'set'
  else if (hr[0] === hr[1] && boardCount(hr[0]) >= 2) made = 'quads'
  else if (hr.some((r) => boardCount(r) === 2)) made = 'trips'
  else if (hr[0] !== hr[1] && boardCount(hr[0]) >= 1 && boardCount(hr[1]) >= 1) made = 'two-pair'
  else if (hr[0] === hr[1]) made = hr[0] > topBoard ? 'overpair' : 'underpair'
  else {
    const paired = hr.find((r) => boardCount(r) >= 1)
    if (paired === undefined) made = 'no-pair'
    else if (paired === sortedBoardRanks[0]) made = 'top-pair'
    else if (paired === sortedBoardRanks[sortedBoardRanks.length - 1] && sortedBoardRanks.length >= 3) made = 'weak-pair'
    else made = 'middle-pair'
  }
  if (made === 'underpair' && hr[0] > sortedBoardRanks[1]) made = 'middle-pair' // e.g. 99 on K-7-2 is between top and second card

  // Draws (flop and turn only), using at least one hole card.
  let flushDraw = false
  let straightDraw: 'oesd' | 'gutshot' | null = null
  if (board.length < 5 && cat < HandCategory.FLUSH) {
    for (let suit = 0; suit < 4; suit++) {
      const n = all.filter((c) => suitOf(c) === suit).length
      if (n === 4 && hole.some((c) => suitOf(c) === suit)) flushDraw = true
    }
  }
  if (board.length < 5 && cat < HandCategory.STRAIGHT) {
    const mask = all.reduce((m, c) => m | (1 << rankOf(c)), 0)
    const boardMask = board.reduce((m, c) => m | (1 << rankOf(c)), 0)
    let completing = 0
    for (let r = 0; r < 13; r++) {
      if (mask & (1 << r)) continue
      if (straightRanks(mask | (1 << r)) && !straightRanks(boardMask | (1 << r))) completing++
    }
    straightDraw = completing >= 2 ? 'oesd' : completing === 1 ? 'gutshot' : null
  }

  let group: BreakdownGroup
  if (['straight-flush', 'quads', 'full-house', 'flush', 'straight'].includes(made)) group = 'nuts'
  else if (made === 'set' || made === 'trips') group = 'sets'
  else if (made === 'two-pair') group = 'two-pair'
  else if (made === 'overpair' || made === 'top-pair') group = 'top-pair'
  else if (made === 'middle-pair' || made === 'weak-pair' || made === 'underpair') group = 'pairs'
  else if (flushDraw || straightDraw === 'oesd') group = 'strong-draws'
  else if (straightDraw === 'gutshot') group = 'weak-draws'
  else group = 'air'

  const drawText = [flushDraw && 'flush draw', straightDraw === 'oesd' && 'open-ended', straightDraw === 'gutshot' && 'gutshot'].filter(Boolean).join(' + ')
  const label = made === 'no-pair' ? (drawText ? drawText[0].toUpperCase() + drawText.slice(1) : 'Air') : MADE_LABEL[made] + (drawText ? ` + ${drawText}` : '')
  return { made, flushDraw, straightDraw, group, label }
}

export interface StrengthTable {
  /** HS per combo (NaN when the combo collides with the board / dead cards). */
  hs: Float64Array
  /** EHS per combo. */
  ehs: Float64Array
  /** Positive potential estimate per combo. */
  ppot: Float64Array
}

/**
 * Exact hand strength for every combo on a board (3–5 cards). O(1326²) comparisons with each
 * holding evaluated once.
 */
export function strengthTable(board: Card[], dead: Card[] = []): StrengthTable {
  const blocked = new Uint8Array(DECK_SIZE)
  for (const c of [...board, ...dead]) blocked[c] = 1
  const st = emptyState()
  for (const c of board) addCard(st, c)
  const score = new Int32Array(NUM_COMBOS).fill(-1)
  for (let i = 0; i < NUM_COMBOS; i++) {
    const a = COMBO_CARDS[2 * i], b = COMBO_CARDS[2 * i + 1]
    if (!blocked[a] && !blocked[b]) score[i] = evaluateWith2(st, a, b)
  }
  const hs = new Float64Array(NUM_COMBOS).fill(NaN)
  const ppot = new Float64Array(NUM_COMBOS)
  const ehs = new Float64Array(NUM_COMBOS).fill(NaN)
  const valid: number[] = []
  for (let i = 0; i < NUM_COMBOS; i++) if (score[i] >= 0) valid.push(i)
  for (const i of valid) {
    const a = COMBO_CARDS[2 * i], b = COMBO_CARDS[2 * i + 1]
    let win = 0, n = 0
    const si = score[i]
    for (const j of valid) {
      const c = COMBO_CARDS[2 * j], d = COMBO_CARDS[2 * j + 1]
      if (c === a || c === b || d === a || d === b) continue
      const sj = score[j]
      win += si > sj ? 1 : si === sj ? 0.5 : 0
      n++
    }
    hs[i] = n ? win / n : NaN
  }
  // Positive potential: chance the remaining cards bring a straight/flush this hand does not have.
  if (board.length < 5) {
    const unseen: number[] = []
    for (let c = 0; c < DECK_SIZE; c++) if (!blocked[c]) unseen.push(c)
    const cardsToCome = 5 - board.length
    for (const i of valid) {
      const a = COMBO_CARDS[2 * i], b = COMBO_CARDS[2 * i + 1]
      const cat = score[i] >> 20
      if (cat >= HandCategory.STRAIGHT) continue
      let outs = 0, u = 0
      for (const c of unseen) {
        if (c === a || c === b) continue
        u++
        const s2 = evaluate([a, b, ...board, c]) >> 20
        if (s2 === HandCategory.STRAIGHT || s2 === HandCategory.FLUSH || s2 === HandCategory.STRAIGHT_FLUSH) outs++
      }
      // Next-card probability, or at least one of two cards when both turn and river are to come.
      ppot[i] = cardsToCome === 1 ? outs / u : 1 - binomial(u - outs, 2) / binomial(u, 2)
    }
  }
  for (const i of valid) ehs[i] = hs[i] + (1 - hs[i]) * ppot[i]
  return { hs, ehs, ppot }
}
