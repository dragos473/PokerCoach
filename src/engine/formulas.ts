/**
 * All poker maths formulas in one place.
 *
 * Each formula is a `FormulaDef` with:
 *   - `expression`: the formula written out (shown in "show the math" tooltips),
 *   - `variables`:  what each symbol means (and the convention used),
 *   - `kind`:       'math'      exact identity/probability, no assumptions,
 *                   'model'     exact *given the stated assumptions* (e.g. villain never raises),
 *                   'heuristic' a rule of thumb / approximation, labelled as such in the UI,
 *   - `compute()`:  the number,
 *   - `explain()`:  the same number with the inputs substituted, step by step.
 *
 * Conventions (important, and repeated in the variable descriptions):
 *   pot  = chips already in the middle *including* any bet you are facing, *excluding* your call.
 *   call = chips you must add to call.
 *   bet  = size of a bet (chips added by the bettor on this action).
 *   EVs are measured relative to folding now (money already in the pot is sunk), so EV(fold) = 0.
 *   All probabilities/equities are fractions 0..1; the UI converts to %.
 */

export type FormulaKind = 'math' | 'model' | 'heuristic'

export interface Explanation {
  id: string
  name: string
  value: number
  expression: string
  /** Formula with the inputs substituted, then intermediate results. */
  steps: string[]
  kind: FormulaKind
  assumptions: string[]
}

export interface FormulaDef<I extends Record<string, number>> {
  id: string
  name: string
  expression: string
  description: string
  variables: Record<keyof I & string, string>
  kind: FormulaKind
  assumptions: string[]
  compute: (input: I) => number
  explain: (input: I) => Explanation
}

/** Format a number for explanations: up to 4 significant decimals, no trailing zeros. */
export function fmt(x: number, decimals = 4): string {
  if (!Number.isFinite(x)) return x > 0 ? '∞' : x < 0 ? '-∞' : 'undefined'
  return String(Number(x.toFixed(decimals)))
}
export function pct(x: number, decimals = 2): string {
  return `${fmt(x * 100, decimals)}%`
}

function defineFormula<I extends Record<string, number>>(def: {
  id: string
  name: string
  expression: string
  description: string
  variables: Record<keyof I & string, string>
  kind: FormulaKind
  assumptions?: string[]
  compute: (input: I) => number
  /** Lines shown after the expression, given the inputs and the result. */
  steps: (input: I, value: number) => string[]
}): FormulaDef<I> {
  const assumptions = def.assumptions ?? []
  return {
    ...def,
    assumptions,
    explain: (input: I) => {
      const value = def.compute(input)
      return {
        id: def.id,
        name: def.name,
        value,
        expression: def.expression,
        steps: def.steps(input, value),
        kind: def.kind,
        assumptions,
      }
    },
  }
}

// ---------------------------------------------------------------------------------------------
// Combinatorics
// ---------------------------------------------------------------------------------------------
/** Binomial coefficient C(n, k) = n! / (k! (n-k)!), computed multiplicatively (exact for our sizes). */
export function binomial(n: number, k: number): number {
  if (k < 0 || k > n) return 0
  k = Math.min(k, n - k)
  let r = 1
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i
  return Math.round(r)
}

export const pairCombos = defineFormula<{ cardsLeft: number }>({
  id: 'pairCombos',
  name: 'Pocket pair combos',
  expression: 'combos = C(n, 2) = n·(n − 1) / 2',
  description: 'Number of ways to hold a specific pocket pair when n cards of that rank are unseen (n = 4 with no removal → 6).',
  variables: { cardsLeft: 'n: cards of that rank not visible to you (0..4)' },
  kind: 'math',
  compute: ({ cardsLeft }) => binomial(cardsLeft, 2),
  steps: ({ cardsLeft }, v) => [`C(${cardsLeft}, 2) = ${cardsLeft}·${cardsLeft - 1} / 2 = ${v}`],
})

export const unpairedCombos = defineFormula<{ highLeft: number; lowLeft: number; suitedPairsLeft: number }>({
  id: 'unpairedCombos',
  name: 'Unpaired hand combos',
  expression: 'total = a · b;  suited = s;  offsuit = a · b − s',
  description: 'For a hand like AK: a = unseen aces, b = unseen kings, s = suits in which both cards are still unseen. With no removal: 4·4 = 16 (4 suited, 12 offsuit).',
  variables: {
    highLeft: 'a: unseen cards of the higher rank',
    lowLeft: 'b: unseen cards of the lower rank',
    suitedPairsLeft: 's: suits where both ranks are still unseen',
  },
  kind: 'math',
  compute: ({ highLeft, lowLeft }) => highLeft * lowLeft,
  steps: ({ highLeft, lowLeft, suitedPairsLeft }, v) => [
    `total = ${highLeft} · ${lowLeft} = ${v}`,
    `suited = ${suitedPairsLeft}, offsuit = ${v} − ${suitedPairsLeft} = ${v - suitedPairsLeft}`,
  ],
})

