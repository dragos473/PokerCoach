/**
 * Decision analysis for the hero: equity vs a range and EV of each option.
 *
 * Equity vector: E[c] = hero's all-in equity against villain combo c (NaN if c collides with known
 * cards). Postflop it is exact (enumerates every runout); preflop it uses the class matrix (suit
 * interactions averaged). With the vector, equity against ANY weighting of villain's range is a
 * weighted average, so every HUD number updates instantly when a range is edited.
 *
 * EV model (one street, labelled in the UI):
 *   EV(fold)  = 0
 *   EV(check) = eq · pot                               (no more betting)
 *   EV(call)  = eq · (pot + call) − call               (no more betting)
 *   EV(bet/raise to X) = f · pot + (1 − f) · [ eqC · (pot + risk + villainCall) − risk ]
 *     f   = P(villain folds) from the response model applied to villain's range,
 *     eqC = equity vs the part of the range that continues (a re-raise is treated as a call).
 */
import { type Card, DECK_SIZE } from '../cards'
import { COMBO_CARDS, COMBO_CLASS, NUM_COMBOS, comboIndex } from '../combos'
import { addCard, emptyState, evaluateWith2, type MaskState } from '../evaluator'
import { PREFLOP_EQUITY } from '../preflop'
import type { Weights } from '../range'
import { evBet, evCall, requiredEquity } from '../formulas'
import type { Policy } from './bots'

function copyState(d: MaskState, s: MaskState): void {
  d.s0 = s.s0; d.s1 = s.s1; d.s2 = s.s2; d.s3 = s.s3
  d.r1 = s.r1; d.r2 = s.r2; d.r3 = s.r3; d.r4 = s.r4
}

export function equityVector(hero: [Card, Card], board: Card[], dead: Card[] = []): Float64Array {
  const out = new Float64Array(NUM_COMBOS).fill(NaN)
  const blocked = new Uint8Array(DECK_SIZE)
  for (const c of [...hero, ...board, ...dead]) blocked[c] = 1
  if (board.length === 0) {
    const hc = COMBO_CLASS[comboIndex(hero[0], hero[1])]
    for (let c = 0; c < NUM_COMBOS; c++) {
      const a = COMBO_CARDS[2 * c], b = COMBO_CARDS[2 * c + 1]
      if (!blocked[a] && !blocked[b]) out[c] = PREFLOP_EQUITY[hc * 169 + COMBO_CLASS[c]]
    }
    return out
  }
  const base = emptyState()
  for (const c of board) addCard(base, c)
  const missing = 5 - board.length
  const deck: number[] = []
  for (let c = 0; c < DECK_SIZE; c++) if (!blocked[c]) deck.push(c)
  const st1 = emptyState(), st2 = emptyState()
  for (let c = 0; c < NUM_COMBOS; c++) {
    const a = COMBO_CARDS[2 * c], b = COMBO_CARDS[2 * c + 1]
    if (blocked[a] || blocked[b]) continue
    let share = 0, n = 0
    if (missing === 0) {
      const h = evaluateWith2(base, hero[0], hero[1]), v = evaluateWith2(base, a, b)
      share = h > v ? 1 : h === v ? 0.5 : 0
      n = 1
    } else {
      for (let i = 0; i < deck.length; i++) {
        const x = deck[i]
        if (x === a || x === b) continue
        copyState(st1, base)
        addCard(st1, x)
        if (missing === 1) {
          const h = evaluateWith2(st1, hero[0], hero[1]), v = evaluateWith2(st1, a, b)
          share += h > v ? 1 : h === v ? 0.5 : 0
          n++
          continue
        }
        for (let j = i + 1; j < deck.length; j++) {
          const y = deck[j]
          if (y === a || y === b) continue
          copyState(st2, st1)
          addCard(st2, y)
          const h = evaluateWith2(st2, hero[0], hero[1]), v = evaluateWith2(st2, a, b)
          share += h > v ? 1 : h === v ? 0.5 : 0
          n++
        }
      }
    }
    out[c] = share / n
  }
  return out
}

