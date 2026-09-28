/**
 * Starting-hand combos and the 169 hand classes.
 *
 * Combinatorics (all derived, never hardcoded, see formulas.ts `comboCounts`):
 *   total two-card combos  = C(52, 2) = 1326
 *   pocket pair (e.g. QQ)  = C(4, 2)  = 6
 *   suited hand (e.g. AKs) = 4 suits  = 4
 *   offsuit hand (e.g. AKo)= 4 * 3    = 12
 *   classes                = 13 pairs + 78 suited + 78 offsuit = 169
 *
 * Combo index: every unordered pair of distinct cards {a, b} gets a stable index 0..1325.
 * Grid: the classic 13x13 chart, row/col 0 = Ace ... 12 = Deuce.
 *   row === col -> pair; row < col (above the diagonal) -> suited; row > col -> offsuit.
 */
import { type Card, RANK_CHARS, rankOf, suitOf, formatCard, makeCard } from './cards'

export const NUM_COMBOS = 1326
export const NUM_CLASSES = 169

/** COMBO_CARDS[2*i] is the higher card, COMBO_CARDS[2*i+1] the lower card of combo i. */
export const COMBO_CARDS = new Uint8Array(NUM_COMBOS * 2)
/** COMBO_INDEX[a * 52 + b] = combo index for cards a != b (symmetric), -1 on the diagonal. */
const COMBO_INDEX = new Int16Array(52 * 52).fill(-1)

;(function buildCombos() {
  let i = 0
  for (let hi = 1; hi < 52; hi++) {
    for (let lo = 0; lo < hi; lo++) {
      COMBO_CARDS[2 * i] = hi
      COMBO_CARDS[2 * i + 1] = lo
      COMBO_INDEX[hi * 52 + lo] = i
      COMBO_INDEX[lo * 52 + hi] = i
      i++
    }
  }
})()

export function comboIndex(a: Card, b: Card): number {
  const idx = COMBO_INDEX[a * 52 + b]
  if (idx < 0) throw new Error('A combo needs two distinct cards')
  return idx
}

export function comboCards(i: number): [Card, Card] {
  return [COMBO_CARDS[2 * i], COMBO_CARDS[2 * i + 1]]
}

/** Format with the higher rank first, e.g. "AhKd". */
export function formatCombo(i: number): string {
  const [a, b] = comboCards(i)
  const [x, y] = rankOf(a) >= rankOf(b) ? [a, b] : [b, a]
  return formatCard(x) + formatCard(y)
}

// ---------------------------------------------------------------------------------------------
// Hand classes (the 169 "strategically distinct" preflop hands)
// ---------------------------------------------------------------------------------------------
export type ClassKind = 'pair' | 'suited' | 'offsuit'

export interface HandClass {
  /** 0..168, equal to row * 13 + col in the grid. */
  index: number
  /** Grid row/col, 0 = Ace ... 12 = Deuce. */
  row: number
  col: number
  /** Higher and lower rank as engine ranks (0 = deuce ... 12 = ace). */
  high: number
  low: number
  kind: ClassKind
  /** e.g. "AKs", "QQ", "72o". */
  label: string
  /** Combo indices belonging to this class (6, 4 or 12 entries). */
  combos: number[]
}

/** Grid position -> engine rank. Row 0 is the Ace. */
export const gridRank = (rowOrCol: number): number => 12 - rowOrCol
export const rankToGrid = (rank: number): number => 12 - rank

export const HAND_CLASSES: HandClass[] = []
/** COMBO_CLASS[comboIndex] = hand class index. */
export const COMBO_CLASS = new Uint8Array(NUM_COMBOS)

;(function buildClasses() {
  for (let row = 0; row < 13; row++) {
    for (let col = 0; col < 13; col++) {
      const kind: ClassKind = row === col ? 'pair' : row < col ? 'suited' : 'offsuit'
      const high = gridRank(Math.min(row, col))
      const low = gridRank(Math.max(row, col))
      const label =
        RANK_CHARS[high] + RANK_CHARS[low] + (kind === 'pair' ? '' : kind === 'suited' ? 's' : 'o')
      const combos: number[] = []
      for (let s1 = 0; s1 < 4; s1++) {
        for (let s2 = 0; s2 < 4; s2++) {
          if (kind === 'pair' && s2 <= s1) continue
          if (kind === 'suited' && s1 !== s2) continue
          if (kind === 'offsuit' && s1 === s2) continue
          combos.push(comboIndex(makeCard(high, s1), makeCard(low, s2)))
        }
      }
      const index = row * 13 + col
      HAND_CLASSES.push({ index, row, col, high, low, kind, label, combos })
      for (const c of combos) COMBO_CLASS[c] = index
    }
  }
})()

const CLASS_BY_LABEL = new Map(HAND_CLASSES.map((h) => [h.label, h]))

/** Look up a class by label ("AKs", "QQ", "T9o"). Case-insensitive on the rank letters. */
export function handClassByLabel(label: string): HandClass | undefined {
  const t = label.trim()
  if (t.length < 2) return undefined
  const norm = t.slice(0, 2).toUpperCase() + t.slice(2).toLowerCase()
  return CLASS_BY_LABEL.get(norm)
}

export function classOfCombo(i: number): HandClass {
  return HAND_CLASSES[COMBO_CLASS[i]]
}

export function classOfCards(a: Card, b: Card): HandClass {
  return HAND_CLASSES[COMBO_CLASS[comboIndex(a, b)]]
}

export function isSuitedCombo(i: number): boolean {
  return suitOf(COMBO_CARDS[2 * i]) === suitOf(COMBO_CARDS[2 * i + 1])
}

/** True when combo i shares a card with the dead-card flags. */
export function comboBlocked(i: number, dead: Uint8Array): boolean {
  return dead[COMBO_CARDS[2 * i]] === 1 || dead[COMBO_CARDS[2 * i + 1]] === 1
}

/** True when two combos share at least one card. */
export function combosOverlap(i: number, j: number): boolean {
  const a = COMBO_CARDS[2 * i], b = COMBO_CARDS[2 * i + 1]
  const c = COMBO_CARDS[2 * j], d = COMBO_CARDS[2 * j + 1]
  return a === c || a === d || b === c || b === d
}
