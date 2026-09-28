/**
 * No-limit hold'em hand engine (pure, immutable state updates).
 *
 * Chip unit: 1 big blind = 1000 chips (integers avoid floating-point drift; ante 0.125 bb = 125 chips).
 * Rules implemented:
 *   - blinds, per-player antes (dead money), optional UTG straddle (2 bb, acts last preflop)
 *   - heads-up: the button posts the small blind, acts first preflop and last postflop
 *   - min raise = the last full raise size (at least one big blind); all-ins below a full raise do
 *     not reopen the betting for players who already acted
 *   - side pots and split pots at showdown; odd chips go to the first winner left of the button
 *   - hand ends early when all but one player fold; board is run out when betting is closed with all-ins
 */
import { type Card, fullDeck } from '../cards'
import { evaluate } from '../evaluator'
import type { Rng } from '../rng'

export const BB = 1000
export const toBB = (chips: number) => chips / BB
export const toChips = (bb: number) => Math.round(bb * BB)

export type Street = 'preflop' | 'flop' | 'turn' | 'river'
export const STREETS: Street[] = ['preflop', 'flop', 'turn', 'river']

export interface SeatConfig {
  name: string
  isHero: boolean
  profileId?: string
  stack: number
}

export interface GameConfig {
  smallBlind: number
  bigBlind: number
  ante: number
  straddle: boolean
}

export interface Seat {
  index: number
  name: string
  isHero: boolean
  profileId?: string
  position: string
  stack: number
  startStack: number
  cards: Card[]
  folded: boolean
  allIn: boolean
  /** Chips put in on the current street. */
  bet: number
  /** Chips put in during the whole hand (antes included). */
  contributed: number
  /** Has acted since the last full raise on this street. */
  acted: boolean
}

export type ActionKind = 'post-sb' | 'post-bb' | 'post-ante' | 'post-straddle' | 'fold' | 'check' | 'call' | 'bet' | 'raise'

export interface Action {
  seat: number
  street: Street
  kind: ActionKind
  /** Chips added to the pot by this action. */
  added: number
  /** Street bet level of this seat after the action. */
  to: number
  allIn: boolean
  /** Pot (all contributions) before the action. */
  potBefore: number
}

export interface PotResult {
  amount: number
  eligible: number[]
  winners: number[]
}

export interface HandState {
  config: GameConfig
  seats: Seat[]
  button: number
  street: Street
  board: Card[]
  deck: Card[]
  /** Highest street bet level. */
  currentBet: number
  /** Size of the last full raise on this street (min raise increment). */
  lastRaiseSize: number
  toAct: number | null
  actions: Action[]
  preflopAggressor: number | null
  lastAggressor: number | null
  finished: boolean
  /** Filled when finished. */
  pots: PotResult[]
  /** Net result per seat in chips (finished hands). */
  net: number[]
  showdown: boolean
}

export const potTotal = (s: HandState) => s.seats.reduce((a, x) => a + x.contributed, 0)

/** Position labels, clockwise from the button. */
export function positionLabels(n: number): string[] {
  if (n === 2) return ['BTN', 'BB']
  const blinds = ['SB', 'BB']
  const k = n - 2
  const others: Record<number, string[]> = {
    1: ['BTN'], 2: ['CO', 'BTN'], 3: ['HJ', 'CO', 'BTN'], 4: ['UTG', 'HJ', 'CO', 'BTN'],
    5: ['UTG', 'LJ', 'HJ', 'CO', 'BTN'], 6: ['UTG', 'UTG+1', 'LJ', 'HJ', 'CO', 'BTN'],
    7: ['UTG', 'UTG+1', 'UTG+2', 'LJ', 'HJ', 'CO', 'BTN'],
  }
  const o = others[k]
  // index 0 = button, then SB, BB, then the others in order (UTG first)
  return [o[o.length - 1], ...blinds, ...o.slice(0, -1)]
}

const next = (s: HandState, i: number) => (i + 1) % s.seats.length

function clone(s: HandState): HandState {
  return { ...s, seats: s.seats.map((x) => ({ ...x, cards: [...x.cards] })), board: [...s.board], deck: [...s.deck], actions: [...s.actions], pots: [...s.pots], net: [...s.net] }
}

function put(s: HandState, i: number, amount: number, kind: ActionKind): void {
  const seat = s.seats[i]
  const a = Math.min(amount, seat.stack)
  const potBefore = potTotal(s)
  seat.stack -= a
  seat.contributed += a
  if (kind !== 'post-ante') seat.bet += a
  if (seat.stack === 0) seat.allIn = true
  s.actions.push({ seat: i, street: s.street, kind, added: a, to: seat.bet, allIn: seat.allIn, potBefore })
}

/** Players still able to act (not folded, not all-in). */
const canAct = (x: Seat) => !x.folded && !x.allIn
const live = (s: HandState) => s.seats.filter((x) => !x.folded)

