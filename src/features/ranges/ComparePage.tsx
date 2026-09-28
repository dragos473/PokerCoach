/** Range vs range comparison: overlap, category mix, equity and heatmap. */
import { useMemo, useState } from 'react'
import { PageHeader, Panel } from '../../components/ui'
import { RangeGrid } from '../../components/RangeGrid'
import { RangesTabs } from './RangesTabs'
import { RangeSourcePicker, useResolvedSource, type RangeSource } from './RangeSourcePicker'
import { EquityVsPanel } from './RangeStats'
import { comboCount, emptyRange } from '../../engine/range'
import { categoryBreakdown, classEquitiesVsRange } from '../../engine/preflop'
import { NUM_COMBOS } from '../../engine/combos'
import { fmtPct } from '../../lib/format'
import { useSettings } from '../../store/settings'

export function ComparePage() {
  const [a, setA] = useState<RangeSource>({ kind: 'chart', chartId: 'c6-rfi-co', layer: 'raise' })
  const [b, setB] = useState<RangeSource>({ kind: 'chart', chartId: 'c6-bb-vs-co', layer: 'played' })
  const [heat, setHeat] = useState(false)
  const ra = useResolvedSource(a)
  const rb = useResolvedSource(b)
  const decimals = useSettings((s) => s.settings.display.percentDecimals)
  const A = ra.weights ?? emptyRange()
  const B = rb.weights ?? emptyRange()

  const overlap = useMemo(() => {
    let both = 0
    for (let i = 0; i < NUM_COMBOS; i++) both += Math.min(A[i], B[i])
    const ca = comboCount(A), cb = comboCount(B)
    return { ca, cb, both, aOnly: ca - both, bOnly: cb - both }
  }, [A, B])
  const cats = useMemo(() => ({ a: categoryBreakdown(A), b: categoryBreakdown(B) }), [A, B])
  const heatmap = useMemo(() => (heat && comboCount(B) > 0 ? classEquitiesVsRange(B) : null), [heat, B])

  return (
    <div>
      <PageHeader title="Compare ranges" subtitle="Overlap, composition and equity of range A against range B." />
      <RangesTabs path="/ranges/compare" />
      <div className="grid gap-5 lg:grid-cols-2">
        {[{ label: 'Range A', src: a, set: setA, w: A, color: 'var(--c-info)', grid: heatmap }, { label: 'Range B', src: b, set: setB, w: B, color: 'var(--c-warn)', grid: null }].map((x) => (
          <Panel key={x.label} title={x.label}>
            <RangeSourcePicker value={x.src} onChange={x.set} className="mb-3" />
            <RangeGrid layers={[{ id: 'r', weights: x.w, color: x.color }]} heatmap={x.grid} compact />
            {x.label === 'Range A' && (
              <label className="mt-2 flex items-center gap-2 text-xs text-muted">
                <input type="checkbox" checked={heat} onChange={(e) => setHeat(e.target.checked)} /> Show A’s per-hand equity vs B
              </label>
            )}
          </Panel>
        ))}
      </div>
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Panel title="Overlap">
          <table className="w-full text-sm">
            <tbody className="font-mono tabular">
              {[
                ['Combos in A', overlap.ca], ['Combos in B', overlap.cb], ['In both', overlap.both], ['Only in A', overlap.aOnly], ['Only in B', overlap.bOnly],
              ].map(([k, v]) => (
                <tr key={k as string} className="border-t border-line first:border-0">
                  <td className="py-1.5 font-sans">{k}</td>
                  <td className="py-1.5 text-right">{Number((v as number).toFixed(2))}</td>
                  <td className="py-1.5 text-right text-muted">{fmtPct((v as number) / 1326, decimals)} of hands</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-muted">“In both” counts Σ min(w_A, w_B) per combo.</p>
        </Panel>
        <Panel title="Equity of A vs B">
          <EquityVsPanel hero={A} heroLabel={ra.label} opponent={rb} opponentSource={b} onOpponentChange={setB} hidePicker />
        </Panel>
      </div>
      <Panel title="Composition" className="mt-5">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted">
            <tr><th className="py-1 font-normal">Category</th><th className="py-1 text-right font-normal">A combos</th><th className="py-1 text-right font-normal">A %</th><th className="py-1 text-right font-normal">B combos</th><th className="py-1 text-right font-normal">B %</th></tr>
          </thead>
          <tbody className="font-mono text-xs tabular">
            {cats.a.map((r, i) => (
              <tr key={r.id} className="border-t border-line">
                <td className="py-1 font-sans">{r.label}</td>
                <td className="py-1 text-right">{Number(r.combos.toFixed(1))}</td>
                <td className="py-1 text-right">{fmtPct(r.shareOfRange, decimals)}</td>
                <td className="py-1 text-right">{Number(cats.b[i].combos.toFixed(1))}</td>
                <td className="py-1 text-right">{fmtPct(cats.b[i].shareOfRange, decimals)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </div>
  )
}
