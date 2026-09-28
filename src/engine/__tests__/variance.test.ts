import { describe, it, expect } from 'vitest'
import { normalCdf, normalQuantile, normalSample } from '../stats'
import { simulateVariance } from '../variance'
import { probLoser, riskOfRuin, riskOfRuinFinite, expectedWinnings, resultStdDev, handsToConfidence } from '../formulas'
import { createRng } from '../rng'

describe('normal distribution', () => {
  it('matches known CDF values', () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 7)
    expect(normalCdf(1.959964)).toBeCloseTo(0.975, 6)
    expect(normalCdf(-1)).toBeCloseTo(0.158655254, 6)
    expect(normalCdf(3)).toBeCloseTo(0.998650102, 6)
  })
  it('quantile inverts the CDF', () => {
    for (const p of [0.001, 0.025, 0.3, 0.5, 0.84, 0.99]) expect(normalCdf(normalQuantile(p))).toBeCloseTo(p, 6)
    expect(normalQuantile(0.95)).toBeCloseTo(1.644854, 5)
  })
  it('samples have mean 0 and variance 1', () => {
    const rng = createRng(1)
    let s = 0, s2 = 0
    const n = 200_000
    for (let i = 0; i < n; i++) { const x = normalSample(rng); s += x; s2 += x * x }
    expect(Math.abs(s / n)).toBeLessThan(0.01)
    expect(Math.abs(s2 / n - 1)).toBeLessThan(0.015)
  })
})

describe('variance formulas', () => {
  it('computes mean, SD and probability of being behind', () => {
    expect(expectedWinnings.compute({ winRate: 5, hands: 100_000 })).toBe(5000)
    expect(resultStdDev.compute({ stdDev: 90, hands: 100_000 })).toBeCloseTo(90 * Math.sqrt(1000), 10)
    // z = −5000 / 2846.05 = −1.7568 → ≈ 3.95 %
    expect(probLoser.compute({ winRate: 5, stdDev: 90, hands: 100_000 })).toBeCloseTo(normalCdf(-5000 / (90 * Math.sqrt(1000))), 12)
    expect(handsToConfidence.compute({ winRate: 5, stdDev: 90, confidenceZ: 1.645 })).toBeCloseTo(100 * (1.645 * 18) ** 2, 6)
  })
  it('risk of ruin: infinite horizon is the limit of the finite-horizon formula', () => {
    const inf = riskOfRuin.compute({ winRate: 5, stdDev: 90, bankroll: 1000 })
    expect(inf).toBeCloseTo(Math.exp(-2 * 5 * 1000 / 8100), 12)
    expect(riskOfRuinFinite.compute({ winRate: 5, stdDev: 90, bankroll: 1000, hands: 1e9 })).toBeCloseTo(inf, 6)
    expect(riskOfRuinFinite.compute({ winRate: 5, stdDev: 90, bankroll: 1000, hands: 10_000 })).toBeLessThan(inf)
    expect(riskOfRuin.compute({ winRate: -1, stdDev: 90, bankroll: 1000 })).toBe(1)
  })
})

describe('variance simulation', () => {
  const inp = { winRate: 5, stdDev: 90, hands: 50_000, bankroll: 1500, paths: 4000, steps: 500, seed: 7 }
  const r = simulateVariance(inp)
  it('final results have the right mean and spread', () => {
    const mean = r.finals.reduce((a, b) => a + b, 0) / r.finals.length
    const sd = Math.sqrt(r.finals.reduce((a, b) => a + (b - mean) ** 2, 0) / (r.finals.length - 1))
    const trueSd = resultStdDev.compute({ stdDev: 90, hands: 50_000 })
    expect(Math.abs(mean - 2500)).toBeLessThan(4 * trueSd / Math.sqrt(4000))
    expect(Math.abs(sd / trueSd - 1)).toBeLessThan(0.05)
  })
  it('agrees with the analytic probabilities', () => {
    const pl = probLoser.compute({ winRate: 5, stdDev: 90, hands: 50_000 })
    expect(Math.abs(r.losers - pl)).toBeLessThan(4 * Math.sqrt(pl * (1 - pl) / 4000))
    const ror = riskOfRuinFinite.compute({ ...inp })
    // Discrete checking undercounts slightly; allow MC noise + a small discretisation margin.
    expect(r.ruined).toBeLessThanOrEqual(ror + 4 * Math.sqrt(ror * (1 - ror) / 4000))
    expect(r.ruined).toBeGreaterThan(ror * 0.8 - 4 * Math.sqrt(ror * (1 - ror) / 4000))
  })
  it('returns plot data', () => {
    expect(r.x).toHaveLength(501)
    expect(r.x[500]).toBe(50_000)
    expect(r.samples[0]).toHaveLength(501)
    expect(r.bands.p50[0]).toBe(0)
  })
})