export function startHand(config: GameConfig, seatCfg: SeatConfig[], button: number, rng: Rng): HandState {
  const n = seatCfg.length
  if (n < 2 || n > 9) throw new Error('2 to 9 players')
  const labels = positionLabels(n)
  const deck = fullDeck()
  for (let i = deck.length - 1; i > 0; i--) {
    const j = rng.int(i + 1)
    ;[deck[i], deck[j]] = [deck[j], deck[i]]
  }
  const seats: Seat[] = seatCfg.map((c, i) => ({
    index: i, name: c.name, isHero: c.isHero, profileId: c.profileId,
    position: labels[(i - button + n) % n], stack: c.stack, startStack: c.stack,
    cards: [], folded: false, allIn: false, bet: 0, contributed: 0, acted: false,
  }))
  const s: HandState = {
    config, seats, button, street: 'preflop', board: [], deck, currentBet: 0, lastRaiseSize: config.bigBlind,
    toAct: null, actions: [], preflopAggressor: null, lastAggressor: null, finished: false, pots: [], net: seats.map(() => 0), showdown: false,
  }
  // Deal two cards each, starting left of the button.
  for (let r = 0; r < 2; r++) for (let k = 1; k <= n; k++) s.seats[(button + k) % n].cards.push(s.deck.pop()!)
  if (config.ante > 0) for (let i = 0; i < n; i++) put(s, i, config.ante, 'post-ante')
  const sb = n === 2 ? button : (button + 1) % n
  const bb = (sb + 1) % n
  put(s, sb, config.smallBlind, 'post-sb')
  put(s, bb, config.bigBlind, 'post-bb')
  s.currentBet = Math.max(s.seats[sb].bet, s.seats[bb].bet)
  let first = next(s, bb)
  if (config.straddle && n >= 4) {
    const utg = first
    put(s, utg, 2 * config.bigBlind, 'post-straddle')
    s.currentBet = Math.max(s.currentBet, s.seats[utg].bet)
    s.lastRaiseSize = config.bigBlind
    first = next(s, utg)
  }
  s.toAct = findNextToAct(s, (first - 1 + n) % n)
  if (s.toAct === null) return runOut(s)
  return s
}

/** Next seat after `from` that still needs to act, or null if the betting round is closed. */
function findNextToAct(s: HandState, from: number): number | null {
  const n = s.seats.length
  const actors = s.seats.filter(canAct)
  if (live(s).length <= 1) return null
  // Only one player can act and nobody left to call from: closed unless they face a bet.
  for (let k = 1; k <= n; k++) {
    const i = (from + k) % n
    const x = s.seats[i]
    if (!canAct(x)) continue
    if (!x.acted || x.bet < s.currentBet) {
      if (actors.length === 1 && x.bet >= s.currentBet) return null
      return i
    }
  }
  return null
}

export interface Legal {
  canFold: boolean
  canCheck: boolean
  callAmount: number
  canRaise: boolean
  /** Street bet levels ("raise to"). */
  minRaiseTo: number
  maxRaiseTo: number
}

export function legalActions(s: HandState): Legal {
  if (s.toAct === null) throw new Error('No player to act')
  const x = s.seats[s.toAct]
  const toCall = Math.min(s.currentBet - x.bet, x.stack)
  const maxTo = x.bet + x.stack
  const minTo = Math.min(maxTo, s.currentBet + Math.max(s.lastRaiseSize, s.config.bigBlind))
  // A full raise resets everyone's `acted` flag, so a player who already acted and now faces a bet
  // is facing an incomplete all-in raise: they may only call or fold. Raising is also pointless
  // when nobody else can still act.
  const othersCanAct = s.seats.some((y) => y.index !== x.index && canAct(y))
  const canRaise = maxTo > s.currentBet && !x.acted && othersCanAct
  return {
    canFold: toCall > 0,
    canCheck: toCall === 0,
    callAmount: toCall,
    canRaise,
    minRaiseTo: minTo,
    maxRaiseTo: maxTo,
  }
}

export type PlayerAction = { kind: 'fold' } | { kind: 'check' } | { kind: 'call' } | { kind: 'raise'; to: number }

export function applyAction(prev: HandState, a: PlayerAction): HandState {
  if (prev.finished || prev.toAct === null) throw new Error('Hand is not waiting for an action')
  const s = clone(prev)
  const i = s.toAct!
  const x = s.seats[i]
  const legal = legalActions(prev)
  switch (a.kind) {
    case 'fold':
      x.folded = true
      s.actions.push({ seat: i, street: s.street, kind: 'fold', added: 0, to: x.bet, allIn: false, potBefore: potTotal(s) })
      break
    case 'check':
      if (!legal.canCheck) throw new Error('Cannot check facing a bet')
      s.actions.push({ seat: i, street: s.street, kind: 'check', added: 0, to: x.bet, allIn: false, potBefore: potTotal(s) })
      break
    case 'call':
      if (legal.callAmount <= 0) throw new Error('Nothing to call')
      put(s, i, legal.callAmount, 'call')
      break
    case 'raise': {
      if (!legal.canRaise) throw new Error('Raising is not allowed')
      const to = Math.min(Math.max(a.to, legal.minRaiseTo), legal.maxRaiseTo)
      const increment = to - s.currentBet
      put(s, i, to - x.bet, s.currentBet === 0 ? 'bet' : 'raise')
      if (increment >= Math.max(s.lastRaiseSize, s.config.bigBlind)) {
        // Full raise: reopens the action for everyone else.
        s.lastRaiseSize = increment
        for (const y of s.seats) if (y.index !== i) y.acted = false
      }
      s.currentBet = Math.max(s.currentBet, x.bet)
      if (s.street === 'preflop') s.preflopAggressor = i
      s.lastAggressor = i
      break
    }
  }
  x.acted = true
  return advance(s, i)
}

