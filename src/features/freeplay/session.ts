/**
 * Freeplay session logic (no React). Wraps the table engine with bots, range tracking,
 * decision records for review and a plain-text hand history.
 *
 * Range bookkeeping per bot seat:
 *   actualRanges[i]  the bot model's true range (starts at all 1,326 combos, narrowed by every action
 *                    with P(action | combo), board cards removed each street)
 *   estimates[i]     the hero's own estimate, edited in the range estimator
 */
import { startHand, applyAction, legalActions, potTotal, toBB, toChips, BB, type HandState, type PlayerAction, type Street } from '../../engine/game/table'
import { botPolicy, chooseAction, narrowRange, removeCards, type Policy, type BotProfileLike, type SizingConfig } from '../../engine/game/bots'
import type { StrengthTable } from '../../engine/game/handStrength'
import type { OptionEV } from '../../engine/game/decision'
import { fullRange, type Weights } from '../../engine/range'
import { comboIndex } from '../../engine/combos'
import { formatCard, type Card } from '../../engine/cards'
import { describeScore, evaluate } from '../../engine/evaluator'
import type { Rng } from '../../engine/rng'
import type { FreeplaySettings } from '../../store/settingsSchema'

export interface LogEntry {
  seat: number
  street: Street
  text: string
  /** Bot model frequencies for this decision (range-weighted). */
  freq?: Policy['freq']
  explanation?: string[]
}

export interface DecisionRecord {
  street: Street
  board: Card[]
  potBB: number
  toCallBB: number
  villainSeat: number
  chosen: { kind: PlayerAction['kind']; to?: number }
  chosenLabel: string
  /** Options evaluated against villain's ACTUAL model range and policy. */
  actual: OptionEV[]
  /** Options evaluated against the hero's estimate and the assumed response model. */
  estimate: OptionEV[]
  equityActual: number
  equityEstimate: number
  evLossBB: number
  flagged: boolean
  tags: string[]
  explanation: string
  estimateRange: [number, number][]
  actualRange: [number, number][]
}

export interface Session {
  id: string
  handNo: number
  button: number
  seed: number
  hand: HandState
  profiles: BotProfileLike[]
  actualRanges: Weights[]
  estimates: Weights[]
  log: LogEntry[]
  decisions: DecisionRecord[]
  /** States before each action (for replay / review). */
  snapshots: HandState[]
  /** Ranges at the end of each street, per seat (review). */
  streetRanges: { street: Street; actual: [number, number][][]; estimate: [number, number][][] }[]
  stats: { hands: number; netBB: number; evLossBB: number; decisions: number; mistakes: number }
}

export function sparse(w: Weights): [number, number][] {
  const out: [number, number][] = []
  for (let i = 0; i < w.length; i++) if (w[i] > 1e-9) out.push([i, Number(w[i].toFixed(4))])
  return out
}

export function fromSparse(s: [number, number][]): Weights {
  const w = new Float64Array(1326)
  for (const [i, v] of s) w[i] = v
  return w
}

export function sizingOf(f: FreeplaySettings): SizingConfig {
  return { openSizeBB: f.openSizeBB, threeBetMultiple: f.threeBetMultiple, betPresets: f.betPresets, raisePresets: f.raisePresets }
}

export function seatProfile(f: FreeplaySettings, seat: number): BotProfileLike {
  const id = f.seatProfiles[seat - 1] ?? 'balanced'
  return f.profiles.find((p) => p.id === id) ?? f.profiles[0]
}

export function newSession(f: FreeplaySettings, seed: number, id: string): Session {
  const profiles = Array.from({ length: f.players }, (_, i) => (i === 0 ? f.profiles[0] : seatProfile(f, i)))
  const s: Session = {
    id, handNo: 0, button: f.players - 1, seed, hand: null as unknown as HandState, profiles,
    actualRanges: [], estimates: [], log: [], decisions: [], snapshots: [], streetRanges: [],
    stats: { hands: 0, netBB: 0, evLossBB: 0, decisions: 0, mistakes: 0 },
  }
  return s
}

export function dealNext(prev: Session, f: FreeplaySettings, rng: Rng): Session {
  const n = f.players
  const button = (prev.button + 1) % n
  const seats = Array.from({ length: n }, (_, i) => ({
    name: i === 0 ? 'You' : `${prev.profiles[i]?.name ?? 'Bot'} ${i}`,
    isHero: i === 0,
    profileId: i === 0 ? undefined : prev.profiles[i]?.id,
    stack: toChips(f.stackBB),
  }))
  const hand = startHand({ smallBlind: toChips(f.smallBlind), bigBlind: BB, ante: toChips(f.ante), straddle: f.straddle }, seats, button, rng)
  return {
    ...prev,
    handNo: prev.handNo + 1,
    button,
    hand,
    actualRanges: seats.map(() => fullRange()),
    estimates: seats.map(() => fullRange()),
    log: [],
    decisions: [],
    snapshots: [],
    streetRanges: [],
  }
}

