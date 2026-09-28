/**
 * Variance simulator. Model: the result after t·100 hands is Brownian motion with drift
 * μ = win rate (bb/100) and volatility σ = standard deviation (bb/100). Each path is simulated
 * in `steps` equal blocks of Δ = hands/steps hands with exact normal increments
 * N(μ·Δ/100, σ²·Δ/100). Ruin is checked at the end of each block (so it slightly undercounts
 * the continuous-time value, which the UI shows alongside).
 */
import { createRng } from './rng'
import { normalSample } from './stats'

export interface VarianceInput {
  winRate: number
  stdDev: number
  hands: number
  bankroll: number
  paths: number
  /** Number of time blocks per path (plot resolution). */
  steps?: number
  /** How many individual paths to return for plotting. */
  samplePaths?: number
  seed?: number
}

export interface VarianceResult {
  /** Hands at each point, length steps + 1 (starts at 0). */
  x: number[]
  samples: number[][]
  /** Empirical percentiles per point: p2.5, p16, p50, p84, p97.5. */
  bands: { p025: number[]; p16: number[]; p50: number[]; p84: number[]; p975: number[] }
  /** Fraction of paths that touched −bankroll. */
  ruined: number
  /** Fraction of paths below 0 at the end. */
  losers: number
  finals: number[]
  best: number
  worst: number
  /** Average of the largest peak-to-trough drop per path. */
  meanMaxDrawdown: number
}

function quantile(sorted: Float64Array, q: number): number {
  const pos = (sorted.length - 1) * q
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo)
}

export function simulateVariance(inp: VarianceInput): VarianceResult {
  const steps = Math.max(1, Math.min(inp.steps ?? 250, Math.ceil(inp.hands / 10)))
  const paths = Math.max(1, Math.floor(inp.paths))
  const rng = createRng(inp.seed)
  const blockHands = inp.hands / steps
  const drift = (inp.winRate * blockHands) / 100
  const vol = inp.stdDev * Math.sqrt(blockHands / 100)
  const keep = Math.min(paths, inp.samplePaths ?? 60)

  const values = Array.from({ length: steps + 1 }, () => new Float64Array(paths))
  const samples: number[][] = []
  let ruined = 0
  let ddSum = 0
  for (let p = 0; p < paths; p++) {
    let v = 0
    let peak = 0
    let maxDd = 0
    let hitRuin = false
    const path = p < keep ? [0] : null
    for (let t = 1; t <= steps; t++) {
      v += drift + vol * normalSample(rng)
      values[t][p] = v
      if (v > peak) peak = v
      if (peak - v > maxDd) maxDd = peak - v
      if (!hitRuin && v <= -inp.bankroll) hitRuin = true
      path?.push(v)
    }
    if (hitRuin) ruined++
    ddSum += maxDd
    if (path) samples.push(path)
  }

  const bands = { p025: [] as number[], p16: [] as number[], p50: [] as number[], p84: [] as number[], p975: [] as number[] }
  for (let t = 0; t <= steps; t++) {
    const sorted = values[t].slice().sort()
    bands.p025.push(quantile(sorted, 0.025))
    bands.p16.push(quantile(sorted, 0.16))
    bands.p50.push(quantile(sorted, 0.5))
    bands.p84.push(quantile(sorted, 0.84))
    bands.p975.push(quantile(sorted, 0.975))
  }
  const finals = Array.from(values[steps])
  return {
    x: Array.from({ length: steps + 1 }, (_, t) => Math.round(t * blockHands)),
    samples,
    bands,
    ruined: ruined / paths,
    losers: finals.filter((f) => f < 0).length / paths,
    finals,
    best: Math.max(...finals),
    worst: Math.min(...finals),
    meanMaxDrawdown: ddSum / paths,
  }
}
