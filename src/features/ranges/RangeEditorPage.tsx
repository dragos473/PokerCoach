/** Range chart editor: paint layers on the 13x13 grid, per-combo weights, stats, heatmap. */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRanges } from '../../store/ranges'
import { useSettings } from '../../store/settings'
import {
  applyBrush, brushIsNoop, cloneLayers, layerLabel, layerNotation, normalizeLayers, playedRange,
  FORMAT_LABELS, SCENARIO_LABELS, type BrushTarget, type LayerId, type RangeChart,
} from './model'
import { RangeGrid, GridLegend } from '../../components/RangeGrid'
import { Badge, Button, EmptyState, ErrorNote, NumberInput, PageHeader, Panel, Segmented, Select, Slider, Spinner, TextInput } from '../../components/ui'
import { PlayingCard } from '../../components/PlayingCard'
import { HAND_CLASSES, comboCards, type HandClass } from '../../engine/combos'
import { parseRange, rangePercent, RangeParseError, type Weights } from '../../engine/range'
import { classEquitiesVsRange, topPercentRange } from '../../engine/preflop'
import { useHotkeys } from '../../hotkeys/useHotkeys'
import { navigate } from '../../app/router'
import { CategoryTable, EquityVsPanel, LayerSummary, StatLayerSwitch, type StatLayer } from './RangeStats'
import { useResolvedSource, type RangeSource } from './RangeSourcePicker'
import { RangesTabs } from './RangesTabs'
import type { RangeFormat, RangeScenario } from '../../db/types'
import { fmtPct } from '../../lib/format'

type Tool = 'paint' | 'inspect'

const PRESETS: { id: string; label: string; test: (c: HandClass) => boolean }[] = [
  { id: 'pairs', label: 'All pairs', test: (c) => c.kind === 'pair' },
  { id: 'suited', label: 'All suited', test: (c) => c.kind === 'suited' },
  { id: 'offsuit', label: 'All offsuit', test: (c) => c.kind === 'offsuit' },
  { id: 'broadway', label: 'Broadways', test: (c) => c.low >= 8 },
  { id: 'aces', label: 'Any ace', test: (c) => c.high === 12 },
  { id: 'sc', label: 'Suited connectors', test: (c) => c.kind === 'suited' && c.high - c.low === 1 },
]

export function RangeEditorPage({ id }: { id: string }) {
  const chart = useRanges((s) => s.charts.find((c) => c.id === id))
  const loaded = useRanges((s) => s.loaded)
  const ensureComputed = useRanges((s) => s.ensureComputed)
  const solving = useRanges((s) => s.solving.has(id))
  useEffect(() => { void ensureComputed(id) }, [id, ensureComputed])

  if (!chart) return loaded ? <EmptyState title="Range not found" action={<a href="#/ranges" className="text-info underline">Back to the library</a>} /> : <Spinner />
  if (chart.origin === 'computed' && chart.updatedAt === 0) {
    return (
      <div className="flex items-center gap-3 text-muted"><Spinner /> {solving ? 'Solving the push/fold equilibrium in the engine…' : 'Preparing…'}</div>
    )
  }
  return <Editor key={`${chart.id}:${chart.updatedAt}`} chart={chart} />
}

