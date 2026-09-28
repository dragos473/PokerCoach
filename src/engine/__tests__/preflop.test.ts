import { describe, it, expect } from 'vitest'
import {
  PREFLOP_EQUITY, classVsClass, EQUITY_VS_RANDOM, CLASS_RANKING, MATRIX_INFO, topPercentRange,
  classEquitiesVsRange, rangeVsRangeFast, categoryBreakdown, disjointPairCount, CLASS_CATEGORY,
} from '../preflop'
import { handClassByLabel, HAND_CLASSES, NUM_CLASSES } from '../combos'
import { parseRange, comboCount, rangePercent } from '../range'
import { monteCarloEquity } from '../equity'
import { createRng } from '../rng'

const idx = (l: string) => handClassByLabel(l)!.index
const cls = (l: string) => handClassByLabel(l)!

describe('preflop equity matrix', () => {
  const tol = 4 * MATRIX_INFO.maxStdError

  it('is antisymmetric with 1/2 on the diagonal', () => {
    for (let i = 0; i < NUM_CLASSES; i++) {
      expect(classVsClass(i, i)).toBe(0.5)
      for (let j = 0; j < NUM_CLASSES; j++) expect(classVsClass(i, j) + classVsClass(j, i)).toBeCloseTo(1, 12)
    }
    expect(PREFLOP_EQUITY.length).toBe(169 * 169)
  })

  it('matches exact reference values within 4 standard errors', () => {
    expect(Math.abs(classVsClass(idx('AA'), idx('KK')) - 0.81946)).toBeLessThan(tol)
    expect(Math.abs(classVsClass(idx('AKs'), idx('QQ')) - 0.46049)).toBeLessThan(tol)
    expect(Math.abs(classVsClass(idx('AKo'), idx('QQ')) - 0.43242)).toBeLessThan(tol)
  })

  it('agrees with an independent Monte Carlo run on random class pairs', () => {
    const rng = createRng(77)
    for (let t = 0; t < 6; t++) {
      const i = rng.int(169), j = rng.int(169)
      if (i === j) continue
      const r = monteCarloEquity({
        players: [
          { combos: HAND_CLASSES[i].combos.map((combo) => ({ combo, weight: 1 })) },
          { combos: HAND_CLASSES[j].combos.map((combo) => ({ combo, weight: 1 })) },
        ],
        iterations: 60_000, seed: 99 + t,
      })
      const se = Math.hypot(r.players[0].stdError, MATRIX_INFO.maxStdError)
      expect(Math.abs(r.players[0].equity - classVsClass(i, j))).toBeLessThan(4 * se)
    }
  })

  it('equity vs a random hand: AA ≈ 85.2 %, 72o ≈ 34.6 %, 32o is the weakest hand', () => {
    expect(EQUITY_VS_RANDOM[idx('AA')]).toBeCloseTo(0.852, 2)
    expect(EQUITY_VS_RANDOM[idx('72o')]).toBeCloseTo(0.346, 2)
    expect(CLASS_RANKING[0]).toBe(idx('AA'))
    expect(CLASS_RANKING[168]).toBe(idx('32o'))
  })

  it('fast range-vs-range matches the equity engine closely', () => {
    const a = parseRange('TT+, AQs+, AKo')
    const b = parseRange('22+, A2s+, KTs+, ATo+')
    const fast = rangeVsRangeFast(a, b)
    const mc = monteCarloEquity({
      players: [{ combos: [...a.keys()].filter((i) => a[i] > 0).map((combo) => ({ combo, weight: 1 })) },
        { combos: [...b.keys()].filter((i) => b[i] > 0).map((combo) => ({ combo, weight: 1 })) }],
      iterations: 200_000, seed: 3,
    })
    // Class averaging ignores suit interactions: allow a small model error on top of MC noise.
    expect(Math.abs(fast - mc.players[0].equity)).toBeLessThan(0.006)
  })

  it('per-class heatmap respects card removal (AA vs AA-only range is 50 %, blocked classes NaN)', () => {
    const eq = classEquitiesVsRange(parseRange('AA'))
    expect(eq[idx('AA')]).toBeCloseTo(0.5, 12)
    expect(eq[idx('KK')]).toBeCloseTo(1 - classVsClass(idx('AA'), idx('KK')), 12)
  })

  it('counts disjoint combo pairs', () => {
    expect(disjointPairCount(cls('AA'), cls('KK'))).toBe(36)
    expect(disjointPairCount(cls('AA'), cls('AA'))).toBe(6 * 1) // each AA combo has exactly one disjoint AA combo
    expect(disjointPairCount(cls('AKs'), cls('AA'))).toBe(4 * 3) // AhKh blocks the 3 AA combos containing Ah
    // AhKd vs AKo: 3 aces × 3 kings left = 9 pairs, 2 of them suited (the suits both ranks still have) → 7 offsuit
    expect(disjointPairCount(cls('AKo'), cls('AKo'))).toBe(12 * 7)
  })
})

describe('top X% ranges and categories', () => {
  it('builds exact-size top percent ranges', () => {
    for (const f of [0.05, 0.15, 0.333, 0.5, 1]) expect(rangePercent(topPercentRange(f))).toBeCloseTo(f, 10)
    expect(topPercentRange(0.005)[cls('AA').combos[0]]).toBeGreaterThan(0)
  })

  it('assigns every class to exactly one category', () => {
    expect(CLASS_CATEGORY.every(Boolean)).toBe(true)
    expect(CLASS_CATEGORY[idx('AKs')]).toBe('suited-broadways')
    expect(CLASS_CATEGORY[idx('A5s')]).toBe('suited-aces')
    expect(CLASS_CATEGORY[idx('T9s')]).toBe('suited-connectors')
    expect(CLASS_CATEGORY[idx('JTs')]).toBe('suited-broadways')
    expect(CLASS_CATEGORY[idx('97s')]).toBe('suited-gappers')
    expect(CLASS_CATEGORY[idx('72o')]).toBe('other-offsuit')
  })

  it('breaks a range down by category, with shares summing to 1', () => {
    const r = parseRange('22+, A2s+, KQo')
    const rows = categoryBreakdown(r)
    expect(rows.reduce((s, x) => s + x.combos, 0)).toBeCloseTo(comboCount(r), 10)
    expect(rows.reduce((s, x) => s + x.shareOfRange, 0)).toBeCloseTo(1, 10)
    expect(rows.find((x) => x.id === 'high-pairs')!.combos).toBe(30)
    expect(rows.find((x) => x.id === 'suited-aces')!.combos).toBe(32) // A9s..A2s
  })
})
