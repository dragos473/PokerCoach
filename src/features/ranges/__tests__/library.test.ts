import { describe, it, expect } from 'vitest'
import { BASELINE_CHARTS, COMPUTED_CHARTS } from '../../../data/ranges/library'
import { layersFromNotation, sumOverflow, buildLibrary, toStored, fromStored, chartFromBaseline, playedRange } from '../model'
import { rangePercent, rangesEqual } from '../../../engine/range'

describe('built-in range library', () => {
  it('has unique ids and parses every chart', () => {
    const ids = [...BASELINE_CHARTS, ...COMPUTED_CHARTS].map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const c of BASELINE_CHARTS) {
      expect(() => layersFromNotation(c.raise, c.call), c.id).not.toThrow()
      expect(c.assumptions.length).toBeGreaterThan(40)
    }
  })

  it('never has raise + call above 100 % for a combo', () => {
    for (const c of BASELINE_CHARTS) {
      expect(sumOverflow(layersFromNotation(c.raise, c.call)), c.id).toEqual([])
    }
  })

  it('opening ranges widen from early to late position (sanity check)', () => {
    const pct = (id: string) => rangePercent(chartFromBaseline(BASELINE_CHARTS.find((c) => c.id === id)!).layers.raise)
    const six = ['c6-rfi-utg', 'c6-rfi-hj', 'c6-rfi-co', 'c6-rfi-btn'].map(pct)
    for (let i = 1; i < six.length; i++) expect(six[i]).toBeGreaterThan(six[i - 1])
    const nine = ['c9-rfi-utg', 'c9-rfi-utg1', 'c9-rfi-utg2', 'c9-rfi-lj', 'c9-rfi-hj', 'c9-rfi-co', 'c9-rfi-btn'].map(pct)
    for (let i = 1; i < nine.length; i++) expect(nine[i]).toBeGreaterThan(nine[i - 1])
    const mtt = ['mtt40-rfi-utg', 'mtt40-rfi-utg1', 'mtt40-rfi-lj', 'mtt40-rfi-hj', 'mtt40-rfi-co', 'mtt40-rfi-btn'].map(pct)
    for (let i = 1; i < mtt.length; i++) expect(mtt[i]).toBeGreaterThan(mtt[i - 1])
  })

  it('round-trips charts through storage exactly', () => {
    for (const b of BASELINE_CHARTS) {
      const c = chartFromBaseline(b)
      const back = fromStored(JSON.parse(JSON.stringify(toStored(c))))
      expect(rangesEqual(back.layers.raise, c.layers.raise, 0)).toBe(true)
      expect(rangesEqual(back.layers.call, c.layers.call, 0)).toBe(true)
    }
  })

  it('applies stored overrides to baselines and keeps custom charts', () => {
    const edited = chartFromBaseline(BASELINE_CHARTS[0])
    edited.layers.raise.fill(0)
    const custom = { ...chartFromBaseline(BASELINE_CHARTS[1]), id: 'mine', origin: 'custom' as const }
    const lib = buildLibrary([toStored(edited), { ...toStored(custom), builtIn: false }])
    const first = lib.find((c) => c.id === BASELINE_CHARTS[0].id)!
    expect(first.modified).toBe(true)
    expect(rangePercent(first.layers.raise)).toBe(0)
    expect(lib.find((c) => c.id === 'mine')!.origin).toBe('custom')
    expect(lib.length).toBe(BASELINE_CHARTS.length + COMPUTED_CHARTS.length + 1)
    expect(rangePercent(playedRange(first))).toBeGreaterThanOrEqual(0)
  })
})


import { applyBrush, brushIsNoop, gradeAnswer, borderlineClasses } from '../model'
import { emptyRange } from '../../../engine/range'
import { handClassByLabel } from '../../../engine/combos'

describe('range editing', () => {
  const AKs = handClassByLabel('AKs')!.combos
  it('paints layers keeping raise + call <= 1', () => {
    const l = { raise: emptyRange(), call: emptyRange() }
    applyBrush(l, AKs, 'call', 1)
    applyBrush(l, AKs, 'raise', 0.75)
    expect(l.raise[AKs[0]]).toBe(0.75)
    expect(l.call[AKs[0]]).toBe(0.25)
    expect(brushIsNoop(l, AKs, 'raise', 0.75)).toBe(true)
    applyBrush(l, AKs, 'fold', 1)
    expect(l.raise[AKs[0]] + l.call[AKs[0]]).toBe(0)
  })

  it('grades drill answers with mixed strategies', () => {
    expect(gradeAnswer({ raise: 1, call: 0, fold: 0 }, 'raise', 0.25)).toBe(true)
    expect(gradeAnswer({ raise: 1, call: 0, fold: 0 }, 'fold', 0.25)).toBe(false)
    expect(gradeAnswer({ raise: 0.3, call: 0, fold: 0.7 }, 'raise', 0.25)).toBe(true)
    expect(gradeAnswer({ raise: 0.2, call: 0, fold: 0.8 }, 'raise', 0.25)).toBe(false)
  })

  it('finds borderline classes at the edge of a range', () => {
    const l = { raise: emptyRange(), call: emptyRange() }
    applyBrush(l, handClassByLabel('AA')!.combos, 'raise', 1)
    const b = borderlineClasses(l)
    expect(b.has(handClassByLabel('AA')!.index)).toBe(true)
    expect(b.has(handClassByLabel('AKs')!.index)).toBe(true)
    expect(b.has(handClassByLabel('72o')!.index)).toBe(false)
  })
})
