/** Variance simulator: sample paths, confidence bands, risk of ruin, chance of being behind. */
import { useEffect, useState } from 'react'
import { useSettings } from '../../store/settings'
import { useEngine } from '../../lib/useEngine'
import { CancelledError } from '../../engine/worker/client'
import type { VarianceResult } from '../../engine/variance'
import { probLoser, riskOfRuin, riskOfRuinFinite, expectedWinnings, resultStdDev, handsToConfidence } from '../../engine/formulas'
import { Button, ErrorNote, NumberInput, PageHeader, Panel, Spinner, Stat } from '../../components/ui'
import { MathValue } from '../../components/MathExplain'
import { LineChart } from '../../components/charts'
import { OddsTabs } from './OddsTabs'
import { fmtPct } from '../../lib/format'

const fmtHands = (v: number) => (v >= 1000 ? `${Number((v / 1000).toFixed(1))}k` : String(Math.round(v)))
const fmtBBShort = (v: number) => `${Math.round(v).toLocaleString()} bb`

export function VariancePage() {
  const defaults = useSettings((s) => s.settings.variance)
  const [inp, setInp] = useState(defaults)
  const [res, setRes] = useState<VarianceResult | null>(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState('')
  const [seed, setSeed] = useState(1)
  const engine = useEngine()

  useEffect(() => {
    let alive = true
    setRunning(true); setError('')
    engine.variance({ ...inp, steps: 300, samplePaths: Math.min(inp.paths, 60), seed })
      .then((r) => { if (alive) { setRes(r); setRunning(false) } })
      .catch((e) => { if (alive && !(e instanceof CancelledError)) { setError(String(e)); setRunning(false) } })
    return () => { alive = false }
  }, [inp, seed, engine])

  const set = (patch: Partial<typeof inp>) => setInp({ ...inp, ...patch })
  const T = inp.hands
  const mean = expectedWinnings.compute({ winRate: inp.winRate, hands: T })
  const sd = resultStdDev.compute({ stdDev: inp.stdDev, hands: T })
  const pLose = probLoser.compute({ winRate: inp.winRate, stdDev: inp.stdDev, hands: T })
  const rorN = riskOfRuinFinite.compute({ winRate: inp.winRate, stdDev: inp.stdDev, bankroll: inp.bankroll, hands: T })
  const rorInf = riskOfRuin.compute({ winRate: inp.winRate, stdDev: inp.stdDev, bankroll: inp.bankroll })
  const need = handsToConfidence.compute({ winRate: inp.winRate, stdDev: inp.stdDev, confidenceZ: 1.645 })

  // Analytic 95 % interval of the result at each point: mean ± 1.96·SD.
  const analytic = res && {
    mean: res.x.map((h) => (inp.winRate * h) / 100),
    lo: res.x.map((h) => (inp.winRate * h) / 100 - 1.96 * inp.stdDev * Math.sqrt(h / 100)),
    hi: res.x.map((h) => (inp.winRate * h) / 100 + 1.96 * inp.stdDev * Math.sqrt(h / 100)),
  }

  return (
    <div>
      <PageHeader title="Odds lab" subtitle="How much can results swing around a true win rate? Model: results per 100 hands are independent and normal." />
      <OddsTabs path="/odds/variance" />
      <div className="grid gap-5 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <Panel title="Inputs">
          <div className="space-y-3 text-xs">
            <label className="flex flex-col gap-1 text-muted">True win rate (bb/100)<NumberInput value={inp.winRate} min={-50} max={50} step={0.5} onChange={(winRate) => set({ winRate })} className="w-full" /></label>
            <label className="flex flex-col gap-1 text-muted">Standard deviation (bb/100)<NumberInput value={inp.stdDev} min={1} max={400} step={1} onChange={(stdDev) => set({ stdDev })} className="w-full" /></label>
            <label className="flex flex-col gap-1 text-muted">Hands<NumberInput value={inp.hands} min={1000} max={10_000_000} step={10_000} onChange={(hands) => set({ hands })} className="w-full" /></label>
            <label className="flex flex-col gap-1 text-muted">Bankroll (bb)<NumberInput value={inp.bankroll} min={1} max={1_000_000} step={100} onChange={(bankroll) => set({ bankroll })} className="w-full" /></label>
            <label className="flex flex-col gap-1 text-muted">Simulated paths<NumberInput value={inp.paths} min={10} max={5000} step={50} onChange={(paths) => set({ paths })} className="w-full" /></label>
            <Button onClick={() => setSeed((s) => s + 1)} className="w-full">Re-simulate</Button>
            <p className="text-muted">Typical SD: 6-max NLHE ≈ 80–110 bb/100, full ring ≈ 60–80 bb/100 (depends on style).</p>
          </div>
        </Panel>
        <div className="min-w-0 space-y-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Stat label="Expected" value={<MathValue e={expectedWinnings.explain({ winRate: inp.winRate, hands: T })}>{fmtBBShort(mean)}</MathValue>} />
            <Stat label="SD of result" value={<MathValue e={resultStdDev.explain({ stdDev: inp.stdDev, hands: T })}>{fmtBBShort(sd)}</MathValue>} />
            <Stat label="P(behind at end)" value={<MathValue e={probLoser.explain({ winRate: inp.winRate, stdDev: inp.stdDev, hands: T })}>{fmtPct(pLose, 1)}</MathValue>} sub={res ? `simulated ${fmtPct(res.losers, 1)}` : undefined} />
            <Stat label="Ruin within N hands" value={<MathValue e={riskOfRuinFinite.explain({ winRate: inp.winRate, stdDev: inp.stdDev, bankroll: inp.bankroll, hands: T })}>{fmtPct(rorN, 1)}</MathValue>} sub={res ? `simulated ${fmtPct(res.ruined, 1)}` : undefined} tone={rorN > 0.05 ? 'bad' : undefined} />
            <Stat label="Ruin, playing forever" value={<MathValue e={riskOfRuin.explain({ winRate: inp.winRate, stdDev: inp.stdDev, bankroll: inp.bankroll })}>{fmtPct(rorInf, 1)}</MathValue>} />
            <Stat label="Hands to be 95 % ahead" value={<MathValue e={handsToConfidence.explain({ winRate: inp.winRate, stdDev: inp.stdDev, confidenceZ: 1.645 })}>{Number.isFinite(need) ? fmtHands(need) : '∞'}</MathValue>} />
          </div>
          <Panel title="Sample paths" actions={running && <Spinner />}>
            {error && <ErrorNote>{error}</ErrorNote>}
            {res && analytic && (
              <LineChart
                x={res.x}
                series={[
                  ...res.samples.map((y, i) => ({ id: `p${i}`, color: 'var(--series-1)', y, width: 1, opacity: 0.18 })),
                  { id: 'mean', label: 'Expected (win rate × hands)', color: 'var(--series-2)', y: analytic.mean, named: true },
                  { id: 'median', label: 'Simulated median', color: 'var(--series-3)', y: res.bands.p50, named: true },
                ]}
                bands={[{ id: 'ci', label: '95 % interval (analytic)', lower: analytic.lo, upper: analytic.hi, color: 'var(--series-2)' }]}
                refLines={[{ y: -inp.bankroll, label: `Ruin (−${inp.bankroll} bb)` }]}
                formatX={fmtHands} formatTooltipX={(v) => `${fmtHands(v)} hands`} formatY={fmtBBShort} yLabel="Cumulative result in big blinds"
                legendExtra={<span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-4 rounded opacity-40" style={{ background: 'var(--series-1)' }} />{res.samples.length} of {inp.paths} simulated paths</span>}
              />
            )}
            {res && (
              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Stat label="Best path" value={fmtBBShort(res.best)} />
                <Stat label="Worst path" value={fmtBBShort(res.worst)} />
                <Stat label="Avg max drawdown" value={fmtBBShort(res.meanMaxDrawdown)} />
                <Stat label="Paths ruined" value={fmtPct(res.ruined, 1)} />
              </div>
            )}
            <p className="mt-3 text-xs text-muted">Simulated ruin is checked every {res ? fmtHands(res.x[1]) : '…'} hands, so it can be slightly lower than the continuous-time formula. Drawdown = largest drop from a previous peak.</p>
          </Panel>
        </div>
      </div>
    </div>
  )
}
