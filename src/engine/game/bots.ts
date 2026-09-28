/**
 * Explainable bot model.
 *
 * A bot never "thinks" about its single hand. For every decision it computes a POLICY: for each
 * combo in its current range, the probability of fold / call(check) / raise(bet). Its actual hand
 * then acts according to its row, and its range is narrowed by the chosen action
 * (range ← range × P(action | combo)). So at any time we know exactly which hands the bot can have
 * and how likely each action was: the HUD and the review show this.
 *
 * Preflop: hands are ordered by all-in equity vs a random hand (CLASS_RANKING). Thresholds are
 * shares of all 1,326 starting hands taken from the profile (VPIP, PFR, 3-bet %) scaled by position.
 * Postflop: hands in the range are ordered by EHS (handStrength.ts). The bot bets / continues with
 * the top of its range; bluffs are chosen among its best drawing hands. Frequencies come from the
 * profile (c-bet %, fold to c-bet %, aggression factor, bluff %), and continuing frequencies facing a
 * bet start from MDF.
 * These are modelling choices (heuristics), shown to the user as such.
 */
import { NUM_COMBOS, HAND_CLASSES, COMBO_CARDS, COMBO_CLASS } from '../combos'
import { CLASS_RANKING } from '../preflop'
import type { Weights } from '../range'
import { potTotal, legalActions, type HandState } from './table'
import type { StrengthTable } from './handStrength'
import { mdf as mdfFormula } from '../formulas'

export interface BotProfileLike {
  id: string
  name: string
  vpip: number
  pfr: number
  threeBet: number
  foldTo3Bet: number
  cbet: number
  foldToCbet: number
  aggression: number
  bluffFreq: number
}

export interface Policy {
  fold: Float64Array
  call: Float64Array
  raise: Float64Array
  /** Street bet level for a raise/bet (chips). */
  raiseTo: number
  /** Range-weighted action frequencies. */
  freq: { fold: number; call: number; raise: number }
  explanation: string[]
  /** 'check' when there is nothing to call. */
  callLabel: 'check' | 'call'
  raiseLabel: 'bet' | 'raise'
}

// ------------------------------------------------------------------------------ preflop ordering
/** Start/end of each class's slice of the equity-vs-random ordering, as shares of 1326 combos. */
const CLASS_SPAN = (() => {
  const start = new Float64Array(169), end = new Float64Array(169)
  let acc = 0
  for (const idx of CLASS_RANKING) {
    start[idx] = acc / NUM_COMBOS
    acc += HAND_CLASSES[idx].combos.length
    end[idx] = acc / NUM_COMBOS
  }
  return { start, end }
})()

/** Membership (0..1) of a combo in the top `width` share of all hands. */
function inTop(combo: number, width: number): number {
  const k = COMBO_CLASS[combo]
  const s = CLASS_SPAN.start[k], e = CLASS_SPAN.end[k]
  if (width >= e) return 1
  if (width <= s) return 0
  return (width - s) / (e - s)
}

/** Strength key for preflop (higher = stronger). */
const preflopKey = (combo: number) => 1 - CLASS_SPAN.start[COMBO_CLASS[combo]]

/**
 * Top `fraction` of a weighted range by `key` (higher first). Hands with equal keys share the
 * boundary proportionally. Returns membership 0..1 per combo.
 */
export function topOfRange(range: Weights, key: (c: number) => number, fraction: number, eligible?: (c: number) => boolean): Float64Array {
  const out = new Float64Array(NUM_COMBOS)
  const items: { c: number; k: number; w: number }[] = []
  let total = 0
  for (let c = 0; c < NUM_COMBOS; c++) {
    if (range[c] <= 0) continue
    total += range[c]
    if (eligible && !eligible(c)) continue
    const k = key(c)
    if (Number.isNaN(k)) continue
    items.push({ c, k, w: range[c] })
  }
  let budget = Math.max(0, Math.min(1, fraction)) * total
  items.sort((a, b) => b.k - a.k)
  let i = 0
  while (i < items.length && budget > 1e-12) {
    let j = i
    let groupW = 0
    while (j < items.length && items[j].k === items[i].k) { groupW += items[j].w; j++ }
    const share = Math.min(1, budget / groupW)
    for (let t = i; t < j; t++) out[items[t].c] = share
    budget -= share * groupW
    i = j
  }
  return out
}