function Editor({ chart }: { chart: RangeChart }) {
  const { save, duplicate, remove, restoreBaseline } = useRanges()
  const settings = useSettings((s) => s.settings)
  const readOnly = chart.origin === 'computed'

  const [draft, setDraft] = useState<RangeChart>(() => ({ ...chart, layers: cloneLayers(chart.layers) }))
  const [dirty, setDirty] = useState(false)
  const history = useRef<{ past: Record<LayerId, Weights>[]; future: Record<LayerId, Weights>[] }>({ past: [], future: [] })
  const [, force] = useState(0)

  const [tool, setTool] = useState<Tool>('paint')
  const [brush, setBrush] = useState<BrushTarget>('raise')
  const [weight, setWeight] = useState(settings.ranges.paintWeight)
  const [inspect, setInspect] = useState<number | null>(null)
  const [hover, setHover] = useState<number | null>(null)
  const [heatmapOn, setHeatmapOn] = useState(false)
  const [statLayer, setStatLayer] = useState<StatLayer>('played')
  const [opponentSrc, setOpponentSrc] = useState<RangeSource>({ kind: 'text', text: settings.ranges.heatmapOpponent })
  const opponent = useResolvedSource(opponentSrc)
  const [error, setError] = useState('')
  const stroke = useRef<{ target: BrushTarget; w: number } | null>(null)

  const commit = useCallback((mutate: (l: Record<LayerId, Weights>) => void) => {
    setDraft((d) => {
      history.current.past.push(cloneLayers(d.layers))
      if (history.current.past.length > 200) history.current.past.shift()
      history.current.future = []
      const layers = cloneLayers(d.layers)
      mutate(layers)
      normalizeLayers(layers)
      return { ...d, layers }
    })
    setDirty(true)
  }, [])

  const undo = () => {
    const prev = history.current.past.pop()
    if (!prev) return
    setDraft((d) => { history.current.future.push(cloneLayers(d.layers)); return { ...d, layers: prev } })
    setDirty(true); force((x) => x + 1)
  }
  const redo = () => {
    const next = history.current.future.pop()
    if (!next) return
    setDraft((d) => { history.current.past.push(cloneLayers(d.layers)); return { ...d, layers: next } })
    setDirty(true); force((x) => x + 1)
  }
  useHotkeys({ 'grid.undo': readOnly ? undefined : undo, 'grid.redo': readOnly ? undefined : redo })

  const onStroke = (idx: number, phase: 'start' | 'move') => {
    if (readOnly || tool !== 'paint') return
    const combos = HAND_CLASSES[idx].combos
    const w = weight / 100
    if (phase === 'start') {
      // Clicking a cell that already has exactly this brush toggles it off for the whole stroke.
      const noop = brushIsNoop(draft.layers, combos, brush, w)
      stroke.current = noop && brush !== 'fold' ? { target: brush, w: 0 } : { target: brush, w }
      commit((l) => applyBrush(l, combos, stroke.current!.target, stroke.current!.w))
    } else if (stroke.current) {
      setDraft((d) => {
        const layers = cloneLayers(d.layers)
        applyBrush(layers, combos, stroke.current!.target, stroke.current!.w)
        return { ...d, layers }
      })
    }
  }

  const gridLayers = useMemo(() => [
    { id: 'raise', weights: draft.layers.raise, color: 'var(--c-raise)' },
    { id: 'call', weights: draft.layers.call, color: 'var(--c-call)' },
  ], [draft.layers])

  const statWeights = useMemo(() => (statLayer === 'played' ? playedRange(draft) : draft.layers[statLayer]), [draft, statLayer])
  const heatmap = useMemo(() => (heatmapOn && opponent.weights ? classEquitiesVsRange(opponent.weights) : null), [heatmapOn, opponent.weights])
  const notation = useMemo(() => layerNotation(draft), [draft])
  const focus = inspect ?? hover

  const doSave = async () => {
    setError('')
    try { await save(draft); setDirty(false) } catch (e) { setError(String(e)) }
  }

  return (
    <div>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            {readOnly ? chart.name : <TextInput value={draft.name} onChange={(name) => { setDraft({ ...draft, name }); setDirty(true) }} className="h-9 w-72 text-base font-semibold" />}
            {chart.origin === 'baseline' && <Badge tone="warn">approximate baseline</Badge>}
            {chart.modified && <Badge tone="warn">edited</Badge>}
            {chart.origin === 'computed' && <Badge tone="info">computed</Badge>}
            {dirty && <Badge tone="info">unsaved</Badge>}
          </span>
        }
        subtitle={`${FORMAT_LABELS[draft.format]} · ${SCENARIO_LABELS[draft.scenario]}${draft.position ? ` · ${draft.position}` : ''}${draft.vsPosition ? ` vs ${draft.vsPosition}` : ''}${draft.stackBB ? ` · ${draft.stackBB} bb` : ''}`}
        actions={
          <>
            {!readOnly && <Button variant="primary" onClick={doSave} disabled={!dirty}>Save</Button>}
            {!readOnly && dirty && <Button onClick={() => { setDraft({ ...chart, layers: cloneLayers(chart.layers) }); setDirty(false); history.current = { past: [], future: [] } }}>Discard</Button>}
            <Button onClick={async () => navigate(`/ranges/${(await duplicate(chart.id)).id}`)}>Duplicate</Button>
            {chart.origin === 'baseline' && chart.modified && <Button onClick={() => confirm('Restore the original baseline chart? Your edits are lost.') && restoreBaseline(chart.id)}>Restore baseline</Button>}
            {chart.origin === 'custom' && <Button variant="danger" onClick={async () => { if (confirm(`Delete "${chart.name}"?`)) { await remove(chart.id); navigate('/ranges') } }}>Delete</Button>}
          </>
        }
      />
      <RangesTabs path="/ranges" />
      {error && <div className="mb-3"><ErrorNote>{error}</ErrorNote></div>}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,34rem)_minmax(0,1fr)]">
        <div className="space-y-3">
          <RangeGrid
            layers={gridLayers}
            heatmap={heatmap}
            onStroke={!readOnly && tool === 'paint' ? onStroke : undefined}
            onCellClick={(i) => { if (tool === 'inspect' || readOnly) setInspect(i) }}
            onHover={setHover}
            selected={inspect}
            showCombos={settings.ranges.showComboCounts}
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <GridLegend items={heatmap ? [
              { color: 'var(--c-bad)', label: 'weaker' }, { color: 'var(--c-good)', label: 'stronger' },
            ] : [
              { color: 'var(--c-raise)', label: layerLabel(draft.scenario, 'raise'), value: fmtPct(rangePercent(draft.layers.raise), 1) },
              { color: 'var(--c-call)', label: 'Call', value: fmtPct(rangePercent(draft.layers.call), 1) },
              { color: 'var(--c-surface-2)', label: 'Fold' },
            ]} />
            <label className="flex items-center gap-2 text-xs text-muted">
              <input type="checkbox" checked={heatmapOn} onChange={(e) => setHeatmapOn(e.target.checked)} /> Equity heatmap vs opponent
            </label>
          </div>
          {heatmapOn && <p className="text-xs text-muted">Each cell: all-in equity of that hand vs <span className="font-mono">{opponent.label}</span> (fast matrix estimate, card removal applied). Opponent is set in the Stats panel.</p>}

          {!readOnly && (
            <Panel dense>
              <div className="flex flex-wrap items-center gap-3">
                <Segmented size="sm" value={tool} onChange={setTool} options={[{ value: 'paint', label: 'Paint' }, { value: 'inspect', label: 'Combos' }]} />
                <Segmented size="sm" value={brush} onChange={setBrush} options={[
                  { value: 'raise', label: <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-raise" />{layerLabel(draft.scenario, 'raise')}</span> },
                  { value: 'call', label: <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-call" />Call</span> },
                  { value: 'fold', label: 'Erase' },
                ]} />
                {brush !== 'fold' && <Slider value={weight} min={0} max={100} step={5} onChange={setWeight} format={(v) => `${v}%`} label="Brush weight" />}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button size="sm" onClick={undo} disabled={!history.current.past.length}>Undo</Button>
                <Button size="sm" onClick={redo} disabled={!history.current.future.length}>Redo</Button>
                <Select value="" onChange={(v) => {
                  const p = PRESETS.find((x) => x.id === v)
                  if (p) commit((l) => applyBrush(l, HAND_CLASSES.filter(p.test).flatMap((c) => c.combos), brush, brush === 'fold' ? 0 : weight / 100))
                }} options={[{ value: '', label: 'Paint a group…' }, ...PRESETS.map((p) => ({ value: p.id, label: p.label }))]} className="h-7 text-xs" />
                <TopPercent onApply={(f) => commit((l) => {
                  const top = topPercentRange(f)
                  const target: LayerId = brush === 'call' ? 'call' : 'raise'
                  l[target].set(top)
                })} />
                <Button size="sm" variant="ghost" onClick={() => commit((l) => { l.raise.fill(0); l.call.fill(0) })}>Clear all</Button>
              </div>
              <p className="mt-2 text-xs text-muted">Click or drag to paint. Clicking a cell that already has this brush removes it. Use “Combos” to set individual combo weights.</p>
            </Panel>
          )}
        </div>

        <div className="min-w-0 space-y-4">
          {focus !== null && (
            <ComboInspector cls={HAND_CLASSES[focus]} layers={draft.layers} scenario={draft.scenario} readOnly={readOnly || inspect === null}
              onChange={(combo, layer, w) => commit((l) => applyBrush(l, [combo], layer, w))} onClose={() => setInspect(null)} pinned={inspect !== null} />
          )}
          <Panel title="Stats" actions={<StatLayerSwitch value={statLayer} onChange={setStatLayer} scenario={draft.scenario} />}>
            <LayerSummary layers={draft.layers} scenario={draft.scenario} />
            <h3 className="mb-1 mt-4 text-xs uppercase tracking-wider text-muted">Hand categories</h3>
            <CategoryTable weights={statWeights} />
          </Panel>
          <Panel title="Equity vs opponent range">
            <EquityVsPanel hero={statWeights} heroLabel={`${draft.name} (${statLayer === 'played' ? 'all played' : layerLabel(draft.scenario, statLayer)})`}
              opponent={opponent} opponentSource={opponentSrc} onOpponentChange={setOpponentSrc} />
          </Panel>
          <NotationPanel notation={notation} readOnly={readOnly} scenario={draft.scenario}
            onApply={(layer, text) => commit((l) => { l[layer].set(parseRange(text)) })} />
          <InfoPanel draft={draft} readOnly={readOnly} onChange={(patch) => { setDraft({ ...draft, ...patch }); setDirty(true) }} notes={chart.notes} />
        </div>
      </div>
    </div>
  )
}

