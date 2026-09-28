/** Statistics for a layered range: combos, % of hands, category breakdown and equity vs an opponent. */
import { useMemo, useState } from 'react'
import { comboCount, liveCombos, rangePercent, type Weights } from '../../engine/range'
import { categoryBreakdown, rangeVsRangeFast, MATRIX_INFO } from '../../engine/preflop'
import type { EquityResult } from '../../engine/equity'
import { CancelledError } from '../../engine/worker/client'
import { useEngine } from '../../lib/useEngine'
import { useSettings } from '../../store/settings'
import { Button, ErrorNote, Panel, ProgressBar, Segmented, Spinner } from '../../components/ui'
import { MathNote } from '../../components/MathExplain'
import { fmtPct } from '../../lib/format'
import { layerLabel, type LayerId } from './model'
import type { RangeScenario } from '../../db/types'
import { RangeSourcePicker, type RangeSource, type ResolvedRange } from './RangeSourcePicker'

export type StatLayer = LayerId | 'played'

export function LayerSummary({ layers, scenario }: { layers: Record<LayerId, Weights>; scenario: RangeScenario }) {
  const decimals = useSettings((s) => s.settings.display.percentDecimals)
  const rows = [
    { id: 'raise', label: layerLabel(scenario, 'raise'), color: 'var(--c-raise)', w: layers.raise },
    { id: 'call', label: 'Call', color: 'var(--c-call)', w: layers.call },
  ]
  const totalCombos = comboCount(layers.raise) + comboCount(layers.call)
  return (
    <table className="w-full text-sm">
      <thead className="text-left text-xs text-muted">
        <tr><th className="py-1 font-normal">Action</th><th className="py-1 text-right font-normal">Combos</th><th className="py-1 text-right font-normal">% of hands</th></tr>
      </thead>
      <tbody className="font-mono tabular">
        {rows.map((r) => (
          <tr key={r.id} className="border-t border-line">
            <td className="py-1.5 font-sans"><span className="mr-2 inline-block h-2.5 w-2.5 rounded-sm" style={{ background: r.color }} />{r.label}</td>
            <td className="py-1.5 text-right">{Number(comboCount(r.w).toFixed(2))}</td>
            <td className="py-1.5 text-right">{fmtPct(rangePercent(r.w), decimals)}</td>
          </tr>
        ))}
        <tr className="border-t border-line">
          <td className="py-1.5 font-sans">Played (total)</td>
          <td className="py-1.5 text-right">{Number(totalCombos.toFixed(2))}</td>
          <td className="py-1.5 text-right">{fmtPct(totalCombos / 1326, decimals)}</td>
        </tr>
        <tr className="border-t border-line text-muted">
          <td className="py-1.5 font-sans">Fold</td>
          <td className="py-1.5 text-right">{Number((1326 - totalCombos).toFixed(2))}</td>
          <td className="py-1.5 text-right">{fmtPct(1 - totalCombos / 1326, decimals)}</td>
        </tr>
      </tbody>
    </table>
  )
}