const POSITION_FACTOR: Record<string, number> = {
  UTG: 0.6, 'UTG+1': 0.55, 'UTG+2': 0.6, LJ: 0.7, HJ: 0.8, CO: 1.0, BTN: 1.45, SB: 1.05, BB: 1,
}

function rangeFreq(range: Weights, arr: Float64Array): number {
  let a = 0, t = 0
  for (let c = 0; c < NUM_COMBOS; c++) if (range[c] > 0) { a += range[c] * arr[c]; t += range[c] }
  return t > 0 ? a / t : 0
}

const pctTxt = (x: number) => `${(x * 100).toFixed(0)}%`

function finalize(range: Weights, raise: Float64Array, call: Float64Array, raiseTo: number, explanation: string[], facing: boolean, canRaise: boolean): Policy {
  const fold = new Float64Array(NUM_COMBOS)
  for (let c = 0; c < NUM_COMBOS; c++) {
    if (!canRaise) { call[c] = Math.min(1, call[c] + raise[c]); raise[c] = 0 }
    const r = Math.min(1, raise[c])
    const k = Math.min(1 - r, call[c])
    raise[c] = r
    call[c] = facing ? k : 1 - r // with nothing to call, not betting means checking
    fold[c] = facing ? Math.max(0, 1 - r - k) : 0
  }
  return {
    fold, call, raise, raiseTo, explanation,
    freq: { fold: rangeFreq(range, fold), call: rangeFreq(range, call), raise: rangeFreq(range, raise) },
    callLabel: facing ? 'call' : 'check',
    raiseLabel: facing ? 'raise' : 'bet',
  }
}

// ------------------------------------------------------------------------------ sizing
export interface SizingConfig {
  openSizeBB: number
  threeBetMultiple: number
  betPresets: number[]
  raisePresets: number[]
}

function capRaise(to: number, s: HandState, seat: number): number {
  const x = s.seats[seat]
  const max = x.bet + x.stack
  // Going over ~40 % of the stack commits the bot: shove instead.
  return to >= 0.4 * max ? max : Math.round(to)
}

