/**
 * Quiz question generation. Two steps:
 *   generateParams(topic, difficulty, rng)  – random, returns plain JSON params
 *   buildQuestion(topic, params)            – deterministic: every answer computed by the engine
 * Params are stored for spaced repetition so a missed question can be asked again exactly.
 */
import { type Card, formatCard, parseCards, fullDeck } from '../../../engine/cards'
import type { Rng } from '../../../engine/rng'
import {
  potOddsRatio, requiredEquity, mdf, alpha, breakEvenFold, spr, evCall, pairCombos, unpairedCombos,
  hitNextCard, hitByRiver, ruleOf2, ruleOf4, fmt, pct, type Explanation,
} from '../../../engine/formulas'
import { comboCount, parseRange } from '../../../engine/range'
import { analyzeOuts } from '../../../engine/outs'
import { exactEquity, handPlayer } from '../../../engine/equity'
import { evaluate, describeScore } from '../../../engine/evaluator'
import { handClassByLabel, HAND_CLASSES, comboIndex } from '../../../engine/combos'
import { classVsClass, MATRIX_INFO } from '../../../engine/preflop'
import type { QuizTopic } from '../../../store/settingsSchema'

export type Difficulty = 'easy' | 'medium' | 'hard'

export type NumericUnit = 'percent' | 'ratio' | 'count' | 'number'
export interface NumericAnswer { kind: 'numeric'; value: number; unit: NumericUnit }
export interface ChoiceAnswer { kind: 'choice'; options: string[]; correct: number }

export interface QuizQuestion {
  key: string
  topic: QuizTopic
  params: QuizParams
  prompt: string
  hero?: Card[]
  villain?: Card[]
  board?: Card[]
  dead?: Card[]
  answer: NumericAnswer | ChoiceAnswer
  explanations: Explanation[]
  notes: string[]
}

export type QuizParams = Record<string, number | string | boolean | string[]>

// ---------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------
const pick = <T,>(rng: Rng, arr: readonly T[]): T => arr[rng.int(arr.length)]

function dealCards(rng: Rng, n: number, exclude: Card[] = []): Card[] {
  const deck = fullDeck().filter((c) => !exclude.includes(c))
  for (let i = 0; i < n; i++) {
    const j = i + rng.int(deck.length - i)
    ;[deck[i], deck[j]] = [deck[j], deck[i]]
  }
  return deck.slice(0, n)
}

const cardsText = (cs: Card[]) => cs.map(formatCard).join(' ')
const toCards = (s: string) => (s ? parseCards(s) : [])

/** Pot and bet sizes by difficulty (in bb). */
function potAndBet(rng: Rng, d: Difficulty): { pot: number; bet: number } {
  if (d === 'easy') {
    const pot = pick(rng, [4, 6, 8, 10, 12, 20])
    const frac = pick(rng, [0.25, 0.5, 0.75, 1])
    return { pot, bet: Math.round(pot * frac * 2) / 2 }
  }
  if (d === 'medium') {
    const pot = pick(rng, [5, 7.5, 9, 13, 16, 22, 30, 45])
    const frac = pick(rng, [0.25, 0.33, 0.5, 0.66, 0.75, 1, 1.5])
    return { pot, bet: Math.max(1, Math.round(pot * frac * 2) / 2) }
  }
  const pot = Math.round((5 + rng.next() * 120) * 2) / 2
  const frac = 0.2 + rng.next() * 1.8
  return { pot, bet: Math.max(1, Math.round(pot * frac * 2) / 2) }
}

