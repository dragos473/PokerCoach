/** Pick a range from the library (a chart layer) or type range notation. Shared by several modes. */
import { useMemo } from 'react'
import { useRanges } from '../../store/ranges'
import { FORMAT_LABELS, layerLabel, playedRange, type RangeChart } from './model'
import { parseRange, RangeParseError, type Weights } from '../../engine/range'
import { Segmented, TextInput } from '../../components/ui'
import { cx } from '../../lib/cx'

export type RangeSource =
  | { kind: 'chart'; chartId: string; layer: 'raise' | 'call' | 'played' }
  | { kind: 'text'; text: string }

export interface ResolvedRange {
  weights: Weights | null
  label: string
  error?: string
  chart?: RangeChart
}

export function resolveSource(src: RangeSource, charts: RangeChart[]): ResolvedRange {
  if (src.kind === 'text') {
    try {
      return { weights: parseRange(src.text), label: src.text || '(empty)' }
    } catch (e) {
      return { weights: null, label: src.text, error: e instanceof RangeParseError ? e.message : 'Invalid range' }
    }
  }
  const chart = charts.find((c) => c.id === src.chartId)
  if (!chart) return { weights: null, label: 'Missing chart', error: 'Chart not found' }
  const weights = src.layer === 'played' ? playedRange(chart) : chart.layers[src.layer]
  const layerName = src.layer === 'played' ? 'all played' : layerLabel(chart.scenario, src.layer)
  return { weights, label: `${chart.name} · ${layerName}`, chart }
}

export function useResolvedSource(src: RangeSource): ResolvedRange {
  const charts = useRanges((s) => s.charts)
  return useMemo(() => resolveSource(src, charts), [src, charts])
}

export function RangeSourcePicker({ value, onChange, className }: { value: RangeSource; onChange: (v: RangeSource) => void; className?: string }) {
  const charts = useRanges((s) => s.charts)
  const ensureComputed = useRanges((s) => s.ensureComputed)
  const groups = useMemo(() => {
    const m = new Map<string, RangeChart[]>()
    for (const c of charts) {
      const key = c.origin === 'custom' ? 'My ranges' : c.origin === 'computed' ? 'Computed push/fold' : FORMAT_LABELS[c.format]
      m.set(key, [...(m.get(key) ?? []), c])
    }
    return [...m.entries()]
  }, [charts])
  const resolved = resolveSource(value, charts)

  return (
    <div className={cx('flex flex-col gap-2', className)}>
      <Segmented size="sm" value={value.kind} onChange={(kind) => onChange(kind === 'text' ? { kind: 'text', text: resolved.weights ? '' : '' } : { kind: 'chart', chartId: charts[0].id, layer: 'raise' })}
        options={[{ value: 'chart', label: 'From library' }, { value: 'text', label: 'Notation' }]} />
      {value.kind === 'chart' ? (
        <div className="flex flex-wrap gap-2">
          <select value={value.chartId} className="h-9 min-w-0 flex-1 rounded-md border border-line bg-surface-2 px-2 text-sm"
            onChange={(e) => { onChange({ ...value, chartId: e.target.value }); void ensureComputed(e.target.value) }}>
            {groups.map(([g, list]) => (
              <optgroup key={g} label={g}>{list.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</optgroup>
            ))}
          </select>
          <select value={value.layer} className="h-9 rounded-md border border-line bg-surface-2 px-2 text-sm"
            onChange={(e) => onChange({ ...value, layer: e.target.value as 'raise' | 'call' | 'played' })}>
            <option value="raise">{resolved.chart ? layerLabel(resolved.chart.scenario, 'raise') : 'Raise'}</option>
            <option value="call">Call</option>
            <option value="played">All played</option>
          </select>
        </div>
      ) : (
        <TextInput value={value.text} onChange={(text) => onChange({ kind: 'text', text })} mono placeholder="e.g. 22+, A2s+, KTo+" invalid={!!resolved.error} />
      )}
      {resolved.error && <span className="text-xs text-bad">{resolved.error}</span>}
    </div>
  )
}
