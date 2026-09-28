import { describe, it, expect } from 'vitest'
import { NUM_COMBOS, HAND_CLASSES, handClassByLabel, comboIndex, comboCards, COMBO_CLASS } from '../combos'
import {
  parseRange, formatRange, comboCount, rangePercent, rangesEqual, fullRange, liveCombos,
  classComboCounts, foldProbabilityFromRange, emptyRange, RangeParseError,
} from '../range'
import { parseCards, parseCard } from '../cards'
import { binomial, pairCombos, unpairedCombos, totalStartingHands } from '../formulas'
import { createRng } from '../rng'

describe('combos', () => {
  it('has 1326 unique combos = C(52,2)', () => {
    expect(NUM_COMBOS).toBe(binomial(52, 2))
    expect(totalStartingHands.compute({ deck: 52 })).toBe(1326)
    const seen = new Set<string>()
    for (let i = 0; i < NUM_COMBOS; i++) {
      const [a, b] = comboCards(i)
      expect(a).not.toBe(b)
      expect(comboIndex(a, b)).toBe(i)
      expect(comboIndex(b, a)).toBe(i)
      seen.add([a, b].sort().join())
    }
    expect(seen.size).toBe(1326)
  })

  it('has 169 classes: 6 combos per pair, 4 suited, 12 offsuit', () => {
    expect(HAND_CLASSES).toHaveLength(169)
    const kinds = { pair: 0, suited: 0, offsuit: 0 }
    for (const h of HAND_CLASSES) {
      kinds[h.kind]++
      expect(h.combos).toHaveLength(h.kind === 'pair' ? 6 : h.kind === 'suited' ? 4 : 12)
      for (const c of h.combos) expect(COMBO_CLASS[c]).toBe(h.index)
    }
    expect(kinds).toEqual({ pair: 13, suited: 78, offsuit: 78 })
    expect(HAND_CLASSES.reduce((s, h) => s + h.combos.length, 0)).toBe(1326)
    expect(pairCombos.compute({ cardsLeft: 4 })).toBe(6)
    expect(unpairedCombos.compute({ highLeft: 4, lowLeft: 4, suitedPairsLeft: 4 })).toBe(16)
  })

  it('places suited hands above the diagonal', () => {
    expect(handClassByLabel('AKs')!.row).toBe(0)
    expect(handClassByLabel('AKs')!.col).toBe(1)
    expect(handClassByLabel('AKo')!.row).toBe(1)
    expect(handClassByLabel('AKo')!.col).toBe(0)
    expect(handClassByLabel('22')!.row).toBe(12)
  })
})

describe('range parsing', () => {
  const count = (s: string, dead = '') => comboCount(parseRange(s), dead ? parseCards(dead) : [])

  it('counts basic tokens', () => {
    expect(count('AA')).toBe(6)
    expect(count('AKs')).toBe(4)
    expect(count('AKo')).toBe(12)
    expect(count('AK')).toBe(16)
    expect(count('22+')).toBe(78)
    expect(count('A2s+')).toBe(48) // 12 classes × 4
    expect(count('KTo+')).toBe(36) // KTo KJo KQo
    expect(count('99-66')).toBe(24)
    expect(count('66-99')).toBe(24)
    expect(count('A5s-A2s')).toBe(16)
    expect(count('AhKh')).toBe(1)
    expect(count('any')).toBe(1326)
    expect(count('T9s+')).toBe(4) // "+" raises the kicker only: T9s is already the top kicker
  })

  it('reads weights', () => {
    expect(count('AKs:50%')).toBe(2)
    expect(count('AKs:0.25')).toBe(1)
    expect(count('AKs:75')).toBe(3)
    expect(count('AA, KK:50%')).toBe(9)
  })

  it('rejects bad input with readable errors', () => {
    expect(() => parseRange('AXs')).toThrow(RangeParseError)
    expect(() => parseRange('AKs:150%')).toThrow(RangeParseError)
    expect(() => parseRange('AKs-QJs')).toThrow(RangeParseError)
    expect(() => parseRange('AAs')).toThrow(RangeParseError)
  })

  it('computes % of hands', () => {
    expect(rangePercent(parseRange('22+'))).toBeCloseTo(78 / 1326, 12)
    expect(rangePercent(fullRange())).toBe(1)
  })
})