/** Remove board cards from every tracked range (called when a street is dealt). */
function syncBoard(s: Session, prevBoardLen: number): Session {
  if (s.hand.board.length === prevBoardLen) return s
  const street = s.hand.street
  s.streetRanges = [...s.streetRanges, { street: prevStreetOf(street), actual: s.actualRanges.map(sparse), estimate: s.estimates.map(sparse) }]
  return {
    ...s,
    actualRanges: s.actualRanges.map((r) => removeCards(r, s.hand.board)),
    estimates: s.estimates.map((r) => removeCards(r, s.hand.board)),
  }
}

function prevStreetOf(st: Street): Street {
  return st === 'flop' ? 'preflop' : st === 'turn' ? 'flop' : st === 'river' ? 'turn' : 'river'
}

export function describeAction(h: HandState, seat: number, a: PlayerAction): string {
  const x = h.seats[seat]
  const l = legalActions(h)
  // "You call" / "TAG 1 calls"
  const v = (verb: string) => (x.isHero ? verb : verb.replace(/^(\w+)/, (w) => (w.endsWith('s') ? w : `${w}s`)))
  switch (a.kind) {
    case 'fold': return `${x.name} ${v('fold')}`
    case 'check': return `${x.name} ${v('check')}`
    case 'call': return `${x.name} ${v('call')} ${fmt(l.callAmount)}${l.callAmount >= x.stack ? ' (all-in)' : ''}`
    case 'raise': {
      const to = Math.min(Math.max(a.to, l.minRaiseTo), l.maxRaiseTo)
      return `${x.name} ${h.currentBet === 0 ? v('bet') : v('raise to')} ${fmt(to)}${to >= l.maxRaiseTo ? ' (all-in)' : ''}`
    }
  }
}

export const fmt = (chips: number) => `${Number(toBB(chips).toFixed(2))} bb`

/** Let the bot to act make its move. Requires a strength table postflop. */
export function botAct(s: Session, f: FreeplaySettings, rng: Rng, strength: StrengthTable | null): Session {
  const h = s.hand
  const seat = h.toAct!
  const prof = s.profiles[seat]
  const policy = botPolicy(h, seat, s.actualRanges[seat], prof, sizingOf(f), strength)
  const cards = h.seats[seat].cards
  const combo = comboIndex(cards[0], cards[1])
  const choice = chooseAction(policy, combo, rng.next())
  const legal = legalActions(h)
  const action: PlayerAction = choice === 'fold' ? (legal.canCheck ? { kind: 'check' } : { kind: 'fold' })
    : choice === 'call' ? (legal.canCheck ? { kind: 'check' } : { kind: 'call' })
      : { kind: 'raise', to: policy.raiseTo }
  const text = describeAction(h, seat, action)
  const actualRanges = [...s.actualRanges]
  actualRanges[seat] = narrowRange(s.actualRanges[seat], policy, choice === 'fold' && legal.canCheck ? 'call' : choice)
  const next = applyAction(h, action)
  const out: Session = {
    ...s, hand: next, actualRanges, snapshots: [...s.snapshots, h],
    log: [...s.log, { seat, street: h.street, text, freq: policy.freq, explanation: policy.explanation }],
  }
  return finishIfDone(syncBoard(out, h.board.length))
}

/** Apply the hero's action, with an optional decision record prepared by the UI. */
export function heroAct(s: Session, a: PlayerAction, record: DecisionRecord | null): Session {
  const h = s.hand
  const text = describeAction(h, h.toAct!, a)
  const next = applyAction(h, a)
  const decisions = record ? [...s.decisions, record] : s.decisions
  const out: Session = { ...s, hand: next, decisions, snapshots: [...s.snapshots, h], log: [...s.log, { seat: h.toAct!, street: h.street, text }] }
  return finishIfDone(syncBoard(out, h.board.length))
}

function finishIfDone(s: Session): Session {
  if (!s.hand.finished) return s
  const net = toBB(s.hand.net[0])
  const evLoss = s.decisions.reduce((a, d) => a + d.evLossBB, 0)
  const mistakes = s.decisions.filter((d) => d.flagged).length
  return {
    ...s,
    streetRanges: [...s.streetRanges, { street: s.hand.street, actual: s.actualRanges.map(sparse), estimate: s.estimates.map(sparse) }],
    stats: {
      hands: s.stats.hands + 1,
      netBB: s.stats.netBB + net,
      evLossBB: s.stats.evLossBB + evLoss,
      decisions: s.stats.decisions + s.decisions.length,
      mistakes: s.stats.mistakes + mistakes,
    },
  }
}

/** The villain the hero is mainly playing against: the last aggressor, else the next live opponent. */
export function mainVillain(h: HandState): number {
  const hero = 0
  if (h.lastAggressor !== null && h.lastAggressor !== hero && !h.seats[h.lastAggressor].folded) return h.lastAggressor
  const n = h.seats.length
  for (let k = 1; k < n; k++) {
    const i = (hero + k) % n
    if (!h.seats[i].folded) return i
  }
  return 1
}

