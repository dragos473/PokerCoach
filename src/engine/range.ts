/**
 * Range model: a weight in [0, 1] for each of the 1326 combos.
 * (UI shows weights as 0..100 %; the engine stores fractions.)
 *
 * Notation supported by `parseRange` (comma or whitespace separated tokens):
 *   QQ            one pocket pair (6 combos)
 *   22+           22 up to AA
 *   99-66         pairs from 99 down to 66 (either order)
 *   AKs / AKo     one suited / offsuit class (4 / 12 combos)
 *   AK            both suited and offsuit (16 combos)
 *   A2s+          suited, kicker raised up to one below the top card: A2s..AKs
 *   KTo+          KTo, KJo, KQo
 *   A5s-A2s       suited ace, kickers 5 down to 2 (same top card required)
 *   AhKh          one specific combo
 *   any, random   all 1326 combos
 * Weight suffix on any token:  "AKs:50%"  or "AKs:0.5"  (a bare number > 1 is read as a percent).
 * Later tokens overwrite earlier ones for the combos they cover.
 */
import { parseCard, RANK_CHARS, rankFromChar, type Card, deadFlags } from './cards'
import {
  NUM_COMBOS, HAND_CLASSES, handClassByLabel, comboIndex, comboBlocked, COMBO_CLASS,
  formatCombo, type HandClass, NUM_CLASSES,
} from './combos'

export type Weights = Float64Array

export function emptyRange(): Weights {
  return new Float64Array(NUM_COMBOS)
}

export function fullRange(): Weights {
  return new Float64Array(NUM_COMBOS).fill(1)
}

export function cloneRange(r: Weights): Weights {
  return new Float64Array(r)
}

export function clampWeight(w: number): number {
  if (!Number.isFinite(w)) return 0
  return w < 0 ? 0 : w > 1 ? 1 : w
}

// ---------------------------------------------------------------------------------------------
// Class-level helpers
// ---------------------------------------------------------------------------------------------
export function setClassWeight(r: Weights, cls: HandClass, w: number): void {
  const v = clampWeight(w)
  for (const c of cls.combos) r[c] = v
}

/**
 * Average weight of a class over its combos. With `dead` cards, blocked combos are excluded
 * (returns 0 when every combo of the class is blocked).
 */
export function classWeight(r: Weights, cls: HandClass, dead?: Uint8Array): number {
  let sum = 0
  let n = 0
  for (const c of cls.combos) {
    if (dead && comboBlocked(c, dead)) continue
    sum += r[c]
    n++
  }
  return n ? sum / n : 0
}

// ---------------------------------------------------------------------------------------------
// Counting and card removal
// ---------------------------------------------------------------------------------------------
/**
 * Weighted combo count: sum of weights of combos not blocked by `dead` cards.
 * e.g. "AA" with an ace on board -> C(3,2) = 3 combos.
 */
export function comboCount(r: Weights, dead: readonly Card[] = []): number {
  const d = deadFlags(dead)
  let sum = 0
  for (let i = 0; i < NUM_COMBOS; i++) if (r[i] > 0 && !comboBlocked(i, d)) sum += r[i]
  return sum
}

/** Fraction of all 1326 starting hands (the usual "% of hands" figure; ignores dead cards). */
export function rangePercent(r: Weights): number {
  let sum = 0
  for (let i = 0; i < NUM_COMBOS; i++) sum += r[i]
  return sum / NUM_COMBOS
}

export interface WeightedCombo {
  combo: number
  weight: number
}

/** Combos with positive weight that do not use a dead card. */
export function liveCombos(r: Weights, dead: readonly Card[] = []): WeightedCombo[] {
  const d = deadFlags(dead)
  const out: WeightedCombo[] = []
  for (let i = 0; i < NUM_COMBOS; i++) if (r[i] > 0 && !comboBlocked(i, d)) out.push({ combo: i, weight: r[i] })
  return out
}