export function CategoryTable({ weights }: { weights: Weights }) {
  const rows = useMemo(() => categoryBreakdown(weights), [weights])
  const decimals = useSettings((s) => s.settings.display.percentDecimals)
  return (
    <table className="w-full text-sm">
      <thead className="text-left text-xs text-muted">
        <tr>
          <th className="py-1 font-normal">Category</th>
          <th className="py-1 text-right font-normal">Combos</th>
          <th className="py-1 text-right font-normal">% of range</th>
          <th className="py-1 pl-3 font-normal" title="Share of all combos of this category that the range contains">Coverage</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id} className={r.combos === 0 ? 'text-muted/60' : ''}>
            <td className="py-1 text-xs">{r.label}</td>
            <td className="py-1 text-right font-mono text-xs tabular">{Number(r.combos.toFixed(1))}</td>
            <td className="py-1 text-right font-mono text-xs tabular">{fmtPct(r.shareOfRange, decimals)}</td>
            <td className="py-1 pl-3"><div className="h-1.5 w-20 rounded bg-line"><div className="h-1.5 rounded bg-info" style={{ width: `${r.shareOfCategory * 100}%` }} /></div></td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** Equity of `hero` vs an opponent range: instant matrix estimate + optional engine run. */
export function EquityVsPanel({ hero, heroLabel, opponent, opponentSource, onOpponentChange, hidePicker }: {
  hero: Weights; heroLabel: string; opponent: ResolvedRange; opponentSource: RangeSource; onOpponentChange: (s: RangeSource) => void; hidePicker?: boolean
}) {
  const engine = useEngine()
  const eqSettings = useSettings((s) => s.settings.equity)
  const decimals = useSettings((s) => s.settings.display.percentDecimals)
  const [result, setResult] = useState<EquityResult | null>(null)
  const [progress, setProgress] = useState(0)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState('')

  const fast = useMemo(() => (opponent.weights ? rangeVsRangeFast(hero, opponent.weights) : NaN), [hero, opponent.weights])
  const heroEmpty = comboCount(hero) === 0

  const run = async () => {
    if (!opponent.weights) return
    setError(''); setResult(null); setRunning(true); setProgress(0)
    try {
      const r = await engine.equity({
        players: [{ combos: liveCombos(hero) }, { combos: liveCombos(opponent.weights) }],
        board: [], dead: [], method: eqSettings.method, iterations: eqSettings.iterations, maxExactEvaluations: eqSettings.maxExactEvaluations,
      }, { onProgress: (f, partial) => { setProgress(f); if (partial) setResult(partial) } })
      setResult(r)
    } catch (e) {
      if (!(e instanceof CancelledError)) setError(e instanceof Error ? e.message : String(e))
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="space-y-3">
      {!hidePicker && <RangeSourcePicker value={opponentSource} onChange={(s) => { setResult(null); onOpponentChange(s) }} />}
      {heroEmpty ? <p className="text-sm text-muted">This layer is empty.</p> : opponent.weights && (
        <>
          <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
            <div>
              <span className="text-xs text-muted">Fast estimate</span>
              <p className="font-mono text-2xl font-semibold tabular">{fmtPct(fast, decimals)}</p>
            </div>
            {result && (
              <div>
                <span className="text-xs text-muted">Equity engine ({result.method === 'exact' ? 'exact' : 'Monte Carlo'})</span>
                <p className="font-mono text-2xl font-semibold tabular">
                  {fmtPct(result.players[0].equity, decimals)}
                  {result.method === 'monte-carlo' && <span className="ml-2 text-sm font-normal text-muted">± {fmtPct(result.players[0].marginOfError95, 2)}</span>}
                </p>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            {running ? <Button size="sm" onClick={() => engine.cancel()}><Spinner /> Stop</Button> : <Button size="sm" onClick={run}>Compute with equity engine</Button>}
            {running && <ProgressBar value={progress} className="max-w-40" />}
          </div>
          {error && <ErrorNote>{error}</ErrorNote>}
          <MathNote
            title="How this is computed"
            kind="model"
            lines={[
              `equity = Σ w_h·w_v·E(h, v) / Σ w_h·w_v over card-disjoint combo pairs`,
              `hero: ${heroLabel}`,
              `opponent: ${opponent.label}`,
              `fast estimate uses class-averaged E from the preflop matrix (${MATRIX_INFO.trialsPerPair.toLocaleString()} trials/pair, SE ≤ ${(MATRIX_INFO.maxStdError * 100).toFixed(2)} pp)`,
              result ? `engine: ${result.samples.toLocaleString()} ${result.method === 'exact' ? 'outcomes enumerated' : 'trials'}, ${Math.round(result.elapsedMs)} ms` : 'engine: not run yet',
            ]}
            assumptions={['All-in preflop equity (showdown pot share, ties split); no future betting or equity realisation.']}
          />
        </>
      )}
    </div>
  )
}

export function StatLayerSwitch({ value, onChange, scenario }: { value: StatLayer; onChange: (v: StatLayer) => void; scenario: RangeScenario }) {
  return (
    <Segmented size="sm" value={value} onChange={onChange}
      options={[{ value: 'played', label: 'All played' }, { value: 'raise', label: layerLabel(scenario, 'raise') }, { value: 'call', label: 'Call' }]} />
  )
}

export { Panel }