// ------------------------------------------------------------------------------ policy
export function botPolicy(s: HandState, seat: number, range: Weights, p: BotProfileLike, sizing: SizingConfig, strength: StrengthTable | null): Policy {
  const legal = legalActions({ ...s, toAct: seat })
  const x = s.seats[seat]
  const facing = legal.callAmount > 0
  const bb = s.config.bigBlind
  const pot = potTotal(s)
  const expl: string[] = []

  if (s.street === 'preflop') {
    const raisesSoFar = s.actions.filter((a) => a.street === 'preflop' && a.kind === 'raise').length
    const limpers = s.actions.filter((a) => a.street === 'preflop' && a.kind === 'call').length
    const pos = x.position
    const f = s.seats.length === 2 ? 2.2 : (POSITION_FACTOR[pos] ?? 1)
    const raise = new Float64Array(NUM_COMBOS)
    const call = new Float64Array(NUM_COMBOS)
    let raiseTo = 0

    if (raisesSoFar === 0) {
      if (!facing) {
        // Big blind option (limped pot): raise the top of its range, check the rest.
        const w = (p.pfr / 100) * 0.5
        for (let c = 0; c < NUM_COMBOS; c++) raise[c] = inTop(c, w)
        raiseTo = capRaise(s.currentBet + (sizing.openSizeBB + limpers) * bb, s, seat)
        expl.push(`Limped pot: raises the top ${pctTxt(w)} of all hands, checks the rest.`)
      } else {
        const openW = Math.min(1, (p.pfr / 100) * f)
        const limpW = Math.max(0, (p.vpip - p.pfr) / 100) * f * (limpers > 0 ? 1 : 0.3)
        for (let c = 0; c < NUM_COMBOS; c++) {
          raise[c] = inTop(c, openW)
          call[c] = inTop(c, openW + limpW) - raise[c]
        }
        raiseTo = capRaise((sizing.openSizeBB + limpers) * bb, s, seat)
        expl.push(`Unopened pot from ${pos}: opens the top ${pctTxt(openW)} of hands (PFR ${p.pfr}% × position factor ${f}).`)
        if (limpW > 0) expl.push(`${limpers ? 'Over-limps' : 'Limps'} the next ${pctTxt(limpW)} (VPIP − PFR).`)
      }
    } else if (raisesSoFar === 1 && !s.actions.some((a) => a.seat === seat && a.street === 'preflop' && a.kind === 'raise')) {
      const threeW = (p.threeBet / 100) * (pos === 'BTN' || pos === 'CO' ? 1.1 : 1)
      const callFactor = pos === 'BB' ? 2.2 : pos === 'SB' ? 0.6 : pos === 'BTN' ? 1.3 : 1
      const callW = Math.max(0, (p.vpip - p.pfr) / 100) * callFactor
      for (let c = 0; c < NUM_COMBOS; c++) {
        raise[c] = inTop(c, threeW)
        call[c] = inTop(c, threeW + callW) - raise[c]
      }
      raiseTo = capRaise(s.currentBet * (sizing.threeBetMultiple + (pos === 'SB' || pos === 'BB' ? 0.5 : 0)), s, seat)
      expl.push(`Facing an open: 3-bets the top ${pctTxt(threeW)} of hands, calls the next ${pctTxt(callW)} (VPIP − PFR × ${callFactor} for ${pos}), folds the rest.`)
    } else {
      // Facing a 3-bet or more. Continue with the strongest part of the current range.
      const cont = Math.max(0.02, (1 - p.foldTo3Bet / 100) * (raisesSoFar >= 3 ? 0.6 : 1))
      const cm = topOfRange(range, preflopKey, cont)
      const vr = topOfRange(range, preflopKey, cont * (raisesSoFar >= 3 ? 0.5 : 0.35))
      for (let c = 0; c < NUM_COMBOS; c++) { raise[c] = vr[c]; call[c] = cm[c] - vr[c] }
      raiseTo = capRaise(s.currentBet * 2.3, s, seat)
      expl.push(`Facing a ${raisesSoFar === 2 ? '3-bet' : `${raisesSoFar + 1}-bet`}: continues with the top ${pctTxt(cont)} of its range (fold to 3-bet ${p.foldTo3Bet}%), re-raises the strongest part of that.`)
    }
    return finalize(range, raise, call, raiseTo, expl, facing, legal.canRaise)
  }

  // ---------------------------------------------------------------- postflop
  if (!strength) throw new Error('Postflop policy needs a strength table')
  const ehsKey = (c: number) => strength.ehs[c]
  const opponents = s.seats.filter((y) => y.index !== seat && !y.folded).length
  const multiwayDamp = Math.pow(0.7, Math.max(0, opponents - 1))
  const bluffShare = p.bluffFreq / 100
  const raise = new Float64Array(NUM_COMBOS)
  const call = new Float64Array(NUM_COMBOS)
  const drawKey = (c: number) => strength.ppot[c] * 10 + (1 - strength.hs[c]) * 0.01

  if (!facing) {
    const wasAggressor = s.lastAggressor === seat || (s.street === 'flop' && s.preflopAggressor === seat)
    let betFreq: number
    if (s.street === 'flop' && s.preflopAggressor === seat) {
      betFreq = p.cbet / 100
      expl.push(`C-bet spot: bets ${pctTxt(betFreq)} of its range (c-bet ${p.cbet}%).`)
    } else if (wasAggressor) {
      betFreq = (p.cbet / 100) * 0.75
      expl.push(`Keeps betting as the aggressor ${pctTxt(betFreq)} of the time (c-bet × 0.75).`)
    } else {
      betFreq = Math.min(0.6, Math.max(0.05, 0.12 * p.aggression))
      expl.push(`Checked to: bets ${pctTxt(betFreq)} of its range (0.12 × aggression factor ${p.aggression}).`)
    }
    betFreq *= multiwayDamp
    if (opponents > 1) expl.push(`Multiway (${opponents} opponents): frequency × ${multiwayDamp.toFixed(2)}.`)
    const valueF = betFreq * (1 - bluffShare)
    const value = topOfRange(range, ehsKey, valueF)
    const bluffs = topOfRange(range, drawKey, betFreq * bluffShare, (c) => value[c] < 1)
    for (let c = 0; c < NUM_COMBOS; c++) raise[c] = Math.min(1, value[c] + bluffs[c] * (1 - value[c]))
    expl.push(`Value: top ${pctTxt(valueF)} by hand strength; bluffs: ${pctTxt(betFreq * bluffShare)} chosen among its best draws (bluff ${p.bluffFreq}%).`)
    const target = (s.street === 'flop' ? 0.5 : 0.66) * (p.aggression > 3 ? 1.25 : 1)
    const frac = nearest(sizing.betPresets.map((b) => b / 100), target)
    const raiseTo = capRaise(frac * pot, s, seat)
    expl.push(`Bet size: ${Math.round(frac * 100)}% pot.`)
    return finalize(range, raise, call, raiseTo, expl, false, legal.canRaise)
  }

  // Facing a bet.
  const B = legal.callAmount
  const P0 = pot - B
  const mdfV = mdfFormula.compute({ pot: Math.max(P0, 1), bet: B })
  const lastBet = [...s.actions].reverse().find((a) => a.street === s.street && (a.kind === 'bet' || a.kind === 'raise'))
  const facingCbet = s.street === 'flop' && lastBet?.seat === s.preflopAggressor && s.actions.filter((a) => a.street === 'flop' && (a.kind === 'bet' || a.kind === 'raise')).length === 1
  let cont: number
  if (facingCbet) {
    cont = 1 - p.foldToCbet / 100
    expl.push(`Facing a c-bet: continues with ${pctTxt(cont)} of its range (fold to c-bet ${p.foldToCbet}%).`)
  } else {
    cont = Math.min(0.95, Math.max(0.05, mdfV * (1 - p.foldToCbet / 100) / 0.58))
    expl.push(`Facing a bet of ${(B / Math.max(P0, 1) * 100).toFixed(0)}% pot: MDF ${pctTxt(mdfV)}, adjusted by its folding tendency (fold to c-bet ${p.foldToCbet}%) → continues ${pctTxt(cont)}.`)
  }
  cont *= Math.pow(0.9, Math.max(0, opponents - 1))
  const contM = topOfRange(range, ehsKey, cont)
  const allInCall = B >= x.stack
  const raiseF = allInCall ? 0 : cont * Math.min(0.4, 0.07 * p.aggression)
  const valueR = topOfRange(range, ehsKey, raiseF * (1 - bluffShare))
  const bluffR = topOfRange(range, drawKey, raiseF * bluffShare, (c) => valueR[c] < 1)
  for (let c = 0; c < NUM_COMBOS; c++) {
    raise[c] = Math.min(1, valueR[c] + bluffR[c] * (1 - valueR[c]))
    call[c] = Math.max(0, contM[c] - raise[c])
  }
  if (raiseF > 0) expl.push(`Raises ${pctTxt(raiseF)} of its range (0.07 × aggression ${p.aggression}), mostly value, some draws as bluffs.`)
  const raiseTo = capRaise(s.currentBet * (sizing.raisePresets[0] ?? 3), s, seat)
  return finalize(range, raise, call, raiseTo, expl, true, legal.canRaise)
}