/** Copy of the range with dead-card combos zeroed ("remove blockers"). */
export function removeBlocked(r: Weights, dead: readonly Card[]): Weights {
  const d = deadFlags(dead)
  const out = cloneRange(r)
  for (let i = 0; i < NUM_COMBOS; i++) if (comboBlocked(i, d)) out[i] = 0
  return out
}

/** Per-class weighted combo counts after card removal (useful for the grid). */
export function classComboCounts(r: Weights, dead: readonly Card[] = []): Float64Array {
  const d = deadFlags(dead)
  const out = new Float64Array(NUM_CLASSES)
  for (let i = 0; i < NUM_COMBOS; i++) if (r[i] > 0 && !comboBlocked(i, d)) out[COMBO_CLASS[i]] += r[i]
  return out
}

// ---------------------------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------------------------
export class RangeParseError extends Error {}

function parseWeight(text: string, token: string): number {
  const t = text.trim()
  const pct = t.endsWith('%')
  const num = Number(pct ? t.slice(0, -1) : t)
  if (!Number.isFinite(num) || num < 0) throw new RangeParseError(`Invalid weight in "${token}"`)
  const w = pct || num > 1 ? num / 100 : num
  if (w > 1) throw new RangeParseError(`Weight above 100% in "${token}"`)
  return w
}

function classFor(high: number, low: number, kind: 'pair' | 'suited' | 'offsuit'): HandClass {
  const label = RANK_CHARS[high] + RANK_CHARS[low] + (kind === 'pair' ? '' : kind === 'suited' ? 's' : 'o')
  const cls = handClassByLabel(label)
  if (!cls) throw new RangeParseError(`Unknown hand class ${label}`)
  return cls
}

/** Parse "AK", "AKs", "AKo", "QQ" into its ranks and kinds. */
function parseClassToken(t: string, token: string): { high: number; low: number; kinds: ('pair' | 'suited' | 'offsuit')[] } {
  if (t.length < 2 || t.length > 3) throw new RangeParseError(`Cannot parse "${token}"`)
  let a: number, b: number
  try {
    a = rankFromChar(t[0])
    b = rankFromChar(t[1])
  } catch {
    throw new RangeParseError(`Cannot parse "${token}"`)
  }
  const suffix = t.slice(2).toLowerCase()
  if (a === b) {
    if (suffix) throw new RangeParseError(`A pair cannot be suited/offsuit in "${token}"`)
    return { high: a, low: b, kinds: ['pair'] }
  }
  const high = Math.max(a, b)
  const low = Math.min(a, b)
  if (suffix === 's') return { high, low, kinds: ['suited'] }
  if (suffix === 'o') return { high, low, kinds: ['offsuit'] }
  if (suffix === '') return { high, low, kinds: ['suited', 'offsuit'] }
  throw new RangeParseError(`Unknown suffix in "${token}"`)
}

