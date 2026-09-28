/**
 * Hero decision analysis (pure): candidate sizes, EV of each option against a range with a response
 * model, villain response frequencies, range breakdowns, range / nut advantage, model-based ranges.
 */
import { applyAction, legalActions, potTotal, type HandState } from '../../engine/game/table'
import { botPolicy, narrowRange, removeCards, type BotProfileLike, type Policy, type SizingConfig } from '../../engine/game/bots'
import { evaluateOptions, equityVsRange, actionProbability, type OptionEV } from '../../engine/game/decision'
import { classifyHand, GROUP_ORDER, type BreakdownGroup, type StrengthTable } from '../../engine/game/handStrength'
import { COMBO_CARDS, NUM_COMBOS } from '../../engine/combos'
import { fullRange, type Weights } from '../../engine/range'
import { addCard, emptyState, evaluateWith2 } from '../../engine/evaluator'
import type { Card } from '../../engine/cards'
import type { Session } from './session'
import { fmt } from './session'

export interface Candidate { to: number; label: string }

/** Bet / raise sizes the hero can choose (presets, clamped to legal limits, all-in last). */
export function candidateSizes(h: HandState, betPresets: number[], raisePresets: number[], openSizeBB: number, threeBetMultiple: number): Candidate[] {
  const legal = legalActions(h)
  if (!legal.canRaise) return []
  const pot = potTotal(h)
  const bb = h.config.bigBlind
  const hero = h.seats[h.toAct!]
  const out: Candidate[] = []
  const add = (to: number, label: string) => {
    const t = Math.round(Math.min(legal.maxRaiseTo, Math.max(legal.minRaiseTo, to)))
    if (!out.some((c) => c.to === t)) out.push({ to: t, label })
  }
  if (h.street === 'preflop') {
    const raises = h.actions.filter((a) => a.street === 'preflop' && a.kind === 'raise').length
    const limpers = h.actions.filter((a) => a.street === 'preflop' && a.kind === 'call').length
    if (raises === 0) {
      add((openSizeBB + limpers) * bb, `${openSizeBB + limpers} bb`)
      add((openSizeBB + limpers + 1) * bb, `${openSizeBB + limpers + 1} bb`)
    } else {
      add(h.currentBet * threeBetMultiple, `${threeBetMultiple}×`)
      for (const m of raisePresets) add(h.currentBet * m, `${m}×`)
    }
  } else if (h.currentBet === 0) {
    for (const p of betPresets) add((p / 100) * pot, `${p}%`)
  } else {
    for (const m of raisePresets) add(h.currentBet * m, `${m}×`)
  }
  add(hero.bet + hero.stack, 'All-in')
  return out.sort((a, b) => a.to - b.to)
}

/** Villain's response policy if the hero makes this raise (hypothetical state). */
export function responsePolicy(h: HandState, to: number, villain: number, range: Weights, profile: BotProfileLike, sizing: SizingConfig, strength: StrengthTable | null): Policy | null {
  try {
    const after = applyAction(h, { kind: 'raise', to })
    if (after.finished) return null
    const s = { ...after, toAct: villain }
    if (h.street !== 'preflop' && !strength) return null
    return botPolicy(s, villain, range, profile, sizing, strength)
  } catch {
    return null
  }
}

export interface Analysis {
  equity: number
  options: OptionEV[]
  responses: { to: number; label: string; policy: Policy }[]
}

export function analyze(h: HandState, vec: Float64Array, villain: number, range: Weights, profile: BotProfileLike, sizing: SizingConfig, strength: StrengthTable | null, sizes: Candidate[]): Analysis {
  const legal = legalActions(h)
  const hero = h.seats[h.toAct!]
  const responses: Analysis['responses'] = []
  for (const c of sizes) {
    const p = responsePolicy(h, c.to, villain, range, profile, sizing, strength)
    if (p) responses.push({ to: c.to, label: c.label, policy: p })
  }
  const { equity, options } = evaluateOptions({
    vec, range, pot: potTotal(h), toCall: legal.callAmount, heroBet: hero.bet, villainBet: h.seats[villain].bet,
    responses: responses.map((r) => ({ to: r.to, policy: r.policy })), chip: fmt,
  })
  return { equity, options, responses }
}