export const totalStartingHands = defineFormula<{ deck: number }>({
  id: 'totalStartingHands',
  name: 'Total starting hands',
  expression: 'C(52, 2) = 52·51 / 2 = 1326',
  description: 'Number of distinct two-card starting hands.',
  variables: { deck: 'cards in the deck (52)' },
  kind: 'math',
  compute: ({ deck }) => binomial(deck, 2),
  steps: ({ deck }, v) => [`C(${deck}, 2) = ${deck}·${deck - 1} / 2 = ${v}`],
})

// ---------------------------------------------------------------------------------------------
// Pot odds, required equity, EV
// ---------------------------------------------------------------------------------------------
export const potOddsRatio = defineFormula<{ pot: number; call: number }>({
  id: 'potOddsRatio',
  name: 'Pot odds (ratio)',
  expression: 'pot odds = pot : call  →  (pot / call) : 1',
  description: 'How much you win (the pot, including the bet you face) for each chip you call.',
  variables: { pot: 'pot including the bet you face, excluding your call', call: 'amount you must call' },
  kind: 'math',
  compute: ({ pot, call }) => pot / call,
  steps: ({ pot, call }, v) => [`${fmt(pot)} : ${fmt(call)} = ${fmt(v, 2)} : 1`],
})

export const requiredEquity = defineFormula<{ pot: number; call: number }>({
  id: 'requiredEquity',
  name: 'Required equity to call',
  expression: 'required equity = call / (pot + call)',
  description: 'Break-even share of the final pot. A call is +EV at showdown when your equity exceeds this (ignores future betting).',
  variables: { pot: 'pot including the bet you face, excluding your call', call: 'amount you must call' },
  kind: 'math',
  compute: ({ pot, call }) => call / (pot + call),
  steps: ({ pot, call }, v) => [
    `${fmt(call)} / (${fmt(pot)} + ${fmt(call)}) = ${fmt(call)} / ${fmt(pot + call)} = ${pct(v)}`,
  ],
})

export const evCall = defineFormula<{ pot: number; call: number; equity: number }>({
  id: 'evCall',
  name: 'EV of calling',
  expression: 'EV(call) = equity · (pot + call) − call',
  description: 'Expected chips gained by calling compared with folding, when the hand goes to showdown with no further betting.',
  variables: {
    pot: 'pot including the bet you face, excluding your call',
    call: 'amount you must call',
    equity: 'your share of the pot at showdown (0..1)',
  },
  kind: 'model',
  assumptions: ['No further betting after the call (or all-in).', 'Equity is your showdown pot share against the opponent range.'],
  compute: ({ pot, call, equity }) => equity * (pot + call) - call,
  steps: ({ pot, call, equity }, v) => [
    `${fmt(equity)} · (${fmt(pot)} + ${fmt(call)}) − ${fmt(call)}`,
    `= ${fmt(equity * (pot + call))} − ${fmt(call)} = ${fmt(v, 2)}`,
  ],
})

export const evFold = defineFormula<Record<string, never>>({
  id: 'evFold',
  name: 'EV of folding',
  expression: 'EV(fold) = 0',
  description: 'Folding is the reference point: chips already in the pot are sunk and no longer yours.',
  variables: {} as Record<never, string>,
  kind: 'math',
  compute: () => 0,
  steps: () => ['Reference point: 0'],
})