function TopPercent({ onApply }: { onApply: (fraction: number) => void }) {
  const [pct, setPct] = useState(15)
  return (
    <span className="inline-flex items-center gap-1">
      <NumberInput value={pct} min={0} max={100} step={1} onChange={setPct} className="h-7 w-16 text-xs" suffix="%" />
      <Button size="sm" onClick={() => onApply(pct / 100)} title="Set the brush layer to the top X% of hands, ranked by all-in equity vs a random hand">Top %</Button>
    </span>
  )
}

function ComboInspector({ cls, layers, scenario, readOnly, onChange, onClose, pinned }: {
  cls: HandClass; layers: Record<LayerId, Weights>; scenario: RangeScenario; readOnly: boolean; pinned: boolean
  onChange: (combo: number, layer: LayerId, w: number) => void; onClose: () => void
}) {
  return (
    <Panel title={`${cls.label} · ${cls.combos.length} combos`} actions={pinned ? <Button size="sm" variant="ghost" onClick={onClose}>Close</Button> : <span className="text-xs text-muted">hover</span>}>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {cls.combos.map((c) => {
          const [a, b] = comboCards(c)
          return (
            <div key={c} className="flex items-center gap-2 rounded-md bg-surface-2 p-1.5">
              <div className="flex gap-0.5"><PlayingCard card={a} size="xs" /><PlayingCard card={b} size="xs" /></div>
              <div className="flex flex-col gap-0.5 text-[0.65rem]">
                {(['raise', 'call'] as LayerId[]).map((layer) => (
                  <label key={layer} className="flex items-center gap-1">
                    <span className="w-8 text-muted">{layer === 'raise' ? layerLabel(scenario, 'raise') : 'Call'}</span>
                    {readOnly ? <span className="font-mono">{Math.round(layers[layer][c] * 100)}%</span> : (
                      <input type="number" min={0} max={100} step={5} value={Math.round(layers[layer][c] * 100)}
                        onChange={(e) => onChange(c, layer, Number(e.target.value) / 100)}
                        className="h-5 w-12 rounded border border-line bg-surface px-1 font-mono" />
                    )}
                  </label>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </Panel>
  )
}

function NotationPanel({ notation, readOnly, scenario, onApply }: {
  notation: Record<LayerId, string>; readOnly: boolean; scenario: RangeScenario; onApply: (layer: LayerId, text: string) => void
}) {
  return (
    <Panel title="Range notation">
      <div className="space-y-3">
        {(['raise', 'call'] as LayerId[]).map((layer) => (
          <NotationRow key={`${layer}:${notation[layer]}`} label={layer === 'raise' ? layerLabel(scenario, 'raise') : 'Call'} initial={notation[layer]} readOnly={readOnly} onApply={(t) => onApply(layer, t)} />
        ))}
        <p className="text-xs text-muted">Syntax: 22+, 99-66, A2s+, KTo+, A5s-A2s, AK, AhKh, any; weights with “:50%”.</p>
      </div>
    </Panel>
  )
}

function NotationRow({ label, initial, readOnly, onApply }: { label: string; initial: string; readOnly: boolean; onApply: (t: string) => void }) {
  const [text, setText] = useState(initial)
  const [err, setErr] = useState('')
  const apply = () => {
    try { parseRange(text); setErr(''); onApply(text) } catch (e) { setErr(e instanceof RangeParseError ? e.message : 'Invalid range') }
  }
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs text-muted">
        <span>{label}</span>
        <button className="hover:text-fg" onClick={() => navigator.clipboard?.writeText(initial)}>Copy</button>
      </div>
      <textarea value={text} readOnly={readOnly} onChange={(e) => setText(e.target.value)} rows={2} spellCheck={false}
        className="w-full rounded-md border border-line bg-surface-2 p-2 font-mono text-xs" />
      {!readOnly && text !== initial && (
        <div className="mt-1 flex items-center gap-2"><Button size="sm" onClick={apply}>Apply</Button>{err && <span className="text-xs text-bad">{err}</span>}</div>
      )}
      {text === '' && initial === '' && <span className="text-xs text-muted">(empty)</span>}
    </div>
  )
}

function InfoPanel({ draft, readOnly, onChange, notes }: { draft: RangeChart; readOnly: boolean; onChange: (p: Partial<RangeChart>) => void; notes?: string }) {
  return (
    <Panel title="Details & assumptions">
      <div className="space-y-3 text-sm">
        {draft.assumptions && <p className="rounded-md border border-warn/30 bg-warn/5 p-2 text-xs text-muted"><span className="font-medium text-warn">Assumptions. </span>{draft.assumptions}</p>}
        {notes && <p className="text-xs text-muted">{notes}</p>}
        {!readOnly && (
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-xs text-muted">Format
              <Select<RangeFormat> value={draft.format} onChange={(format) => onChange({ format })} options={Object.entries(FORMAT_LABELS).map(([value, label]) => ({ value: value as RangeFormat, label }))} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">Spot
              <Select<RangeScenario> value={draft.scenario} onChange={(scenario) => onChange({ scenario })} options={Object.entries(SCENARIO_LABELS).map(([value, label]) => ({ value: value as RangeScenario, label }))} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">Position
              <TextInput value={draft.position ?? ''} onChange={(position) => onChange({ position })} placeholder="e.g. BTN" />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">Versus
              <TextInput value={draft.vsPosition ?? ''} onChange={(vsPosition) => onChange({ vsPosition })} placeholder="e.g. CO" />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">Stack (bb)
              <NumberInput value={draft.stackBB ?? 100} min={1} max={1000} onChange={(stackBB) => onChange({ stackBB })} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted sm:col-span-2">Assumptions / notes
              <textarea value={draft.assumptions ?? ''} onChange={(e) => onChange({ assumptions: e.target.value })} rows={3} className="rounded-md border border-line bg-surface-2 p-2 text-xs text-fg" />
            </label>
          </div>
        )}
      </div>
    </Panel>
  )
}