/** Weighted breakdown of a range by made-hand group on the board (card removal against `dead`). */
export function rangeBreakdown(range: Weights, board: Card[], dead: Card[]): { group: BreakdownGroup; combos: number; share: number }[] {
  const blocked = new Set([...board, ...dead])
  const sums = new Map<BreakdownGroup, number>()
  let total = 0
  for (let c = 0; c < NUM_COMBOS; c++) {
    const w = range[c]
    if (w <= 0) continue
    const a = COMBO_CARDS[2 * c], b = COMBO_CARDS[2 * c + 1]
    if (blocked.has(a) || blocked.has(b)) continue
    const g = board.length >= 3 ? classifyHand([a, b], board).group : 'air'
    sums.set(g, (sums.get(g) ?? 0) + w)
    total += w
  }
  return GROUP_ORDER.map((g) => ({ group: g, combos: sums.get(g) ?? 0, share: total > 0 ? (sums.get(g) ?? 0) / total : 0 }))
}

/**
 * Current-board range advantage: P(hero-range hand beats villain-range hand right now), ties 1/2,
 * over card-disjoint pairs; nut advantage: share of each range in the top groups (two pair or better).
 */
export function rangeAdvantage(heroRange: Weights, villRange: Weights, board: Card[]): { heroWins: number; heroNuts: number; villNuts: number } | null {
  if (board.length < 3) return null
  const blocked = new Set(board)
  const st = emptyState()
  for (const c of board) addCard(st, c)
  const score = new Int32Array(NUM_COMBOS).fill(-1)
  for (let c = 0; c < NUM_COMBOS; c++) {
    const a = COMBO_CARDS[2 * c], b = COMBO_CARDS[2 * c + 1]
    if (!blocked.has(a) && !blocked.has(b) && (heroRange[c] > 0 || villRange[c] > 0)) score[c] = evaluateWith2(st, a, b)
  }
  const hs: number[] = [], vs: number[] = []
  for (let c = 0; c < NUM_COMBOS; c++) if (score[c] >= 0) { if (heroRange[c] > 0) hs.push(c); if (villRange[c] > 0) vs.push(c) }
  let win = 0, tot = 0
  for (const i of hs) {
    const a = COMBO_CARDS[2 * i], b = COMBO_CARDS[2 * i + 1]
    for (const j of vs) {
      const c = COMBO_CARDS[2 * j], d = COMBO_CARDS[2 * j + 1]
      if (a === c || a === d || b === c || b === d) continue
      const w = heroRange[i] * villRange[j]
      win += w * (score[i] > score[j] ? 1 : score[i] === score[j] ? 0.5 : 0)
      tot += w
    }
  }
  const nutShare = (r: Weights, list: number[]) => {
    let n = 0, t = 0
    for (const c of list) {
      const g = classifyHand([COMBO_CARDS[2 * c], COMBO_CARDS[2 * c + 1]], board).group
      if (g === 'nuts' || g === 'sets' || g === 'two-pair') n += r[c]
      t += r[c]
    }
    return t > 0 ? n / t : 0
  }
  return { heroWins: tot > 0 ? win / tot : NaN, heroNuts: nutShare(heroRange, hs), villNuts: nutShare(villRange, vs) }
}

/**
 * Replay a seat's actions this hand with an assumed profile, narrowing from all hands. Used for the
 * estimator's "narrow by action" preset and for the hero's perceived range.
 */
export function modelRange(session: Session, seat: number, profile: BotProfileLike, sizing: SizingConfig, strengthFor: (board: Card[]) => StrengthTable | null, dead: Card[] = []): Weights | null {
  let range = removeCards(fullRange(), dead)
  let boardLen = 0
  const states = [...session.snapshots, session.hand]
  for (let i = 0; i < session.snapshots.length; i++) {
    const st = session.snapshots[i]
    if (st.board.length !== boardLen) { range = removeCards(range, st.board); boardLen = st.board.length }
    if (st.toAct !== seat) continue
    const strength = st.street === 'preflop' ? null : strengthFor(st.board)
    if (st.street !== 'preflop' && !strength) return null
    const policy = botPolicy(st, seat, range, profile, sizing, strength)
    const after = states[i + 1]
    const act = after.actions[after.actions.length - 1]
    const kind = act?.seat === seat ? act.kind : 'check'
    const bucket = kind === 'fold' ? 'fold' : kind === 'bet' || kind === 'raise' ? 'raise' : 'call'
    range = narrowRange(range, policy, bucket)
  }
  if (session.hand.board.length !== boardLen) range = removeCards(range, session.hand.board)
  return range
}

export { equityVsRange, actionProbability }