export const evBet = defineFormula<{ pot: number; risk: number; villainCall: number; foldProb: number; equityWhenCalled: number }>({
  id: 'evBet',
  name: 'EV of betting / raising',
  expression: 'EV = f · pot + (1 − f) · [ eq · (pot + risk + villainCall) − risk ]',
  description: 'Villain folds with probability f (you win the pot now) or calls (you realise your equity in the bigger pot).',
  variables: {
    pot: 'pot before your bet (including any bet you are raising)',
    risk: 'chips you add with this bet/raise',
    villainCall: 'chips villain must add to call it (= risk for a bet; for a raise, raise-to minus villain’s bet)',
    foldProb: 'f: probability villain folds (0..1)',
    equityWhenCalled: 'eq: your showdown equity against villain’s calling range',
  },
  kind: 'model',
  assumptions: [
    'Villain only folds or calls (never re-raises).',
    'No further betting after a call (or all-in).',
    'Equity when called is measured against the calling part of villain’s range.',
  ],
  compute: ({ pot, risk, villainCall, foldProb, equityWhenCalled }) =>
    foldProb * pot + (1 - foldProb) * (equityWhenCalled * (pot + risk + villainCall) - risk),
  steps: ({ pot, risk, villainCall, foldProb, equityWhenCalled }, v) => {
    const whenCalled = equityWhenCalled * (pot + risk + villainCall) - risk
    return [
      `fold part: ${fmt(foldProb)} · ${fmt(pot)} = ${fmt(foldProb * pot, 2)}`,
      `when called: ${fmt(equityWhenCalled)} · (${fmt(pot)} + ${fmt(risk)} + ${fmt(villainCall)}) − ${fmt(risk)} = ${fmt(whenCalled, 2)}`,
      `call part: ${fmt(1 - foldProb)} · ${fmt(whenCalled, 2)} = ${fmt((1 - foldProb) * whenCalled, 2)}`,
      `EV = ${fmt(v, 2)}`,
    ]
  },
})

export const foldEquityValue = defineFormula<{ pot: number; foldProb: number }>({
  id: 'foldEquityValue',
  name: 'Fold equity (chips)',
  expression: 'fold equity = f · pot',
  description: 'The part of a bet’s EV that comes from villain folding: you win the current pot without showdown.',
  variables: { pot: 'pot before your bet', foldProb: 'f: probability villain folds' },
  kind: 'math',
  compute: ({ pot, foldProb }) => foldProb * pot,
  steps: ({ pot, foldProb }, v) => [`${fmt(foldProb)} · ${fmt(pot)} = ${fmt(v, 2)}`],
})

export const breakEvenFold = defineFormula<{ pot: number; risk: number }>({
  id: 'breakEvenFold',
  name: 'Break-even fold % (pure bluff)',
  expression: 'break-even fold % = risk / (pot + risk)',
  description: 'How often a bet with zero equity must work to break even.',
  variables: { pot: 'pot before your bet', risk: 'chips you risk with the bet' },
  kind: 'math',
  assumptions: ['Zero equity when called (pure bluff).'],
  compute: ({ pot, risk }) => risk / (pot + risk),
  steps: ({ pot, risk }, v) => [`${fmt(risk)} / (${fmt(pot)} + ${fmt(risk)}) = ${pct(v)}`],
})

export const breakEvenFoldWithEquity = defineFormula<{ pot: number; risk: number; villainCall: number; equityWhenCalled: number }>({
  id: 'breakEvenFoldWithEquity',
  name: 'Break-even fold % (semi-bluff)',
  expression: 'X = eq·(pot + risk + villainCall) − risk;  f* = max(0, −X / (pot − X))',
  description: 'Fold frequency at which EV(bet) = 0 when you still have equity when called. If X ≥ 0 the bet is profitable even if villain never folds.',
  variables: {
    pot: 'pot before your bet',
    risk: 'chips you add',
    villainCall: 'chips villain adds to call',
    equityWhenCalled: 'eq: equity against the calling range',
  },
  kind: 'model',
  assumptions: ['Villain only folds or calls.', 'No further betting after a call.'],
  compute: ({ pot, risk, villainCall, equityWhenCalled }) => {
    const x = equityWhenCalled * (pot + risk + villainCall) - risk
    return x >= 0 ? 0 : -x / (pot - x)
  },
  steps: ({ pot, risk, villainCall, equityWhenCalled }, v) => {
    const x = equityWhenCalled * (pot + risk + villainCall) - risk
    return [
      `X = ${fmt(equityWhenCalled)} · ${fmt(pot + risk + villainCall)} − ${fmt(risk)} = ${fmt(x, 2)}`,
      x >= 0 ? 'X ≥ 0, so the bet is +EV even when always called: f* = 0' : `f* = ${fmt(-x, 2)} / (${fmt(pot)} + ${fmt(-x, 2)}) = ${pct(v)}`,
    ]
  },
})

