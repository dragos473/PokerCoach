/** Library of range charts: filter, open, create. */
import { useMemo, useState } from 'react'
import { useRanges } from '../../store/ranges'
import { FORMAT_LABELS, SCENARIO_LABELS, layerLabel, type RangeChart } from './model'
import { rangePercent } from '../../engine/range'
import { Badge, Button, PageHeader, Select, TextInput, EmptyState } from '../../components/ui'
import { RangesTabs } from './RangesTabs'
import { navigate } from '../../app/router'
import type { RangeFormat, RangeScenario } from '../../db/types'

type FormatFilter = RangeFormat | 'all'
type ScenarioFilter = RangeScenario | 'all'

export function RangeLibraryPage() {
  const charts = useRanges((s) => s.charts)
  const create = useRanges((s) => s.create)
  const [q, setQ] = useState('')
  const [format, setFormat] = useState<FormatFilter>('all')
  const [scenario, setScenario] = useState<ScenarioFilter>('all')

  const filtered = useMemo(() => charts.filter((c) =>
    (format === 'all' || c.format === format) &&
    (scenario === 'all' || c.scenario === scenario) &&
    (!q || `${c.name} ${c.position ?? ''} ${c.vsPosition ?? ''} ${c.tags.join(' ')}`.toLowerCase().includes(q.toLowerCase())),
  ), [charts, q, format, scenario])

  const groups = useMemo(() => {
    const m = new Map<string, RangeChart[]>()
    for (const c of filtered) {
      const key = c.origin === 'custom' ? 'My ranges' : c.origin === 'computed' ? 'Computed: heads-up push / fold' : `${FORMAT_LABELS[c.format]} · ${SCENARIO_LABELS[c.scenario]}`
      m.set(key, [...(m.get(key) ?? []), c])
    }
    return [...m.entries()].sort((a, b) => (a[0] === 'My ranges' ? -1 : b[0] === 'My ranges' ? 1 : 0))
  }, [filtered])

  return (
    <div>
      <PageHeader title="Preflop ranges" subtitle="Built-in charts are approximate baselines with stated assumptions. Everything is editable; your edits are saved as overrides."
        actions={<Button variant="primary" onClick={async () => navigate(`/ranges/${(await create()).id}`)}>+ New range</Button>} />
      <RangesTabs path="/ranges" />
      <div className="mb-4 flex flex-wrap gap-2">
        <TextInput value={q} onChange={setQ} placeholder="Search…" className="w-48" />
        <Select<FormatFilter> value={format} onChange={setFormat} options={[{ value: 'all', label: 'All formats' }, ...Object.entries(FORMAT_LABELS).map(([value, label]) => ({ value: value as RangeFormat, label }))]} />
        <Select<ScenarioFilter> value={scenario} onChange={setScenario} options={[{ value: 'all', label: 'All spots' }, ...Object.entries(SCENARIO_LABELS).map(([value, label]) => ({ value: value as RangeScenario, label }))]} />
      </div>
      {groups.length === 0 && <EmptyState title="No ranges match">Try clearing the filters.</EmptyState>}
      <div className="space-y-6">
        {groups.map(([title, list]) => (
          <section key={title}>
            <h2 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted">{title}</h2>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {list.map((c) => {
                const raise = rangePercent(c.layers.raise)
                const call = rangePercent(c.layers.call)
                return (
                  <a key={c.id} href={`#/ranges/${encodeURIComponent(c.id)}`} className="rounded-lg border border-line bg-surface p-3 transition-ui hover:border-muted/50">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-sm font-medium">{c.name}</span>
                      <span className="flex gap-1">
                        {c.modified && <Badge tone="warn">edited</Badge>}
                        {c.origin === 'computed' && <Badge tone="info">computed</Badge>}
                        {c.origin === 'custom' && <Badge>custom</Badge>}
                      </span>
                    </div>
                    <div className="mt-2 flex gap-3 font-mono text-xs tabular text-muted">
                      {c.origin === 'computed' && c.updatedAt === 0 ? <span>solved when opened</span> : (
                        <>
                          {raise > 0 && <span><span className="inline-block h-2 w-2 rounded-sm bg-raise" /> {layerLabel(c.scenario, 'raise')} {(raise * 100).toFixed(1)}%</span>}
                          {call > 0 && <span><span className="inline-block h-2 w-2 rounded-sm bg-call" /> Call {(call * 100).toFixed(1)}%</span>}
                        </>
                      )}
                    </div>
                  </a>
                )
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