describe('card removal / blockers', () => {
  const count = (s: string, dead: string) => comboCount(parseRange(s), parseCards(dead))

  it('reduces pair combos to C(n,2)', () => {
    expect(count('AA', 'Ah')).toBe(3) // C(3,2)
    expect(count('AA', 'AhAd')).toBe(1) // C(2,2)
    expect(count('AA', 'AhAdAc')).toBe(0)
    expect(pairCombos.compute({ cardsLeft: 3 })).toBe(3)
  })

  it('reduces unpaired combos to a·b', () => {
    expect(count('AK', 'Ah')).toBe(12) // 3 × 4
    expect(count('AKs', 'Ah')).toBe(3)
    expect(count('AKo', 'Ah')).toBe(9)
    expect(count('AK', 'AsKd')).toBe(9) // 3 × 3
    expect(count('AKs', 'AsKd')).toBe(2) // hearts, clubs
    expect(count('AKo', 'AsKd')).toBe(7)
    expect(unpairedCombos.compute({ highLeft: 3, lowLeft: 3, suitedPairsLeft: 2 })).toBe(9)
  })

  it('removes combos from a full range: 1326 → C(50,2) with two dead cards', () => {
    expect(count('any', 'AhKh')).toBe(binomial(50, 2))
    expect(count('any', 'AhKhQh7c2d')).toBe(binomial(47, 2))
    expect(liveCombos(fullRange(), parseCards('AhKh'))).toHaveLength(1225)
  })

  it('reports per-class counts after removal', () => {
    const counts = classComboCounts(parseRange('AA, KQs'), parseCards('As Qh'))
    expect(counts[handClassByLabel('AA')!.index]).toBe(3)
    expect(counts[handClassByLabel('KQs')!.index]).toBe(3)
  })

  it('computes fold probability from a continue range with removal', () => {
    const villain = parseRange('AA, KK, QQ, AKs')
    const cont = parseRange('AA, KK')
    // No removal: 12 continue of 22
    expect(foldProbabilityFromRange(villain, cont)).toBeCloseTo(1 - 12 / 22, 12)
    // Ace on board: AA 3, KK 6, QQ 6, AKs 3 → continue 9 of 18
    expect(foldProbabilityFromRange(villain, cont, [parseCard('As')])).toBeCloseTo(0.5, 12)
  })
})

describe('range writing', () => {
  it('writes compact standard notation', () => {
    expect(formatRange(parseRange('22+'))).toBe('22+')
    expect(formatRange(parseRange('99-66'))).toBe('99-66')
    expect(formatRange(parseRange('A2s+'))).toBe('A2s+')
    expect(formatRange(parseRange('KTo+'))).toBe('KTo+')
    expect(formatRange(parseRange('ATs+, ATo+'))).toBe('AT+')
    expect(formatRange(parseRange('any'))).toBe('any')
    expect(formatRange(parseRange('AKs:50%'))).toBe('AKs:50%')
    expect(formatRange(emptyRange())).toBe('')
  })

  it('round-trips random weighted ranges exactly', () => {
    const rng = createRng(7)
    for (let t = 0; t < 200; t++) {
      const r = emptyRange()
      // random classes with random weights, plus some single combos
      for (const h of HAND_CLASSES) {
        if (rng.next() < 0.3) {
          const w = [1, 0.5, 0.25, 0.75, 0.33][rng.int(5)]
          for (const c of h.combos) r[c] = w
        }
      }
      for (let k = 0; k < 5; k++) r[rng.int(NUM_COMBOS)] = [1, 0.5][rng.int(2)]
      const text = formatRange(r)
      expect(rangesEqual(parseRange(text), r)).toBe(true)
    }
  })
})