// ---------------------------------------------------------------------------------------------
// Defence frequencies (toy-game results, not full-game solutions)
// ---------------------------------------------------------------------------------------------
export const mdf = defineFormula<{ pot: number; bet: number }>({
  id: 'mdf',
  name: 'Minimum defence frequency',
  expression: 'MDF = pot / (pot + bet)',
  description: 'The share of your range you must continue with so that a pure bluff of this size does not profit automatically.',
  variables: { pot: 'pot before the bet', bet: 'bet size you are facing' },
  kind: 'model',
  assumptions: [
    'Derived from making villain’s zero-equity bluffs break even (MDF = 1 − alpha).',
    'A defence guideline, not a law: real ranges have equity, card removal and future streets.',
  ],
  compute: ({ pot, bet }) => pot / (pot + bet),
  steps: ({ pot, bet }, v) => [`${fmt(pot)} / (${fmt(pot)} + ${fmt(bet)}) = ${pct(v)}`],
})

export const alpha = defineFormula<{ pot: number; bet: number }>({
  id: 'alpha',
  name: 'Alpha (bluff break-even)',
  expression: 'alpha = bet / (pot + bet)',
  description: 'How often a zero-equity bluff must make villain fold to break even. MDF = 1 − alpha.',
  variables: { pot: 'pot before the bet', bet: 'bet size' },
  kind: 'math',
  compute: ({ pot, bet }) => bet / (pot + bet),
  steps: ({ pot, bet }, v) => [`${fmt(bet)} / (${fmt(pot)} + ${fmt(bet)}) = ${pct(v)}`],
})

export const bluffFraction = defineFormula<{ pot: number; bet: number }>({
  id: 'bluffFraction',
  name: 'Balanced bluff share (polarized river)',
  expression: 'bluffs / (value + bluffs) = bet / (pot + 2·bet)',
  description: 'In the polarized river toy game, betting this share of bluffs makes villain’s bluff-catchers indifferent (the pot odds villain gets).',
  variables: { pot: 'pot before the bet', bet: 'bet size' },
  kind: 'model',
  assumptions: ['River, bettor is perfectly polarized (nuts or air), caller holds only bluff-catchers.'],
  compute: ({ pot, bet }) => bet / (pot + 2 * bet),
  steps: ({ pot, bet }, v) => [`${fmt(bet)} / (${fmt(pot)} + 2·${fmt(bet)}) = ${pct(v)}`],
})

export const spr = defineFormula<{ effectiveStack: number; pot: number }>({
  id: 'spr',
  name: 'Stack-to-pot ratio',
  expression: 'SPR = effective stack / pot',
  description: 'Usually measured at the start of the flop. Low SPR means fewer bets are needed to get all-in.',
  variables: { effectiveStack: 'smaller of the involved stacks (after preflop action)', pot: 'pot at the start of the street' },
  kind: 'math',
  compute: ({ effectiveStack, pot }) => effectiveStack / pot,
  steps: ({ effectiveStack, pot }, v) => [`${fmt(effectiveStack)} / ${fmt(pot)} = ${fmt(v, 2)}`],
})

// ---------------------------------------------------------------------------------------------
// Outs and drawing probabilities
// ---------------------------------------------------------------------------------------------
export const hitNextCard = defineFormula<{ outs: number; unseen: number }>({
  id: 'hitNextCard',
  name: 'Probability to hit on the next card',
  expression: 'P = outs / unseen',
  description: 'Exact probability that the next card is one of your outs. Unseen = 52 − your cards − board (47 on the flop, 46 on the turn). Opponents’ cards count as unseen.',
  variables: { outs: 'cards that improve you to the winning hand', unseen: 'cards you have not seen' },
  kind: 'math',
  compute: ({ outs, unseen }) => outs / unseen,
  steps: ({ outs, unseen }, v) => [`${outs} / ${unseen} = ${pct(v)}`],
})

export const hitByRiver = defineFormula<{ outs: number; unseen: number }>({
  id: 'hitByRiver',
  name: 'Probability to hit on turn or river',
  expression: 'P = 1 − C(unseen − outs, 2) / C(unseen, 2)',
  description: 'Exact probability that at least one of the next two cards is an out (seeing both cards, e.g. all-in on the flop).',
  variables: { outs: 'outs', unseen: 'unseen cards on the flop (usually 47)' },
  kind: 'math',
  compute: ({ outs, unseen }) => 1 - binomial(unseen - outs, 2) / binomial(unseen, 2),
  steps: ({ outs, unseen }, v) => [
    `C(${unseen - outs}, 2) = ${binomial(unseen - outs, 2)},  C(${unseen}, 2) = ${binomial(unseen, 2)}`,
    `1 − ${binomial(unseen - outs, 2)} / ${binomial(unseen, 2)} = ${pct(v)}`,
  ],
})

