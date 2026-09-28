import { describe, it, expect } from 'vitest'
import { classifyHand, strengthTable } from './handStrength'
import { parseCards } from '../cards'
import { comboIndex } from '../combos'

const cls = (h: string, b: string) => classifyHand(parseCards(h), parseCards(b))

describe('hand classification', () => {
  it('classifies made hands relative to the board', () => {
    expect(cls('AsKd', 'Kc7h2s').made).toBe('top-pair')
    expect(cls('7s6s', 'Kc7h2s').made).toBe('middle-pair')
    expect(cls('2d3d', 'Kc7h2s').made).toBe('weak-pair')
    expect(cls('AhAd', 'Kc7h2s').made).toBe('overpair')
    expect(cls('7d7c', 'Kc7h2s').made).toBe('set')
    expect(cls('Ks7d', 'Kc7h2s').made).toBe('two-pair')
    expect(cls('AsQd', 'Kc7h7s').made).toBe('no-pair') // board pair is not ours
    expect(cls('7d8d', 'Kc7h7s').made).toBe('trips')
    expect(cls('9h8h', 'Th7h2s6c').made).toBe('straight')
    expect(cls('AhQh', 'Kh7h2h').made).toBe('flush')
  })

  it('finds draws', () => {
    const fd = cls('AhKh', '7h8h2c')
    expect(fd.flushDraw).toBe(true)
    expect(fd.group).toBe('strong-draws')
    expect(cls('JhTd', '9s8c2h').straightDraw).toBe('oesd')
    expect(cls('JhTd', '9s7c2h').straightDraw).toBe('gutshot')
    expect(cls('JhTd', '9s7c2h').group).toBe('weak-draws')
    expect(cls('AhKh', '7h8h2c9s3d').flushDraw).toBe(false) // no draws on the river
  })
})

describe('strength table', () => {
  it('ranks the nuts at the top and assigns NaN to blocked combos', () => {
    const board = parseCards('Kc7h2s')
    const t = strengthTable(board)
    const sets = t.hs[comboIndex(parseCards('Kd')[0], parseCards('Kh')[0])]
    const air = t.hs[comboIndex(parseCards('4d')[0], parseCards('3c')[0])]
    expect(sets).toBeGreaterThan(0.99)
    expect(air).toBeLessThan(0.3)
    expect(Number.isNaN(t.hs[comboIndex(board[0], parseCards('Ad')[0])])).toBe(true)
    // A flush draw gains potential
    const fd = comboIndex(parseCards('5h')[0], parseCards('6h')[0])
    const t2 = strengthTable(parseCards('7h8h2c'))
    expect(t2.ppot[fd]).toBeGreaterThan(0.5)
    expect(t2.ehs[fd]).toBeGreaterThan(t2.hs[fd])
  })
})
