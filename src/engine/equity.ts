/**
 * Equity calculation: hand vs hand, hand vs range, range vs range, multiway.
 *
 * Every player is described by a list of weighted combos (a single known hand is a list of one).
 * The quantity computed for player i is
 *
 *   equity_i = Σ_a w(a) · Σ_b share_i(a, b)  /  Σ_a w(a) · N_b
 *
 * where a ranges over all card-disjoint assignments of one combo per player,
 * w(a) = Π_j weight_j(a_j) (the product of range weights), b ranges over the N_b possible
 * completions of the board, and share_i = 1/k if player i is one of k players tied for best hand,
 * else 0. This is the standard all-in equity ("pot share at showdown") used by PokerStove/Equilab.
 *
 *   method "exact":        enumerates every assignment and every board completion.
 *   method "monte-carlo":  samples assignments with probability ∝ w(a) by rejection sampling
 *                          (draw each player's combo ∝ weight, reject if cards collide), then a
 *                          uniform random board completion. Reports standard error per player:
 *                            SE = sqrt( s² / n ),  s² = sample variance of share_i,
 *                            95% margin of error = 1.96 · SE.
 *   method "auto":         exact when the estimated number of hand evaluations is within
 *                          `maxExactEvaluations`, Monte Carlo otherwise.
 */
import { type Card, DECK_SIZE, assertDistinct } from './cards'
import { COMBO_CARDS, NUM_COMBOS, comboIndex } from './combos'
import { addCard, emptyState, evaluateWith2, type MaskState } from './evaluator'
import { createRng } from './rng'
import { liveCombos, type WeightedCombo, type Weights } from './range'
import { binomial } from './formulas'

export type EquityMethod = 'auto' | 'exact' | 'monte-carlo'

export interface EquityPlayerInput {
  combos: WeightedCombo[]
}

export interface EquityRequest {
  players: EquityPlayerInput[]
  board?: Card[]
  dead?: Card[]
  method?: EquityMethod
  /** Monte Carlo trials (accepted samples). Default 200,000. */
  iterations?: number
  /** Auto mode switches to Monte Carlo above this many estimated evaluations. Default 30,000,000. */
  maxExactEvaluations?: number
  seed?: number
  /** Called periodically with a partial result (Monte Carlo) or completion fraction (exact). */
  onProgress?: (p: EquityProgress) => void
  /** Return true to stop early; the partial result is returned. */
  shouldStop?: () => boolean
}

export interface PlayerEquity {
  /** Pot share, 0..1 (win + split share). */
  equity: number
  /** Probability of winning the whole pot. */
  win: number
  /** Probability of splitting the pot (any number of ways). */
  tie: number
  /** Standard error of `equity` (0 for exact). */
  stdError: number
  /** 95% margin of error = 1.96 · stdError (0 for exact). */
  marginOfError95: number
}

export interface EquityResult {
  players: PlayerEquity[]
  method: 'exact' | 'monte-carlo'
  /** Exact: number of (assignment, board) outcomes enumerated. Monte Carlo: accepted trials. */
  samples: number
  /** Monte Carlo: rejected draws due to card collisions between ranges. */
  rejected: number
  /** Whether the run was stopped before completion. */
  stoppedEarly: boolean
  elapsedMs: number
}

export interface EquityProgress {
  fraction: number
  partial?: EquityResult
}

const DEFAULT_ITERATIONS = 200_000
const DEFAULT_MAX_EXACT = 30_000_000

/** Validate input and drop combos that collide with the board or dead cards. */
function prepare(req: EquityRequest) {
  const board = req.board ?? []
  const dead = req.dead ?? []
  if (req.players.length < 2) throw new Error('Equity needs at least two players')
  if (req.players.length > 10) throw new Error('At most 10 players are supported')
  if (![0, 3, 4, 5].includes(board.length)) throw new Error('Board must have 0, 3, 4 or 5 cards')
  assertDistinct([...board, ...dead])
  const blocked = new Uint8Array(DECK_SIZE)
  for (const c of board) blocked[c] = 1
  for (const c of dead) blocked[c] = 1
  const players = req.players.map((p, idx) => {
    const combos = p.combos.filter(
      (wc) => wc.weight > 0 && wc.combo >= 0 && wc.combo < NUM_COMBOS &&
        !blocked[COMBO_CARDS[2 * wc.combo]] && !blocked[COMBO_CARDS[2 * wc.combo + 1]],
    )
    if (combos.length === 0) throw new Error(`Player ${idx + 1} has no possible hands after card removal`)
    return combos
  })
  const missing = 5 - board.length
  const deckLeft = DECK_SIZE - board.length - dead.length - 2 * players.length
  if (deckLeft < missing) throw new Error('Not enough cards left in the deck')
  return { board, dead, blocked, players, missing, deckLeft }
}

/**
 * Upper bound on hand evaluations for exact enumeration
 * = (Π combos per player) · C(cards left, missing board cards) · players.
 * (Colliding assignments are skipped in practice, so the real count is lower.)
 */
