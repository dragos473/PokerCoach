/**
 * Range charts in memory: layered weights (raise / call), conversion to and from storage,
 * and the built-in library. Pure TypeScript (no React), unit-tested.
 */
import { NUM_COMBOS, HAND_CLASSES } from '../../engine/combos'
import { emptyRange, parseRange, formatRange, type Weights } from '../../engine/range'
import type { RangeFormat, RangeScenario, SparseWeights, StoredRange } from '../../db/types'
import { BASELINE_CHARTS, COMPUTED_CHARTS, type BaselineChart, type ComputedChart } from '../../data/ranges/library'

export type LayerId = 'raise' | 'call'
export const LAYERS: LayerId[] = ['raise', 'call']

export interface RangeChart {
  id: string
  name: string
  tags: string[]
  format: RangeFormat
  scenario: RangeScenario
  position?: string
  vsPosition?: string
  stackBB?: number
  layers: Record<LayerId, Weights>
  assumptions?: string
  notes?: string
  /** 'baseline' = from library, 'computed' = solved by the engine, 'custom' = user-created. */
  origin: 'baseline' | 'computed' | 'custom'
  /** Baseline chart edited by the user (stored override exists). */
  modified: boolean
  createdAt: number
  updatedAt: number
}

export const FORMAT_LABELS: Record<RangeFormat, string> = {
  '6max-cash': '6-max cash',
  '9max-cash': '9-max cash',
  mtt: 'MTT',
  custom: 'Custom',
}

export const SCENARIO_LABELS: Record<RangeScenario, string> = {
  rfi: 'Raise first in',
  'vs-open': 'Facing an open',
  'vs-3bet': 'Facing a 3-bet',
  'bb-defence': 'BB defence',
  'push-fold': 'Push / fold',
  'call-shove': 'Calling a shove',
  custom: 'Custom',
}

/** Human label of a layer for a scenario ("Open", "3-bet", "4-bet", "Shove", "Call"). */
export function layerLabel(scenario: RangeScenario, layer: LayerId | 'fold'): string {
  if (layer === 'fold') return 'Fold'
  if (layer === 'call') return 'Call'
  switch (scenario) {
    case 'rfi': return 'Open'
    case 'vs-open':
    case 'bb-defence': return '3-bet'
    case 'vs-3bet': return '4-bet'
    case 'push-fold': return 'Shove'
    case 'call-shove': return 'Call'
    default: return 'Raise'
  }
}

/** Short human description of the spot, used by the drill. */
export function describeSpot(c: RangeChart): string {
  const pos = c.position ?? 'You'
  const vs = c.vsPosition
  switch (c.scenario) {
    case 'rfi': return `Folded to you in the ${pos}. Open or fold?`
    case 'vs-open': return `${vs} opens. You are in the ${pos}.`
    case 'bb-defence': return `${vs} opens. You are in the big blind.`
    case 'vs-3bet': return `You opened from the ${pos}; ${vs} 3-bets.`
    case 'push-fold': return `Heads-up, ${c.stackBB} bb effective. You are in the SB: shove or fold?`
    case 'call-shove': return `Heads-up, ${c.stackBB} bb effective. SB shoves; you are in the BB.`
    default: return c.name
  }
}

/** Clamp so that raise + call <= 1 for every combo (call is reduced first). */
export function normalizeLayers(layers: Record<LayerId, Weights>): void {
  for (let i = 0; i < NUM_COMBOS; i++) {
    const r = Math.min(1, Math.max(0, layers.raise[i]))
    const c = Math.min(1 - r, Math.max(0, layers.call[i]))
    layers.raise[i] = r
    layers.call[i] = c
  }
}

export function layersFromNotation(raise: string, call?: string): Record<LayerId, Weights> {
  return { raise: parseRange(raise), call: call ? parseRange(call) : emptyRange() }
}

export function sumOverflow(layers: Record<LayerId, Weights>): number[] {
  const bad: number[] = []
  for (let i = 0; i < NUM_COMBOS; i++) if (layers.raise[i] + layers.call[i] > 1 + 1e-9) bad.push(i)
  return bad
}