/** Weighted equity of the hero vs a (sub)range, and the weight of the fitting combos. */
export function equityVsRange(vec: Float64Array, range: Weights, mask?: Float64Array): { equity: number; weight: number } {
  let acc = 0, w = 0
  for (let c = 0; c < NUM_COMBOS; c++) {
    const r = range[c] * (mask ? mask[c] : 1)
    if (r <= 0 || Number.isNaN(vec[c])) continue
    acc += r * vec[c]
    w += r
  }
  return { equity: w > 0 ? acc / w : NaN, weight: w }
}

/** Probability of an action over the part of the range that fits the hero's cards. */
export function actionProbability(range: Weights, actionProb: Float64Array, vec: Float64Array): number {
  let a = 0, t = 0
  for (let c = 0; c < NUM_COMBOS; c++) {
    if (range[c] <= 0 || Number.isNaN(vec[c])) continue
    a += range[c] * actionProb[c]
    t += range[c]
  }
  return t > 0 ? a / t : 0
}

export interface OptionEV {
  kind: 'fold' | 'check' | 'call' | 'bet' | 'raise'
  /** Street bet level for bet/raise (chips). */
  to?: number
  label: string
  ev: number
  foldProb?: number
  equityWhenCalled?: number
  lines: string[]
}

export interface DecisionInput {
  vec: Float64Array
  /** Villain range (estimate or actual). Card removal vs the hero is applied through the vector. */
  range: Weights
  pot: number
  toCall: number
  heroBet: number
  villainBet: number
  /** Villain response policy after each candidate raise (keyed by raise-to). */
  responses: { to: number; policy: Policy }[]
  chip: (x: number) => string
}

export function evaluateOptions(d: DecisionInput): { equity: number; options: OptionEV[] } {
  const { equity } = equityVsRange(d.vec, d.range)
  const eq = Number.isNaN(equity) ? 0 : equity
  const options: OptionEV[] = []
  if (d.toCall > 0) {
    options.push({ kind: 'fold', label: 'Fold', ev: 0, lines: ['Folding is the reference point (0).'] })
    const e = evCall.compute({ pot: d.pot, call: d.toCall, equity: eq })
    const req = requiredEquity.compute({ pot: d.pot, call: d.toCall })
    options.push({
      kind: 'call', label: 'Call', ev: e, lines: [
        `equity ${(eq * 100).toFixed(1)}% vs required ${(req * 100).toFixed(1)}%`,
        `EV = ${eq.toFixed(3)} · (${d.chip(d.pot)} + ${d.chip(d.toCall)}) − ${d.chip(d.toCall)}`,
      ],
    })
  } else {
    options.push({ kind: 'check', label: 'Check', ev: eq * d.pot, lines: [`EV = equity · pot = ${eq.toFixed(3)} · ${d.chip(d.pot)} (assumes the hand is checked down)`] })
  }
  for (const { to, policy } of d.responses) {
    const risk = to - d.heroBet
    const villainCall = to - d.villainBet
    const f = actionProbability(d.range, policy.fold, d.vec)
    const cont = new Float64Array(NUM_COMBOS)
    for (let c = 0; c < NUM_COMBOS; c++) cont[c] = policy.call[c] + policy.raise[c]
    const { equity: eqC } = equityVsRange(d.vec, d.range, cont)
    const eqCalled = Number.isNaN(eqC) ? 0 : eqC
    const ev = evBet.compute({ pot: d.pot, risk, villainCall, foldProb: f, equityWhenCalled: eqCalled })
    options.push({
      kind: d.toCall > 0 || d.villainBet > 0 ? 'raise' : 'bet', to,
      label: `${d.toCall > 0 || d.villainBet > 0 ? 'Raise to' : 'Bet'} ${d.chip(to)}`, ev, foldProb: f, equityWhenCalled: eqCalled,
      lines: [
        `villain folds ${(f * 100).toFixed(1)}% (response model on this range)`,
        `equity when called ${(eqCalled * 100).toFixed(1)}% (re-raises counted as calls)`,
        `EV = ${f.toFixed(3)} · ${d.chip(d.pot)} + ${(1 - f).toFixed(3)} · [${eqCalled.toFixed(3)} · (${d.chip(d.pot)} + ${d.chip(risk)} + ${d.chip(villainCall)}) − ${d.chip(risk)}]`,
      ],
    })
  }
  return { equity: eq, options }
}