export function estimateExactEvaluations(req: EquityRequest): number {
  const { players, missing, deckLeft } = prepare(req)
  let assignments = 1
  for (const p of players) assignments *= p.length
  return assignments * binomial(deckLeft, missing) * players.length
}

export function calculateEquity(req: EquityRequest): EquityResult {
  const method = req.method ?? 'auto'
  if (method === 'exact') return exactEquity(req)
  if (method === 'monte-carlo') return monteCarloEquity(req)
  const est = estimateExactEvaluations(req)
  return est <= (req.maxExactEvaluations ?? DEFAULT_MAX_EXACT) ? exactEquity(req) : monteCarloEquity(req)
}

// ---------------------------------------------------------------------------------------------
// Showdown scoring shared by both methods
// ---------------------------------------------------------------------------------------------
/**
 * Score one showdown and add the result into the accumulators.
 * Returns nothing; writes share (for variance) into `shares`.
 */
function showdown(
  state: MaskState, holes: Int32Array, n: number, scores: Int32Array, shares: Float64Array,
): void {
  let best = -1
  let winners = 0
  for (let i = 0; i < n; i++) {
    const s = evaluateWith2(state, holes[2 * i], holes[2 * i + 1])
    scores[i] = s
    if (s > best) { best = s; winners = 1 } else if (s === best) winners++
  }
  const share = 1 / winners
  for (let i = 0; i < n; i++) shares[i] = scores[i] === best ? share : 0
}

// ---------------------------------------------------------------------------------------------
// Exact enumeration
// ---------------------------------------------------------------------------------------------
export function exactEquity(req: EquityRequest): EquityResult {
  const t0 = now()
  const { board, blocked, players, missing } = prepare(req)
  const n = players.length

  const eq = new Float64Array(n)
  const win = new Float64Array(n)
  const tie = new Float64Array(n)
  let totalWeight = 0
  let samples = 0
  let stopped = false

  const baseState = emptyState()
  for (const c of board) addCard(baseState, c)

  const used = new Uint8Array(blocked) // board + dead, plus player cards during the DFS
  const holes = new Int32Array(2 * n)
  const scores = new Int32Array(n)
  const shares = new Float64Array(n)
  const states: MaskState[] = Array.from({ length: 6 }, emptyState)
  const deck = new Int32Array(DECK_SIZE)

  // Progress is tracked over the first player's combos.
  const firstCount = players[0].length
  let firstDone = 0

  const enumerateBoards = (weight: number) => {
    let dn = 0
    for (let c = 0; c < DECK_SIZE; c++) if (!used[c]) deck[dn++] = c
    const leaf = () => {
      showdown(states[missing], holes, n, scores, shares)
      let winners = 0
      for (let i = 0; i < n; i++) if (shares[i] > 0) winners++
      for (let i = 0; i < n; i++) {
        if (shares[i] > 0) {
          eq[i] += weight * shares[i]
          if (winners === 1) win[i] += weight
          else tie[i] += weight
        }
      }
      totalWeight += weight
      samples++
    }
    copyState(states[0], baseState)
    if (missing === 0) { leaf(); return }
    // Iterative-depth recursion over increasing deck indices (combinations, not permutations).
    const rec = (depth: number, start: number) => {
      for (let k = start; k <= dn - (missing - depth); k++) {
        copyState(states[depth + 1], states[depth])
        addCard(states[depth + 1], deck[k])
        if (depth + 1 === missing) leaf()
        else rec(depth + 1, k + 1)
      }
    }
    rec(0, 0)
  }

  const assign = (p: number, weight: number) => {
    if (stopped) return
    if (p === n) { enumerateBoards(weight); return }
    for (const wc of players[p]) {
      const a = COMBO_CARDS[2 * wc.combo], b = COMBO_CARDS[2 * wc.combo + 1]
      if (used[a] || used[b]) continue
      used[a] = 1; used[b] = 1
      holes[2 * p] = a; holes[2 * p + 1] = b
      assign(p + 1, weight * wc.weight)
      used[a] = 0; used[b] = 0
      if (p === 0) {
        firstDone++
        if (req.onProgress && firstDone % Math.max(1, Math.floor(firstCount / 50)) === 0) {
          req.onProgress({ fraction: firstDone / firstCount })
        }
        if (req.shouldStop?.()) { stopped = true; return }
      }
    }
  }
  assign(0, 1)

  if (totalWeight === 0) throw new Error('No valid card assignment: the ranges fully block each other')
  const result: EquityResult = {
    players: Array.from({ length: n }, (_, i) => ({
      equity: eq[i] / totalWeight,
      win: win[i] / totalWeight,
      tie: tie[i] / totalWeight,
      stdError: 0,
      marginOfError95: 0,
    })),
    method: 'exact',
    samples,
    rejected: 0,
    stoppedEarly: stopped,
    elapsedMs: now() - t0,
  }
  req.onProgress?.({ fraction: 1, partial: result })
  return result
}