export function toSparse(w: Weights): SparseWeights {
  const out: SparseWeights = []
  for (let i = 0; i < NUM_COMBOS; i++) if (w[i] > 0) out.push([i, w[i]])
  return out
}

export function fromSparse(s: SparseWeights | undefined): Weights {
  const w = emptyRange()
  for (const [i, v] of s ?? []) if (i >= 0 && i < NUM_COMBOS && Number.isFinite(v)) w[i] = Math.min(1, Math.max(0, v))
  return w
}

export function chartFromBaseline(b: BaselineChart): RangeChart {
  const layers = layersFromNotation(b.raise, b.call)
  normalizeLayers(layers)
  return {
    id: b.id, name: b.name, tags: [], format: b.format, scenario: b.scenario, position: b.position,
    vsPosition: b.vsPosition, stackBB: b.stackBB, layers, assumptions: b.assumptions,
    origin: 'baseline', modified: false, createdAt: 0, updatedAt: 0,
  }
}

/** Placeholder for a computed chart; layers are filled by the solver. */
export function chartFromComputed(c: ComputedChart): RangeChart {
  return {
    id: c.id, name: c.name, tags: ['computed'], format: c.format, scenario: c.scenario, position: c.position,
    vsPosition: c.vsPosition, stackBB: c.stackBB, layers: { raise: emptyRange(), call: emptyRange() },
    assumptions: c.assumptions, origin: 'computed', modified: false, createdAt: 0, updatedAt: 0,
  }
}

/** Per-class frequencies (e.g. push/fold solver output) → combo layer weights. */
export function classFreqToWeights(freq: ArrayLike<number>): Weights {
  const w = emptyRange()
  for (const cls of HAND_CLASSES) {
    const v = Math.min(1, Math.max(0, freq[cls.index]))
    // Round tiny fictitious-play residue to clean values (display only; < 0.5 % either way).
    const clean = v < 0.005 ? 0 : v > 0.995 ? 1 : v
    for (const c of cls.combos) w[c] = clean
  }
  return w
}

export function toStored(c: RangeChart): StoredRange {
  return {
    id: c.id, name: c.name, tags: c.tags, format: c.format, scenario: c.scenario, position: c.position,
    vsPosition: c.vsPosition, stackBB: c.stackBB,
    actions: { raise: toSparse(c.layers.raise), call: toSparse(c.layers.call) },
    assumptions: c.assumptions, notes: c.notes, builtIn: c.origin !== 'custom',
    derivedFrom: c.origin === 'baseline' ? c.id : undefined,
    createdAt: c.createdAt, updatedAt: c.updatedAt,
  }
}

export function fromStored(s: StoredRange): RangeChart {
  const layers = { raise: fromSparse(s.actions.raise), call: fromSparse(s.actions.call) }
  normalizeLayers(layers)
  return {
    id: s.id, name: s.name, tags: s.tags ?? [], format: s.format, scenario: s.scenario, position: s.position,
    vsPosition: s.vsPosition, stackBB: s.stackBB, layers, assumptions: s.assumptions, notes: s.notes,
    origin: s.builtIn ? 'baseline' : 'custom', modified: !!s.builtIn,
    createdAt: s.createdAt, updatedAt: s.updatedAt,
  }
}

export function cloneChart(c: RangeChart): RangeChart {
  return { ...c, tags: [...c.tags], layers: { raise: new Float64Array(c.layers.raise), call: new Float64Array(c.layers.call) } }
}

/** Library: baselines (with stored overrides applied), computed placeholders and custom charts. */
export function buildLibrary(stored: StoredRange[]): RangeChart[] {
  const byId = new Map(stored.map((s) => [s.id, s]))
  const baselines = BASELINE_CHARTS.map((b) => {
    const o = byId.get(b.id)
    return o ? { ...fromStored(o), origin: 'baseline' as const, modified: true } : chartFromBaseline(b)
  })
  const computed = COMPUTED_CHARTS.map(chartFromComputed)
  const builtInIds = new Set([...BASELINE_CHARTS.map((b) => b.id), ...COMPUTED_CHARTS.map((c) => c.id)])
  const custom = stored.filter((s) => !builtInIds.has(s.id)).map((s) => ({ ...fromStored(s), origin: 'custom' as const, modified: false }))
  return [...baselines, ...computed, ...custom]
}

