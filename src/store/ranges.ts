/**
 * Range library store: built-in baselines (+ user overrides), computed push/fold charts
 * (solved lazily in the engine worker) and custom charts. Persists to IndexedDB.
 */
import { create } from 'zustand'
import { getDb } from '../db/db'
import {
  buildLibrary, chartFromBaseline, classFreqToWeights, cloneChart, toStored, type RangeChart,
} from '../features/ranges/model'
import { BASELINE_CHARTS, COMPUTED_CHARTS } from '../data/ranges/library'
import { emptyRange } from '../engine/range'
import { uid } from '../lib/format'
import { EngineClient } from '../engine/worker/client'

interface RangesState {
  charts: RangeChart[]
  loaded: boolean
  /** Computed chart ids currently being solved. */
  solving: Set<string>
  load: () => Promise<void>
  get: (id: string) => RangeChart | undefined
  save: (chart: RangeChart) => Promise<void>
  create: (partial?: Partial<RangeChart>) => Promise<RangeChart>
  duplicate: (id: string) => Promise<RangeChart>
  remove: (id: string) => Promise<void>
  restoreBaseline: (id: string) => Promise<void>
  ensureComputed: (id: string) => Promise<void>
}

let solverClient: EngineClient | null = null

export const useRanges = create<RangesState>((set, get) => ({
  charts: buildLibrary([]),
  loaded: false,
  solving: new Set(),

  load: async () => {
    try {
      const stored = await getDb().ranges.toArray()
      const prev = get().charts
      const next = buildLibrary(stored).map((c) => {
        // Keep solved computed charts across reloads of the library.
        const old = prev.find((p) => p.id === c.id && p.origin === 'computed')
        return old ?? c
      })
      set({ charts: next, loaded: true })
    } catch (e) {
      console.error('Loading ranges failed', e)
      set({ loaded: true })
    }
  },

  get: (id) => get().charts.find((c) => c.id === id),

  save: async (chart) => {
    if (chart.origin === 'computed') throw new Error('Computed charts are read-only; duplicate to edit')
    const now = Date.now()
    const next: RangeChart = { ...cloneChart(chart), updatedAt: now, createdAt: chart.createdAt || now, modified: chart.origin === 'baseline' }
    await getDb().ranges.put(toStored(next))
    set({ charts: get().charts.map((c) => (c.id === chart.id ? next : c)).concat(get().charts.some((c) => c.id === chart.id) ? [] : [next]) })
  },

  create: async (partial = {}) => {
    const now = Date.now()
    const chart: RangeChart = {
      id: uid(), name: 'New range', tags: [], format: 'custom', scenario: 'custom',
      layers: { raise: emptyRange(), call: emptyRange() }, origin: 'custom', modified: false,
      createdAt: now, updatedAt: now, ...partial,
    }
    await getDb().ranges.put(toStored(chart))
    set({ charts: [...get().charts, chart] })
    return chart
  },

  duplicate: async (id) => {
    const src = get().get(id)
    if (!src) throw new Error('Range not found')
    const now = Date.now()
    const copy: RangeChart = { ...cloneChart(src), id: uid(), name: `${src.name} (copy)`, origin: 'custom', modified: false, createdAt: now, updatedAt: now }
    await getDb().ranges.put(toStored(copy))
    set({ charts: [...get().charts, copy] })
    return copy
  },

  remove: async (id) => {
    const c = get().get(id)
    if (!c || c.origin !== 'custom') throw new Error('Only custom ranges can be deleted')
    await getDb().ranges.delete(id)
    set({ charts: get().charts.filter((x) => x.id !== id) })
  },

  restoreBaseline: async (id) => {
    const b = BASELINE_CHARTS.find((x) => x.id === id)
    if (!b) return
    await getDb().ranges.delete(id)
    set({ charts: get().charts.map((c) => (c.id === id ? chartFromBaseline(b) : c)) })
  },

  ensureComputed: async (id) => {
    const def = COMPUTED_CHARTS.find((c) => c.id === id)
    const current = get().get(id)
    if (!def || !current || current.updatedAt > 0 || get().solving.has(id)) return
    set({ solving: new Set(get().solving).add(id) })
    try {
      solverClient ??= new EngineClient()
      const res = await solverClient.pushFold({ stackBB: def.stackBB, ante: def.ante })
      const freq = def.side === 'sb-push' ? res.push : res.call
      const solved: RangeChart = {
        ...current,
        layers: def.side === 'sb-push'
          ? { raise: classFreqToWeights(freq), call: emptyRange() }
          : { raise: emptyRange(), call: classFreqToWeights(freq) },
        notes: `Equilibrium check: exploitability ${res.exploitability.toFixed(4)} bb/hand after ${res.iterations} iterations. ` +
          `BB needs ${(res.bbRequiredEquity * 100).toFixed(1)} % equity to call. SB game value ${res.sbGameValue.toFixed(3)} bb/hand.`,
        updatedAt: Date.now(),
      }
      set({ charts: get().charts.map((c) => (c.id === id ? solved : c)) })
    } finally {
      const s = new Set(get().solving)
      s.delete(id)
      set({ solving: s })
    }
  },
}))

export { BASELINE_CHARTS }