// ---------------------------------------------------------------------------------------------
// Param generation
// ---------------------------------------------------------------------------------------------
export function generateParams(topic: QuizTopic, d: Difficulty, rng: Rng): QuizParams {
  switch (topic) {
    case 'pot-odds':
    case 'required-equity':
    case 'mdf':
    case 'break-even-fold': {
      const { pot, bet } = potAndBet(rng, d)
      // Hard: one player already called the bet in front of you.
      const callers = d === 'hard' && topic !== 'mdf' && topic !== 'break-even-fold' && rng.next() < 0.5 ? 1 : 0
      const variant = topic === 'mdf' && d !== 'easy' && rng.next() < 0.4 ? 'alpha' : 'mdf'
      return { pot, bet, callers, variant }
    }
    case 'spr': {
      const pot = d === 'easy' ? pick(rng, [5, 6, 10, 20]) : Math.round((4 + rng.next() * 40) * 2) / 2
      const stack = d === 'easy' ? pot * pick(rng, [2, 4, 5, 10]) : Math.round((pot * (1 + rng.next() * 15)) * 2) / 2
      return { pot, stack }
    }
    case 'combos':
    case 'blockers': {
      const classes = d === 'easy' ? ['AA', 'KK', 'AKs', 'AKo', 'AK', 'QJs', 'T9o', '77'] : HAND_CLASSES.map((c) => c.label).concat(['AK', 'KQ', 'AQ'])
      const target = topic === 'combos' && d === 'hard' ? pick(rng, ['TT+, AK', 'QQ+, AKs', 'JJ+, AQ+', '99-77, AJs+', 'KK+, AK, AQs']) : pick(rng, classes)
      // Visible cards: your hand (blockers) or the board (combos, medium/hard), biased toward the
      // target's ranks so card removal actually matters.
      const ranks = new Set(target.replace(/[^AKQJT2-9]/g, '').split('').map((ch) => '23456789TJQKA'.indexOf(ch)))
      const count = topic === 'blockers' ? 2 : d === 'easy' ? 0 : d === 'medium' ? 1 : 3
      const dead: Card[] = []
      while (dead.length < count) {
        const pool = fullDeck().filter((c) => !dead.includes(c) && (rng.next() < 0.6 ? ranks.has(c >> 2) : true))
        dead.push(pick(rng, pool))
      }
      return { target, dead: cardsText(dead) }
    }
    case 'outs':
    case 'equity-estimate':
    case 'call-or-fold': {
      if (topic === 'equity-estimate' && d === 'hard' && rng.next() < 0.5) {
        const a = pick(rng, HAND_CLASSES).label
        let b = pick(rng, HAND_CLASSES).label
        while (b === a) b = pick(rng, HAND_CLASSES).label
        return { preflop: true, a, b }
      }
      const street = topic === 'equity-estimate' && d === 'easy' ? 4 : topic === 'outs' && d === 'hard' ? pick(rng, [3, 4]) : 3
      for (let attempt = 0; attempt < 400; attempt++) {
        const cards = dealCards(rng, 4 + street)
        const hero = cards.slice(0, 2), villain = cards.slice(2, 4), board = cards.slice(4)
        const hs = evaluate([...hero, ...board]), vs = evaluate([...villain, ...board])
        if (topic === 'outs') {
          if (hs >= vs) continue
          const r = analyzeOuts({ hero: hero as [Card, Card], board, villain: [{ combo: comboIndex(villain[0], villain[1]), weight: 1 }] })
          const clean = r.cards.filter((c) => c.winShare === 1).length
          if (clean < 2 || clean > 20) continue
          if (d === 'easy' && r.dirtyOuts > 0) continue
          if (d === 'hard' && r.dirtyOuts === 0 && attempt < 300) continue
        } else {
          // Avoid trivial spots: the trailing hand should have some real equity.
          const eq = exactEquity({ players: [handPlayer(hero as [Card, Card]), handPlayer(villain as [Card, Card])], board }).players[0].equity
          if (eq < 0.08 || eq > 0.92) continue
        }
        const params: QuizParams = { hero: cardsText(hero), villain: cardsText(villain), board: cardsText(board) }
        if (topic === 'call-or-fold') {
          const { pot, bet } = potAndBet(rng, d)
          params.pot = pot
          params.bet = bet
          const eq = exactEquity({ players: [handPlayer(hero as [Card, Card]), handPlayer(villain as [Card, Card])], board }).players[0].equity
          const req = requiredEquity.compute({ pot: pot + bet, call: bet })
          if (Math.abs(eq - req) < 0.015) continue // too close to call reliably by hand
        }
        return params
      }
      throw new Error('Could not generate a question')
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Question building (deterministic)
// ---------------------------------------------------------------------------------------------
export function buildQuestion(topic: QuizTopic, params: QuizParams): QuizQuestion {
  const key = `${topic}:${JSON.stringify(params)}`
  const base = { key, topic, params }
  switch (topic) {
    case 'pot-odds':
    case 'required-equity': {
      const { pot, bet, callers } = params as { pot: number; bet: number; callers: number }
      const facing = pot + bet * (1 + callers)
      const scene = `The pot is ${pot} bb. Villain bets ${bet} bb${callers ? ` and one player calls` : ''}. You must call ${bet} bb.`
      if (topic === 'pot-odds') {
        const e = potOddsRatio.explain({ pot: facing, call: bet })
        return { ...base, prompt: `${scene} What pot odds are you getting (x : 1)?`, answer: { kind: 'numeric', value: e.value, unit: 'ratio' }, explanations: [e],
          notes: [`Pot you can win = ${pot} + ${bet}${callers ? ` + ${bet}` : ''} = ${fmt(facing)} bb.`] }
      }
      const e = requiredEquity.explain({ pot: facing, call: bet })
      return { ...base, prompt: `${scene} What equity do you need to call (%)?`, answer: { kind: 'numeric', value: e.value, unit: 'percent' }, explanations: [e, potOddsRatio.explain({ pot: facing, call: bet })],
        notes: [`Pot before your call = ${fmt(facing)} bb.`] }
    }
    case 'mdf': {
      const { pot, bet, variant } = params as { pot: number; bet: number; variant: string }
      if (variant === 'alpha') {
        const e = alpha.explain({ pot, bet })
        return { ...base, prompt: `You bet ${bet} bb into ${pot} bb as a pure bluff. How often must villain fold for it to break even (alpha, %)?`, answer: { kind: 'numeric', value: e.value, unit: 'percent' }, explanations: [e, mdf.explain({ pot, bet })], notes: [] }
      }
      const e = mdf.explain({ pot, bet })
      return { ...base, prompt: `Villain bets ${bet} bb into a ${pot} bb pot. What is your minimum defence frequency (%)?`, answer: { kind: 'numeric', value: e.value, unit: 'percent' }, explanations: [e, alpha.explain({ pot, bet })],
        notes: ['MDF is a toy-game guideline (it makes a zero-equity bluff break even), not a rule you must follow exactly.'] }
    }
    case 'break-even-fold': {
      const { pot, bet } = params as { pot: number; bet: number }
      const e = breakEvenFold.explain({ pot, risk: bet })
      return { ...base, prompt: `You bluff ${bet} bb into ${pot} bb with no equity if called. What fold % do you need to break even?`, answer: { kind: 'numeric', value: e.value, unit: 'percent' }, explanations: [e], notes: [] }
    }
    case 'spr': {
      const { pot, stack } = params as { pot: number; stack: number }
      const e = spr.explain({ effectiveStack: stack, pot })
      return { ...base, prompt: `On the flop the pot is ${pot} bb and the effective stack is ${stack} bb. What is the SPR?`, answer: { kind: 'numeric', value: e.value, unit: 'number' }, explanations: [e], notes: [] }
    }
    case 'combos':
    case 'blockers': {
      const { target, dead } = params as { target: string; dead: string }
      const deadCards = toCards(dead)
      const r = parseRange(target)
      const value = comboCount(r, deadCards)
      const notes: string[] = []
      const explanations: Explanation[] = []
      const cls = handClassByLabel(target)
      if (cls) {
        const left = (rank: number) => 4 - deadCards.filter((c) => c >> 2 === rank).length
        if (cls.kind === 'pair') explanations.push(pairCombos.explain({ cardsLeft: left(cls.high) }))
        else {
          const suitedLeft = [0, 1, 2, 3].filter((s) => !deadCards.includes(cls.high * 4 + s) && !deadCards.includes(cls.low * 4 + s)).length
          explanations.push(unpairedCombos.explain({ highLeft: left(cls.high), lowLeft: left(cls.low), suitedPairsLeft: suitedLeft }))
          if (cls.kind === 'suited') notes.push(`Only suited combos count: ${suitedLeft}.`)
          if (cls.kind === 'offsuit') notes.push(`Offsuit = total − suited = ${left(cls.high) * left(cls.low)} − ${suitedLeft}.`)
        }
      } else {
        notes.push('Count each part of the range separately with card removal, then add them up.')
        for (const part of target.split(',').map((x) => x.trim())) notes.push(`${part}: ${fmt(comboCount(parseRange(part), deadCards))} combos`)
      }
      const where = topic === 'blockers' ? `You hold ${cardsText(deadCards)}.` : deadCards.length ? `Visible cards: ${cardsText(deadCards)}.` : 'No cards are visible.'
      return {
        ...base, prompt: `${where} How many combos of ${target} can villain have?`, dead: deadCards,
        hero: topic === 'blockers' ? deadCards : undefined, board: topic === 'combos' ? deadCards : undefined,
        answer: { kind: 'numeric', value, unit: 'count' }, explanations, notes,
      }
    }
    case 'outs': {
      const hero = toCards(params.hero as string) as [Card, Card]
      const villain = toCards(params.villain as string)
      const board = toCards(params.board as string)
      const r = analyzeOuts({ hero, board, villain: [{ combo: comboIndex(villain[0], villain[1]), weight: 1 }] })
      const clean = r.cards.filter((c) => c.winShare === 1)
      const partial = r.cards.filter((c) => c.winShare > 0 && c.winShare < 1)
      const lose = r.cards.filter((c) => c.improves && c.winShare === 0)
      const unseen = 52 - 2 - board.length // from your perspective
      const outs = clean.length
      const notes = [
        `You have ${describeScore(evaluate([...hero, ...board]))}; villain has ${describeScore(evaluate([...villain, ...board]))}.`,
        `Winning outs (${outs}): ${clean.map((c) => c.label).join(' ') || 'none'}.`,
      ]
      if (partial.length) notes.push(`Cards that only tie: ${partial.map((c) => c.label).join(' ')}.`)
      if (lose.length) notes.push(`Dirty cards that improve you but still lose: ${lose.map((c) => c.label).join(' ')}.`)
      notes.push(`Villain’s hand is known here, so 45 or 44 cards can really come; the rules of 2 and 4 use your unseen count (${unseen}).`)
      const exps = [hitNextCard.explain({ outs, unseen }), ruleOf2.explain({ outs })]
      if (board.length === 3) exps.push(hitByRiver.explain({ outs, unseen }), ruleOf4.explain({ outs }))
      return {
        ...base, prompt: `Villain shows ${cardsText(villain)}. How many cards give you the outright best hand on the next card?`,
        hero, villain, board, answer: { kind: 'numeric', value: outs, unit: 'count' }, explanations: exps, notes,
      }
    }
    case 'equity-estimate': {
      if (params.preflop) {
        const a = handClassByLabel(params.a as string)!
        const b = handClassByLabel(params.b as string)!
        const v = classVsClass(a.index, b.index)
        return { ...base, prompt: `Preflop all-in: ${a.label} vs ${b.label}. What is ${a.label}’s equity (%)?`, answer: { kind: 'numeric', value: v, unit: 'percent' }, explanations: [],
          notes: [`Averaged over all suit combinations (preflop matrix, Monte Carlo ${MATRIX_INFO.trialsPerPair.toLocaleString()} trials, SE ≤ ${(MATRIX_INFO.maxStdError * 100).toFixed(2)} pp).`] }
      }
      const hero = toCards(params.hero as string) as [Card, Card]
      const villain = toCards(params.villain as string) as [Card, Card]
      const board = toCards(params.board as string)
      const r = exactEquity({ players: [handPlayer(hero), handPlayer(villain)], board })
      return {
        ...base, prompt: `All-in on the ${board.length === 3 ? 'flop' : 'turn'}. What is your equity (%)?`, hero, villain, board,
        answer: { kind: 'numeric', value: r.players[0].equity, unit: 'percent' }, explanations: [],
        notes: [
          `Exact enumeration of ${r.samples} runouts: win ${pct(r.players[0].win)}, tie ${pct(r.players[0].tie)}.`,
          `You: ${describeScore(evaluate([...hero, ...board]))}. Villain: ${describeScore(evaluate([...villain, ...board]))}.`,
        ],
      }
    }
    case 'call-or-fold': {
      const hero = toCards(params.hero as string) as [Card, Card]
      const villain = toCards(params.villain as string) as [Card, Card]
      const board = toCards(params.board as string)
      const pot = params.pot as number, bet = params.bet as number
      const eq = exactEquity({ players: [handPlayer(hero), handPlayer(villain)], board }).players[0].equity
      const req = requiredEquity.explain({ pot: pot + bet, call: bet })
      const ev = evCall.explain({ pot: pot + bet, call: bet, equity: eq })
      return {
        ...base, prompt: `The pot is ${pot} bb. Villain (cards shown) moves all-in for ${bet} bb on the ${board.length === 3 ? 'flop' : 'turn'}. Call or fold?`,
        hero, villain, board, answer: { kind: 'choice', options: ['Fold', 'Call'], correct: eq >= req.value ? 1 : 0 },
        explanations: [req, ev], notes: [`Your exact equity: ${pct(eq)} vs required ${pct(req.value)}.`],
      }
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Grading
// ---------------------------------------------------------------------------------------------
export interface GradeSettings { percentTolerance: number; relativeTolerance: number }

/** Parse a user answer: accepts "33", "33%", "2.5", "2.5:1", "3/1". */
export function parseAnswer(text: string, unit: NumericUnit): number | null {
  const t = text.trim().replace(',', '.')
  if (!t) return null
  if (unit === 'ratio') {
    const m = t.match(/^([\d.]+)\s*[:/]\s*([\d.]+)$/)
    if (m) return Number(m[1]) / Number(m[2])
  }
  const n = Number(t.replace(/%$/, '').trim())
  if (!Number.isFinite(n)) return null
  return unit === 'percent' ? n / 100 : n
}

export function formatAnswer(a: NumericAnswer | ChoiceAnswer): string {
  if (a.kind === 'choice') return a.options[a.correct]
  switch (a.unit) {
    case 'percent': return `${fmt(a.value * 100, 1)}%`
    case 'ratio': return `${fmt(a.value, 2)} : 1`
    case 'count': return String(Math.round(a.value))
    default: return fmt(a.value, 2)
  }
}

export function grade(q: QuizQuestion, input: number | null, g: GradeSettings): boolean {
  if (input === null) return false
  const a = q.answer
  if (a.kind === 'choice') return input === a.correct
  switch (a.unit) {
    case 'percent': return Math.abs(input - a.value) * 100 <= g.percentTolerance + 1e-9
    case 'count': return Math.round(input) === Math.round(a.value) && Math.abs(input - Math.round(input)) < 1e-9
    default: return Math.abs(input - a.value) <= Math.abs(a.value) * (g.relativeTolerance / 100) + 1e-9
  }
}
