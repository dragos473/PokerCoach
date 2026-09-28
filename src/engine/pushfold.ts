/**
 * Heads-up push/fold equilibrium (small blind vs big blind), chip EV.
 *
 * Game: both players start with S big blinds (effective). Each posts an ante a, SB posts 0.5, BB 1.
 * SB either shoves all-in or folds; BB calls or folds. Payoffs, measured for each player relative
 * to the start of the hand:
 *   SB folds:                 SB −(0.5 + a)
 *   SB shoves, BB folds:      SB +(1 + a)        (BB −(1 + a))
 *   SB shoves, BB calls:      SB S·(2·E − 1)     where E = SB's all-in equity; final pot = 2S
 * BB calls with hand j iff S·(2·eq_j − 1) > −(1 + a), i.e. eq_j > (S − 1 − a) / (2S)  (required equity).
 *
 * Solved by fictitious play (each side best-responds to the other's average strategy; converges in
 * two-player zero-sum games). Hand-vs-hand equities come from the preflop class matrix; the
 * distribution of the opponent's hand respects card removal via disjoint combo pair counts.
 * Reported `exploitability` (bb per hand, sum over both players) measures distance from equilibrium.
 *
 * Assumptions to show in the UI: chip EV (no ICM), heads-up, no limping or small raises,
 * class-averaged equities from the precomputed matrix.
 */
import { HAND_CLASSES, NUM_CLASSES } from './combos'
import { PREFLOP_EQUITY, disjointPairCount } from './preflop'

const N = NUM_CLASSES

let pairCounts: Float64Array | null = null
/** n(i, j) = number of card-disjoint combo pairs between class i and class j. */
export function classPairCounts(): Float64Array {
  if (!pairCounts) {
    pairCounts = new Float64Array(N * N)
    for (let i = 0; i < N; i++) {
      for (let j = i; j < N; j++) {
        const n = disjointPairCount(HAND_CLASSES[i], HAND_CLASSES[j])
        pairCounts[i * N + j] = n
        pairCounts[j * N + i] = n
      }
    }
  }
  return pairCounts
}

export interface PushFoldInput {
  stackBB: number
  ante?: number
  iterations?: number
}

export interface PushFoldResult {
  /** Push frequency per hand class (0..1). */
  push: Float64Array
  /** Call frequency per hand class (0..1). */
  call: Float64Array
  /** SB EV of pushing / folding each class vs the BB call strategy (bb). */
  evPush: Float64Array
  evFold: number
  /** Required equity for BB to call a shove. */
  bbRequiredEquity: number
  /** SB's expected value of the whole game at equilibrium (bb per hand). */
  sbGameValue: number
  exploitability: number
  iterations: number
}

function sbBestResponse(call: Float64Array, S: number, a: number, n: Float64Array, evPush: Float64Array): Float64Array {
  const br = new Float64Array(N)
  const evFold = -(0.5 + a)
  for (let i = 0; i < N; i++) {
    let acc = 0, tot = 0
    for (let j = 0; j < N; j++) {
      const w = n[i * N + j]
      if (!w) continue
      const cj = call[j]
      acc += w * ((1 - cj) * (1 + a) + cj * S * (2 * PREFLOP_EQUITY[i * N + j] - 1))
      tot += w
    }
    evPush[i] = acc / tot
    br[i] = evPush[i] > evFold ? 1 : 0
  }
  return br
}

function bbBestResponse(push: Float64Array, S: number, a: number, n: Float64Array, evCall?: Float64Array): Float64Array {
  const br = new Float64Array(N)
  for (let j = 0; j < N; j++) {
    let acc = 0, tot = 0
    for (let i = 0; i < N; i++) {
      const w = n[i * N + j] * push[i]
      if (!w) continue
      acc += w * (1 - PREFLOP_EQUITY[i * N + j])
      tot += w
    }
    if (tot === 0) { br[j] = 0; if (evCall) evCall[j] = NaN; continue }
    const ev = S * (2 * (acc / tot) - 1)
    if (evCall) evCall[j] = ev
    br[j] = ev > -(1 + a) ? 1 : 0
  }
  return br
}

/** SB expected value of the game for given strategies (averaged over all deals). */
function gameValue(push: Float64Array, call: Float64Array, S: number, a: number, n: Float64Array): number {
  let acc = 0, tot = 0
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      const w = n[i * N + j]
      if (!w) continue
      const p = push[i], c = call[j]
      const v = (1 - p) * -(0.5 + a) + p * ((1 - c) * (1 + a) + c * S * (2 * PREFLOP_EQUITY[i * N + j] - 1))
      acc += w * v
      tot += w
    }
  }
  return acc / tot
}

export function solvePushFold({ stackBB, ante = 0, iterations = 1500 }: PushFoldInput): PushFoldResult {
  const S = stackBB
  const a = ante
  if (!(S > 1 + a)) throw new Error('Stack must be larger than the big blind plus ante')
  const n = classPairCounts()
  const avgPush = new Float64Array(N).fill(1)
  const avgCall = new Float64Array(N).fill(0)
  const evPush = new Float64Array(N)
  for (let t = 1; t <= iterations; t++) {
    const brCall = bbBestResponse(avgPush, S, a, n)
    const brPush = sbBestResponse(avgCall, S, a, n, evPush)
    const k = 1 / t // t = 1 replaces the initial guess entirely
    for (let i = 0; i < N; i++) {
      avgPush[i] += (brPush[i] - avgPush[i]) * k
      avgCall[i] += (brCall[i] - avgCall[i]) * k
    }
  }
  // Exploitability: how much each side could gain by best-responding to the other's average.
  const v = gameValue(avgPush, avgCall, S, a, n)
  const sbBR = sbBestResponse(avgCall, S, a, n, evPush)
  const bbBR = bbBestResponse(avgPush, S, a, n)
  const exploitability = (gameValue(sbBR, avgCall, S, a, n) - v) + (v - gameValue(avgPush, bbBR, S, a, n))
  sbBestResponse(avgCall, S, a, n, evPush) // final EVs vs the average call strategy
  return {
    push: avgPush,
    call: avgCall,
    evPush,
    evFold: -(0.5 + a),
    bbRequiredEquity: (S - 1 - a) / (2 * S),
    sbGameValue: v,
    exploitability,
    iterations,
  }
}