function advance(s: HandState, from: number): HandState {
  if (live(s).length === 1) return finishFold(s)
  const nextSeat = findNextToAct(s, from)
  if (nextSeat !== null) { s.toAct = nextSeat; return s }
  // Betting round closed.
  if (s.street === 'river') return showdown(s)
  if (s.seats.filter(canAct).length <= 1) return runOut(s)
  return nextStreet(s)
}

function dealStreet(s: HandState): void {
  const idx = STREETS.indexOf(s.street)
  s.street = STREETS[idx + 1]
  s.deck.pop() // burn
  const count = s.street === 'flop' ? 3 : 1
  for (let k = 0; k < count; k++) s.board.push(s.deck.pop()!)
}

function nextStreet(s: HandState): HandState {
  dealStreet(s)
  s.currentBet = 0
  s.lastRaiseSize = s.config.bigBlind
  for (const y of s.seats) { y.bet = 0; y.acted = false }
  s.toAct = findNextToAct(s, s.button)
  if (s.toAct === null) return runOut(s)
  return s
}

function runOut(s: HandState): HandState {
  // Return uncalled chips first (one player bet more than anyone could call).
  returnUncalled(s)
  while (s.street !== 'river') dealStreet(s)
  for (const y of s.seats) y.bet = 0
  return showdown(s)
}

function returnUncalled(s: HandState): void {
  const contribs = s.seats.map((x) => x.contributed).sort((a, b) => b - a)
  const top = contribs[0], second = contribs[1] ?? 0
  if (top > second) {
    const x = s.seats.find((y) => y.contributed === top)!
    const back = top - second
    x.contributed -= back
    x.stack += back
    if (x.stack > 0) x.allIn = false
  }
}

function finishFold(s: HandState): HandState {
  returnUncalled(s)
  const winner = live(s)[0].index
  const total = potTotal(s)
  s.pots = [{ amount: total, eligible: [winner], winners: [winner] }]
  s.seats[winner].stack += total
  return finish(s, false)
}

function showdown(s: HandState): HandState {
  returnUncalled(s)
  const n = s.seats.length
  const scores = s.seats.map((x) => (x.folded ? -1 : evaluate([...x.cards, ...s.board])))
  // Side pots by contribution levels.
  const levels = [...new Set(s.seats.map((x) => x.contributed).filter((c) => c > 0))].sort((a, b) => a - b)
  let prevLevel = 0
  const pots: PotResult[] = []
  for (const level of levels) {
    const amount = s.seats.reduce((sum, x) => sum + Math.max(0, Math.min(x.contributed, level) - prevLevel), 0)
    const eligible = s.seats.filter((x) => !x.folded && x.contributed >= level).map((x) => x.index)
    prevLevel = level
    if (amount === 0) continue
    if (eligible.length === 0) {
      // Only folded players reached this level (cannot happen after returning uncalled chips); give to last pot
      pots[pots.length - 1].amount += amount
      continue
    }
    const best = Math.max(...eligible.map((i) => scores[i]))
    const winners = eligible.filter((i) => scores[i] === best)
    const last = pots[pots.length - 1]
    if (last && last.eligible.join() === eligible.join()) last.amount += amount
    else pots.push({ amount, eligible, winners })
  }
  for (const p of pots) {
    const share = Math.floor(p.amount / p.winners.length)
    let odd = p.amount - share * p.winners.length
    // Odd chips: first winner clockwise from the button.
    const ordered = [...p.winners].sort((a, b) => ((a - s.button - 1 + n) % n) - ((b - s.button - 1 + n) % n))
    for (const w of ordered) {
      s.seats[w].stack += share + (odd > 0 ? 1 : 0)
      if (odd > 0) odd--
    }
  }
  s.pots = pots
  return finish(s, true)
}

function finish(s: HandState, wasShowdown: boolean): HandState {
  s.finished = true
  s.toAct = null
  s.showdown = wasShowdown && live(s).length > 1
  s.net = s.seats.map((x) => x.stack - x.startStack)
  return s
}

/** Amount (chips) the seat to act must call, the pot, etc. Convenience for UIs and bots. */
export function decisionContext(s: HandState) {
  const i = s.toAct!
  const x = s.seats[i]
  const legal = legalActions(s)
  const pot = potTotal(s)
  const opponents = s.seats.filter((y) => y.index !== i && !y.folded)
  const effectiveStack = Math.min(x.stack + x.bet, Math.max(...opponents.map((y) => y.stack + y.bet)))
  return { seat: i, legal, pot, toCall: legal.callAmount, effectiveStack, opponents }
}