/** Expand one token (without weight) into combo indices. */
function expandToken(body: string, token: string): number[] {
  const t = body.trim()
  const lower = t.toLowerCase()
  if (lower === 'any' || lower === 'random' || lower === 'all') return Array.from({ length: NUM_COMBOS }, (_, i) => i)

  // Specific combo like "AhKh"
  if (/^[2-9tjqka][cdhs][2-9tjqka][cdhs]$/i.test(t)) {
    const a = parseCard(t.slice(0, 2))
    const b = parseCard(t.slice(2, 4))
    if (a === b) throw new RangeParseError(`Duplicate card in "${token}"`)
    return [comboIndex(a, b)]
  }

  const classes: HandClass[] = []

  if (t.includes('-')) {
    const [left, right] = t.split('-')
    const A = parseClassToken(left, token)
    const B = parseClassToken(right, token)
    if (A.kinds.join() !== B.kinds.join()) throw new RangeParseError(`Mismatched hand types in "${token}"`)
    if (A.kinds[0] === 'pair') {
      const lo = Math.min(A.high, B.high)
      const hi = Math.max(A.high, B.high)
      for (let r = lo; r <= hi; r++) classes.push(classFor(r, r, 'pair'))
    } else {
      if (A.high !== B.high) throw new RangeParseError(`A dash range needs the same top card in "${token}"`)
      const lo = Math.min(A.low, B.low)
      const hi = Math.max(A.low, B.low)
      for (let k = lo; k <= hi; k++) for (const kind of A.kinds) classes.push(classFor(A.high, k, kind))
    }
  } else if (t.endsWith('+')) {
    const A = parseClassToken(t.slice(0, -1), token)
    if (A.kinds[0] === 'pair') {
      for (let r = A.high; r <= 12; r++) classes.push(classFor(r, r, 'pair'))
    } else {
      for (let k = A.low; k < A.high; k++) for (const kind of A.kinds) classes.push(classFor(A.high, k, kind))
    }
  } else {
    const A = parseClassToken(t, token)
    for (const kind of A.kinds) classes.push(classFor(A.high, A.low, kind))
  }

  const out: number[] = []
  for (const c of classes) out.push(...c.combos)
  return out
}

/** Parse standard range notation into weights. Throws RangeParseError with a readable message. */
export function parseRange(text: string): Weights {
  const r = emptyRange()
  const tokens = text.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean)
  for (const token of tokens) {
    const [body, weightText, extra] = token.split(':')
    if (extra !== undefined) throw new RangeParseError(`Too many ":" in "${token}"`)
    const w = weightText === undefined ? 1 : parseWeight(weightText, token)
    for (const c of expandToken(body, token)) r[c] = w
  }
  return r
}

// ---------------------------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------------------------
const EPS = 1e-9

function formatWeight(w: number): string {
  const pct = Math.round(w * 10000) / 100
  return `${pct}%`
}

/**
 * Compress consecutive integers (sorted ascending) into runs [start, end].
 */
function runs(values: number[]): [number, number][] {
  const out: [number, number][] = []
  for (const v of values) {
    const last = out[out.length - 1]
    if (last && v === last[1] + 1) last[1] = v
    else out.push([v, v])
  }
  return out
}

function pairRunText(lo: number, hi: number): string {
  const p = (r: number) => RANK_CHARS[r] + RANK_CHARS[r]
  if (hi === 12 && lo < hi) return `${p(lo)}+`
  if (lo === hi) return p(lo)
  return `${p(hi)}-${p(lo)}`
}

function kickerRunText(high: number, lo: number, hi: number, suffix: string): string {
  const h = (k: number) => RANK_CHARS[high] + RANK_CHARS[k] + suffix
  if (hi === high - 1 && lo < hi) return `${h(lo)}+`
  if (lo === hi) return h(lo)
  return `${h(hi)}-${h(lo)}`
}

/**
 * Write weights back to compact standard notation. Classes whose combos all share one weight are
 * written as classes (compressed with "+" and "-"); classes with mixed combo weights are written
 * combo by combo. Round-trips exactly through `parseRange` (up to 0.01% weight rounding).
 */