export const ruleOf2 = defineFormula<{ outs: number }>({
  id: 'ruleOf2',
  name: 'Rule of 2 (approximation)',
  expression: 'P ≈ outs · 2 %',
  description: 'Quick estimate for one card to come. Compare with the exact outs / unseen.',
  variables: { outs: 'outs' },
  kind: 'heuristic',
  assumptions: ['Approximation: 1/46 ≈ 2.17 %, so it slightly underestimates.'],
  compute: ({ outs }) => (outs * 2) / 100,
  steps: ({ outs }, v) => [`${outs} · 2 % = ${pct(v)}`],
})

export const ruleOf4 = defineFormula<{ outs: number }>({
  id: 'ruleOf4',
  name: 'Rule of 4 (approximation)',
  expression: 'P ≈ outs · 4 %',
  description: 'Quick estimate for two cards to come (flop to river, seeing both). Overestimates with many outs.',
  variables: { outs: 'outs' },
  kind: 'heuristic',
  assumptions: ['Approximation; above ~8 outs a common correction is outs·4 − (outs − 8).'],
  compute: ({ outs }) => (outs * 4) / 100,
  steps: ({ outs }, v) => [`${outs} · 4 % = ${pct(v)}`],
})

// ---------------------------------------------------------------------------------------------
// Implied odds
// ---------------------------------------------------------------------------------------------
export const impliedOddsNeeded = defineFormula<{ pot: number; call: number; hitProb: number }>({
  id: 'impliedOddsNeeded',
  name: 'Implied odds needed',
  expression: 'W = call / P(hit) − (pot + call)',
  description: 'Extra chips you must win on later streets, when you hit, for the call to break even. Solves P(hit)·(pot + call + W) − call = 0.',
  variables: {
    pot: 'pot including the bet you face',
    call: 'amount to call',
    hitProb: 'P(hit): probability of making your hand (assumed to win when it hits)',
  },
  kind: 'model',
  assumptions: ['You win whenever you hit and lose only the call when you miss (you fold later).'],
  compute: ({ pot, call, hitProb }) => Math.max(0, call / hitProb - (pot + call)),
  steps: ({ pot, call, hitProb }, v) => [
    `${fmt(call)} / ${fmt(hitProb)} − (${fmt(pot)} + ${fmt(call)}) = ${fmt(call / hitProb, 2)} − ${fmt(pot + call)}`,
    `= ${fmt(v, 2)}${v === 0 ? ' (direct pot odds already suffice)' : ''}`,
  ],
})

export const evWithImpliedOdds = defineFormula<{
  pot: number; call: number; pHitWin: number; pHitLose: number; impliedWin: number; reverseImpliedLoss: number
}>({
  id: 'evWithImpliedOdds',
  name: 'EV with implied / reverse implied odds',
  expression: 'EV = pWin·(pot + W) − (1 − pWin)·call − pLose·L',
  description: 'Calling with a draw: when you hit and win you collect the pot plus W future chips; when you miss you lose the call; when you hit but still lose (dirty outs) you lose the call plus L more.',
  variables: {
    pot: 'pot including the bet you face',
    call: 'amount to call',
    pHitWin: 'pWin: probability you hit and win',
    pHitLose: 'pLose: probability you hit but lose (reverse implied odds)',
    impliedWin: 'W: extra chips won later when you hit and win',
    reverseImpliedLoss: 'L: extra chips lost later when you hit and lose',
  },
  kind: 'model',
  assumptions: ['When you miss you fold to further action and lose only the call.'],
  compute: ({ pot, call, pHitWin, pHitLose, impliedWin, reverseImpliedLoss }) =>
    pHitWin * (pot + impliedWin) - (1 - pHitWin) * call - pHitLose * reverseImpliedLoss,
  steps: ({ pot, call, pHitWin, pHitLose, impliedWin, reverseImpliedLoss }, v) => [
    `${fmt(pHitWin)}·(${fmt(pot)} + ${fmt(impliedWin)}) − ${fmt(1 - pHitWin)}·${fmt(call)} − ${fmt(pHitLose)}·${fmt(reverseImpliedLoss)}`,
    `= ${fmt(v, 2)}`,
  ],
})

/** Registry for the UI ("show the math" tooltips, formula reference page). */
export const FORMULAS = {
  pairCombos, unpairedCombos, totalStartingHands,
  potOddsRatio, requiredEquity, evCall, evFold, evBet, foldEquityValue, breakEvenFold, breakEvenFoldWithEquity,
  mdf, alpha, bluffFraction, spr,
  hitNextCard, hitByRiver, ruleOf2, ruleOf4,
  impliedOddsNeeded, evWithImpliedOdds,
} as const
export type FormulaId = keyof typeof FORMULAS