// ---------------------------------------------------------------------------------------------
// Decision grading and leak tags
// ---------------------------------------------------------------------------------------------
export function gradeDecision(actual: OptionEV[], chosen: { kind: PlayerAction['kind']; to?: number }, street: Street, allIn: boolean, thresholdBB: number) {
  const pick = actual.find((o) => (chosen.kind === 'raise' ? (o.kind === 'bet' || o.kind === 'raise') && o.to === chosen.to : o.kind === chosen.kind))
    ?? (chosen.kind === 'raise' ? nearestRaise(actual, chosen.to ?? 0) : undefined)
  const best = actual.reduce((b, o) => (o.ev > b.ev ? o : b), actual[0])
  const chosenEV = pick?.ev ?? 0
  const loss = Math.max(0, toBB(best.ev - chosenEV))
  // Preflop the one-street model ignores equity realisation, so only all-in preflop spots are graded.
  const gradable = street !== 'preflop' || allIn
  const flagged = gradable && loss > thresholdBB
  const tags: string[] = []
  if (flagged) {
    const k = chosen.kind
    if (k === 'call' && best.kind === 'fold') tags.push(`loose-call-${street}`)
    else if (k === 'fold') tags.push(`overfold-${street}`)
    else if ((k === 'raise') && (best.kind === 'fold' || best.kind === 'check' || best.kind === 'call')) tags.push((pick?.equityWhenCalled ?? 0) < 0.35 ? `bad-bluff-${street}` : `overaggressive-${street}`)
    else if ((k === 'check' || k === 'call') && (best.kind === 'bet' || best.kind === 'raise')) tags.push((best.equityWhenCalled ?? 0) >= 0.5 ? `missed-value-${street}` : `missed-bluff-${street}`)
    else tags.push(`sizing-${street}`)
  }
  return { chosenEV, best, lossBB: gradable ? loss : 0, flagged, tags }
}

function nearestRaise(opts: OptionEV[], to: number): OptionEV | undefined {
  const raises = opts.filter((o) => o.to !== undefined)
  return raises.reduce<OptionEV | undefined>((b, o) => (!b || Math.abs((o.to ?? 0) - to) < Math.abs((b.to ?? 0) - to) ? o : b), undefined)
}

export const LEAK_LABELS: Record<string, string> = {
  'loose-call': 'Calling without the required equity',
  overfold: 'Folding when continuing was better',
  'bad-bluff': 'Bluffing into a range that does not fold enough',
  overaggressive: 'Betting / raising when checking or calling was better',
  'missed-value': 'Missing value bets',
  'missed-bluff': 'Missing profitable bluffs',
  sizing: 'Suboptimal sizing',
}

export function leakLabel(tag: string): string {
  const base = tag.replace(/-(preflop|flop|turn|river)$/, '')
  const street = tag.match(/(preflop|flop|turn|river)$/)?.[1]
  return `${LEAK_LABELS[base] ?? base}${street ? ` (${street})` : ''}`
}

// ---------------------------------------------------------------------------------------------
// Hand history text
// ---------------------------------------------------------------------------------------------
export function handHistoryText(s: Session): string {
  const h = s.hand
  const lines: string[] = []
  const cards = (cs: Card[]) => cs.map(formatCard).join(' ')
  lines.push(`PokerCoach hand #${s.handNo}  (blinds ${toBB(h.config.smallBlind)}/${toBB(h.config.bigBlind)} bb${h.config.ante ? `, ante ${toBB(h.config.ante)} bb` : ''}${h.config.straddle ? ', straddle' : ''})`)
  for (const x of h.seats) lines.push(`Seat ${x.index + 1} (${x.position}): ${x.name}${x.isHero ? ` [${cards(x.cards)}]` : ''} ${fmt(x.startStack)}${x.index === h.button ? ' (button)' : ''}`)
  let street: Street | null = null
  for (const e of s.log) {
    if (e.street !== street) {
      street = e.street
      const shown = street === 'flop' ? h.board.slice(0, 3) : street === 'turn' ? h.board.slice(0, 4) : street === 'river' ? h.board : []
      lines.push(`*** ${street.toUpperCase()} ***${shown.length ? ` [${cards(shown)}]` : ''}`)
    }
    lines.push(e.text)
  }
  if (h.finished) {
    lines.push(`*** RESULT ***${h.board.length ? ` board [${cards(h.board)}]` : ''}`)
    if (h.showdown) for (const x of h.seats.filter((y) => !y.folded)) lines.push(`${x.name} shows [${cards(x.cards)}] (${describeScore(evaluate([...x.cards, ...h.board]))})`)
    for (const p of h.pots) lines.push(`Pot ${fmt(p.amount)} won by ${p.winners.map((w) => h.seats[w].name).join(', ')}`)
    lines.push(`Your result: ${Number(toBB(h.net[0]).toFixed(2))} bb`)
    for (const d of s.decisions.filter((x) => x.flagged)) lines.push(`Review (${d.street}): ${d.chosenLabel}, EV loss ${d.evLossBB.toFixed(2)} bb. ${d.explanation}`)
  }
  return lines.join('\n')
}

export { potTotal, toBB, toChips }
