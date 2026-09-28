import { describe, it, expect } from 'vitest'
import { solvePushFold, classPairCounts } from '../pushfold'
import { handClassByLabel, HAND_CLASSES } from '../combos'

const idx = (l: string) => handClassByLabel(l)!.index
/** Share of all 1326 combos in a per-class frequency vector. */
const share = (f: Float64Array) => HAND_CLASSES.reduce((s, c) => s + f[c.index] * c.combos.length, 0) / 1326

describe('heads-up push/fold solver', () => {
  it('pair counts are symmetric and total C(52,2)·C(50,2)', () => {
    const n = classPairCounts()
    let tot = 0
    for (let i = 0; i < 169; i++) for (let j = 0; j < 169; j++) { tot += n[i * 169 + j]; expect(n[i * 169 + j]).toBe(n[j * 169 + i]) }
    expect(tot).toBe(1326 * 1225)
  })

  it('10 bb without ante: SB shoves ≈ 58 %, BB calls ≈ 37 % (known HU Nash figures), low exploitability', () => {
    const t0 = performance.now()
    const r = solvePushFold({ stackBB: 10, ante: 0 })
    const ms = performance.now() - t0
    expect(share(r.push)).toBeGreaterThan(0.54)
    expect(share(r.push)).toBeLessThan(0.62)
    expect(share(r.call)).toBeGreaterThan(0.33)
    expect(share(r.call)).toBeLessThan(0.41)
    expect(r.exploitability).toBeLessThan(0.01)
    expect(r.push[idx('AA')]).toBe(1)
    expect(r.call[idx('AA')]).toBe(1)
    expect(r.bbRequiredEquity).toBeCloseTo(9 / 20, 12)
    expect(ms).toBeLessThan(5000)
  })

  it('ranges tighten as stacks get deeper and widen with antes', () => {
    const s8 = share(solvePushFold({ stackBB: 8 }).push)
    const s15 = share(solvePushFold({ stackBB: 15 }).push)
    expect(s8).toBeGreaterThan(s15)
    const withAnte = share(solvePushFold({ stackBB: 10, ante: 0.125 }).push)
    const noAnte = share(solvePushFold({ stackBB: 10, ante: 0 }).push)
    expect(withAnte).toBeGreaterThan(noAnte)
  })
})