/** Notation text of each layer (for display / copy). */
export function layerNotation(c: RangeChart): Record<LayerId, string> {
  return { raise: formatRange(c.layers.raise), call: formatRange(c.layers.call) }
}

/** Combined "played" range: raise + call. */
export function playedRange(c: RangeChart): Weights {
  const w = emptyRange()
  for (let i = 0; i < NUM_COMBOS; i++) w[i] = Math.min(1, c.layers.raise[i] + c.layers.call[i])
  return w
}

// ---------------------------------------------------------------------------------------------
// Editing
// ---------------------------------------------------------------------------------------------
export type BrushTarget = LayerId | 'fold'

/**
 * Paint combos: set the target layer to `w` and shrink the other layer so raise + call <= 1.
 * 'fold' clears both layers.
 */
export function applyBrush(layers: Record<LayerId, Weights>, combos: number[], target: BrushTarget, w: number): void {
  const v = Math.min(1, Math.max(0, w))
  for (const c of combos) {
    if (target === 'fold') { layers.raise[c] = 0; layers.call[c] = 0; continue }
    const other: LayerId = target === 'raise' ? 'call' : 'raise'
    layers[target][c] = v
    layers[other][c] = Math.min(layers[other][c], 1 - v)
  }
}

/** True when every combo already has the target weight (used to make a stroke toggle off). */
export function brushIsNoop(layers: Record<LayerId, Weights>, combos: number[], target: BrushTarget, w: number): boolean {
  if (target === 'fold') return combos.every((c) => layers.raise[c] === 0 && layers.call[c] === 0)
  return combos.every((c) => Math.abs(layers[target][c] - w) < 1e-9)
}

export function cloneLayers(l: Record<LayerId, Weights>): Record<LayerId, Weights> {
  return { raise: new Float64Array(l.raise), call: new Float64Array(l.call) }
}

/** Class indices adjacent (8-neighbourhood) to a class with a different dominant action. */
export function borderlineClasses(layers: Record<LayerId, Weights>): Set<number> {
  const dominant = HAND_CLASSES.map((cls) => {
    const r = cls.combos.reduce((s, c) => s + layers.raise[c], 0) / cls.combos.length
    const k = cls.combos.reduce((s, c) => s + layers.call[c], 0) / cls.combos.length
    const f = 1 - r - k
    return r >= k && r >= f ? 'raise' : k >= f ? 'call' : 'fold'
  })
  const out = new Set<number>()
  for (const cls of HAND_CLASSES) {
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      const r = cls.row + dr, c = cls.col + dc
      if ((dr || dc) && r >= 0 && r < 13 && c >= 0 && c < 13 && dominant[r * 13 + c] !== dominant[cls.index]) out.add(cls.index)
    }
    // Mixed hands are always interesting
    const r = cls.combos.reduce((s, c) => s + layers.raise[c], 0) / cls.combos.length
    const k = cls.combos.reduce((s, c) => s + layers.call[c], 0) / cls.combos.length
    if ((r > 0.01 && r < 0.99) || (k > 0.01 && k < 0.99)) out.add(cls.index)
  }
  return out
}

/** Frequencies of each action for one combo. */
export function comboFrequencies(layers: Record<LayerId, Weights>, combo: number): { raise: number; call: number; fold: number } {
  const raise = layers.raise[combo]
  const call = layers.call[combo]
  return { raise, call, fold: Math.max(0, 1 - raise - call) }
}

/**
 * Drill grading: an answer is correct if it is the most frequent action for the combo, or if it is
 * played at least `mixedThreshold` of the time (mixed strategies).
 */
export function gradeAnswer(freq: { raise: number; call: number; fold: number }, answer: BrushTarget, mixedThreshold: number): boolean {
  const best = Math.max(freq.raise, freq.call, freq.fold)
  const f = freq[answer]
  return f >= best - 1e-9 || f >= mixedThreshold - 1e-9
}