function nearest(options: number[], target: number): number {
  return options.reduce((best, o) => (Math.abs(o - target) < Math.abs(best - target) ? o : best), options[0] ?? target)
}

/** Sample the bot's action for its actual combo. */
export function chooseAction(policy: Policy, combo: number, u: number): 'fold' | 'call' | 'raise' {
  const f = policy.fold[combo], k = policy.call[combo]
  if (u < f) return 'fold'
  if (u < f + k) return 'call'
  return policy.raise[combo] > 0 ? 'raise' : 'call'
}

/** Narrow a range by the action taken: range × P(action | combo). */
export function narrowRange(range: Weights, policy: Policy, action: 'fold' | 'call' | 'raise'): Weights {
  const arr = policy[action]
  const out = new Float64Array(NUM_COMBOS)
  for (let c = 0; c < NUM_COMBOS; c++) out[c] = range[c] * arr[c]
  return out
}

/** Range with combos using the given cards removed. */
export function removeCards(range: Weights, cards: number[]): Weights {
  const out = new Float64Array(range)
  for (let c = 0; c < NUM_COMBOS; c++) {
    const a = COMBO_CARDS[2 * c], b = COMBO_CARDS[2 * c + 1]
    if (cards.includes(a) || cards.includes(b)) out[c] = 0
  }
  return out
}