// ---------------------------------------------------------------------------------------------
// Monte Carlo
// ---------------------------------------------------------------------------------------------
export function monteCarloEquity(req: EquityRequest): EquityResult {
  const t0 = now()
  const { board, blocked, players, missing } = prepare(req)
  const n = players.length
  const iterations = Math.max(1, Math.floor(req.iterations ?? DEFAULT_ITERATIONS))
  const rng = createRng(req.seed)

  // Cumulative weights for sampling each player's combo ∝ weight.
  const cum = players.map((combos) => {
    const arr = new Float64Array(combos.length)
    let s = 0
    for (let i = 0; i < combos.length; i++) { s += combos[i].weight; arr[i] = s }
    return arr
  })
  const pick = (p: number): number => {
    const arr = cum[p]
    const combos = players[p]
    if (combos.length === 1) return combos[0].combo
    const x = rng.next() * arr[arr.length - 1]
    let lo = 0, hi = arr.length - 1
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (arr[mid] > x) hi = mid
      else lo = mid + 1
    }
    return combos[lo].combo
  }

  const baseState = emptyState()
  for (const c of board) addCard(baseState, c)
  const state = emptyState()
  const used = new Uint8Array(DECK_SIZE)
  const holes = new Int32Array(2 * n)
  const scores = new Int32Array(n)
  const shares = new Float64Array(n)
  const deck = new Int32Array(DECK_SIZE)

  const sum = new Float64Array(n)
  const sumSq = new Float64Array(n)
  const win = new Float64Array(n)
  const tie = new Float64Array(n)
  let accepted = 0
  let rejected = 0
  let stopped = false
  const chunk = 5_000
  const maxRejectStreak = 200_000

  const snapshot = (): EquityResult => ({
    players: Array.from({ length: n }, (_, i) => {
      const mean = accepted ? sum[i] / accepted : 0
      const variance = accepted > 1 ? Math.max(0, (sumSq[i] - accepted * mean * mean) / (accepted - 1)) : 0
      const se = accepted ? Math.sqrt(variance / accepted) : 0
      return {
        equity: mean,
        win: accepted ? win[i] / accepted : 0,
        tie: accepted ? tie[i] / accepted : 0,
        stdError: se,
        marginOfError95: 1.96 * se,
      }
    }),
    method: 'monte-carlo',
    samples: accepted,
    rejected,
    stoppedEarly: stopped,
    elapsedMs: now() - t0,
  })

  let streak = 0
  while (accepted < iterations) {
    // 1) Sample one combo per player; reject the whole draw on any card collision.
    used.set(blocked)
    let ok = true
    for (let p = 0; p < n; p++) {
      const c = pick(p)
      const a = COMBO_CARDS[2 * c], b = COMBO_CARDS[2 * c + 1]
      if (used[a] || used[b]) { ok = false; break }
      used[a] = 1; used[b] = 1
      holes[2 * p] = a; holes[2 * p + 1] = b
    }
    if (!ok) {
      rejected++
      if (++streak > maxRejectStreak) {
        if (accepted === 0) throw new Error('The ranges almost never fit together (every draw collides)')
        break
      }
      continue
    }
    streak = 0

    // 2) Uniform board completion via a partial Fisher-Yates shuffle of the remaining deck.
    copyState(state, baseState)
    if (missing > 0) {
      let dn = 0
      for (let c = 0; c < DECK_SIZE; c++) if (!used[c]) deck[dn++] = c
      for (let k = 0; k < missing; k++) {
        const j = k + rng.int(dn - k)
        const tmp = deck[k]; deck[k] = deck[j]; deck[j] = tmp
        addCard(state, deck[k])
      }
    }

    // 3) Showdown.
    showdown(state, holes, n, scores, shares)
    let winners = 0
    for (let i = 0; i < n; i++) if (shares[i] > 0) winners++
    for (let i = 0; i < n; i++) {
      const s = shares[i]
      sum[i] += s
      sumSq[i] += s * s
      if (s > 0) {
        if (winners === 1) win[i]++
        else tie[i]++
      }
    }
    accepted++

    if (accepted % chunk === 0) {
      req.onProgress?.({ fraction: accepted / iterations, partial: snapshot() })
      if (req.shouldStop?.()) { stopped = true; break }
    }
  }

  const result = snapshot()
  req.onProgress?.({ fraction: 1, partial: result })
  return result
}

// ---------------------------------------------------------------------------------------------
// Convenience wrappers
// ---------------------------------------------------------------------------------------------
/** A known two-card hand as an equity player. */
export function handPlayer(cards: [Card, Card]): EquityPlayerInput {
  return { combos: [{ combo: comboIndex(cards[0], cards[1]), weight: 1 }] }
}

/** A weighted range as an equity player. */
export function rangePlayer(r: Weights): EquityPlayerInput {
  return { combos: liveCombos(r) }
}

function copyState(dst: MaskState, src: MaskState): void {
  dst.s0 = src.s0; dst.s1 = src.s1; dst.s2 = src.s2; dst.s3 = src.s3
  dst.r1 = src.r1; dst.r2 = src.r2; dst.r3 = src.r3; dst.r4 = src.r4
}

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now()
}