export function formatRange(r: Weights): string {
  // Group full classes by weight; collect leftover specific combos.
  const byWeight = new Map<string, { w: number; classes: Set<number> }>()
  const specific: { combo: number; w: number }[] = []

  for (const cls of HAND_CLASSES) {
    const ws = cls.combos.map((c) => r[c])
    const first = ws[0]
    const uniform = ws.every((w) => Math.abs(w - first) < EPS)
    if (uniform) {
      if (first <= EPS) continue
      const key = formatWeight(first)
      if (!byWeight.has(key)) byWeight.set(key, { w: first, classes: new Set() })
      byWeight.get(key)!.classes.add(cls.index)
    } else {
      for (const c of cls.combos) if (r[c] > EPS) specific.push({ combo: c, w: r[c] })
    }
  }

  if (byWeight.size === 1 && specific.length === 0) {
    const only = [...byWeight.values()][0]
    if (only.classes.size === NUM_CLASSES && Math.abs(only.w - 1) < EPS) return 'any'
  }

  const parts: string[] = []
  const groups = [...byWeight.values()].sort((a, b) => b.w - a.w)
  for (const g of groups) {
    const suffix = Math.abs(g.w - 1) < EPS ? '' : `:${formatWeight(g.w)}`
    const tokens: string[] = []
    const has = (high: number, low: number, kind: 'pair' | 'suited' | 'offsuit') =>
      g.classes.has(classFor(high, low, kind).index)

    // Pairs, highest first
    const pairRanks: number[] = []
    for (let r0 = 0; r0 <= 12; r0++) if (has(r0, r0, 'pair')) pairRanks.push(r0)
    for (const [lo, hi] of runs(pairRanks).reverse()) tokens.push(pairRunText(lo, hi))

    // Non-pairs by top card, highest first
    for (let high = 12; high >= 1; high--) {
      const s: number[] = []
      const o: number[] = []
      for (let k = 0; k < high; k++) {
        if (has(high, k, 'suited')) s.push(k)
        if (has(high, k, 'offsuit')) o.push(k)
      }
      const sRuns = runs(s).reverse()
      const oRuns = runs(o).reverse()
      // Emit runs present in both suited and offsuit without a suffix ("AT+" instead of "ATs+, ATo+").
      const key = (x: [number, number]) => `${x[0]}-${x[1]}`
      const oKeys = new Set(oRuns.map(key))
      const both = sRuns.filter((x) => oKeys.has(key(x)))
      const bothKeys = new Set(both.map(key))
      const all: { lo: number; hi: number; suf: string }[] = [
        ...both.map(([lo, hi]) => ({ lo, hi, suf: '' })),
        ...sRuns.filter((x) => !bothKeys.has(key(x))).map(([lo, hi]) => ({ lo, hi, suf: 's' })),
        ...oRuns.filter((x) => !bothKeys.has(key(x))).map(([lo, hi]) => ({ lo, hi, suf: 'o' })),
      ].sort((a, b) => b.hi - a.hi || (a.suf < b.suf ? -1 : 1))
      for (const x of all) tokens.push(kickerRunText(high, x.lo, x.hi, x.suf))
    }
    for (const tkn of tokens) parts.push(tkn + suffix)
  }

  specific.sort((a, b) => b.w - a.w || a.combo - b.combo)
  for (const s of specific) {
    parts.push(formatCombo(s.combo) + (Math.abs(s.w - 1) < EPS ? '' : `:${formatWeight(s.w)}`))
  }
  return parts.join(', ')
}

/** Structural equality with a tolerance (used by tests and the editor's "unsaved changes" check). */
export function rangesEqual(a: Weights, b: Weights, tol = 1e-4): boolean {
  for (let i = 0; i < NUM_COMBOS; i++) if (Math.abs(a[i] - b[i]) > tol) return false
  return true
}

/**
 * Probability that villain folds, from their range and a per-combo continue frequency:
 *   P(fold) = 1 − Σ w_i · c_i / Σ w_i       (over combos not blocked by dead cards)
 * where w_i is the range weight and c_i ∈ [0, 1] the fraction of combo i that continues.
 */
export function foldProbabilityFromRange(r: Weights, continuing: Weights, dead: readonly Card[] = []): number {
  const d = deadFlags(dead)
  let total = 0
  let cont = 0
  for (let i = 0; i < NUM_COMBOS; i++) {
    if (r[i] <= 0 || comboBlocked(i, d)) continue
    total += r[i]
    cont += r[i] * clampWeight(continuing[i])
  }
  if (total === 0) throw new Error('Range is empty after card removal')
  return 1 - cont / total
}
