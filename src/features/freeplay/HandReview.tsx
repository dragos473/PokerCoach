/** After-hand review: replay, villain ranges (actual model vs your read), graded decisions. */
import { useMemo, useState } from 'react'
import type { HandState, Street } from '../../engine/game/table'
import { toBB } from '../../engine/game/table'
import type { DecisionRecord, LogEntry } from './session'
import { fromSparse, leakLabel } from './session'
import { RangeGrid } from '../../components/RangeGrid'
import { PlayingCard } from '../../components/PlayingCard'
import { Badge, Button, Panel, Segmented } from '../../components/ui'
import { COMBO_CLASS, comboIndex } from '../../engine/combos'
import { comboCount } from '../../engine/range'
import { describeScore, evaluate } from '../../engine/evaluator'
import { downloadFile } from '../../db/backup'
import { cx } from '../../lib/cx'

export interface ReviewData {
  handNo: number
  hand: HandState
  log: LogEntry[]
  decisions: DecisionRecord[]
  streetRanges: { street: Street; actual: [number, number][][]; estimate: [number, number][][] }[]
  text: string
}

const bb = (c: number) => Number(toBB(c).toFixed(2))

export function HandReview({ data }: { data: ReviewData }) {
  const h = data.hand
  const [step, setStep] = useState(data.log.length)
  const villains = h.seats.filter((x) => !x.isHero)
  const [villain, setVillain] = useState(() => {
    const d = data.decisions[data.decisions.length - 1]
    return d?.villainSeat ?? villains.find((x) => !x.folded)?.index ?? villains[0]?.index ?? 1
  })
  const streets = data.streetRanges.map((s) => s.street)
  const [street, setStreet] = useState<Street>(streets[streets.length - 1] ?? 'preflop')
  const snap = data.streetRanges.find((s) => s.street === street)
  const actual = useMemo(() => (snap ? fromSparse(snap.actual[villain] ?? []) : null), [snap, villain])
  const estimate = useMemo(() => (snap ? fromSparse(snap.estimate[villain] ?? []) : null), [snap, villain])
  const vCards = h.seats[villain]?.cards ?? []
  const vClass = vCards.length === 2 ? COMBO_CLASS[comboIndex(vCards[0], vCards[1])] : null
  const boardAt = (st: Street) => h.board.slice(0, st === 'preflop' ? 0 : st === 'flop' ? 3 : st === 'turn' ? 4 : 5)
  const shownLog = data.log.slice(0, step)
  const replayStreet = shownLog[shownLog.length - 1]?.street ?? 'preflop'
  const deadForGrid = [...(h.seats[0].cards ?? []), ...boardAt(street)]
  const flagged = data.decisions.filter((d) => d.flagged)
  const totalLoss = data.decisions.reduce((a, d) => a + d.evLossBB, 0)

  return (
    <div className="space-y-4">
      <Panel title={`Hand #${data.handNo} review`} actions={<Button size="sm" onClick={() => downloadFile(`hand-${data.handNo}.txt`, data.text, 'text/plain')}>Export text</Button>}>
        <div className="flex flex-wrap items-center gap-4">
          <span className={cx('font-mono text-lg font-semibold', h.net[0] > 0 ? 'text-good' : h.net[0] < 0 ? 'text-bad' : '')}>{h.net[0] > 0 ? '+' : ''}{bb(h.net[0])} bb</span>
          <span className="text-sm text-muted">{data.decisions.length} decisions · EV lost {totalLoss.toFixed(2)} bb · {flagged.length} flagged</span>
        </div>
        <div className="mt-3 flex flex-wrap gap-4">
          {h.seats.filter((x) => !x.folded || x.isHero || h.showdown).map((x) => (
            <div key={x.index} className="flex items-center gap-2 text-xs">
              <span className="w-24 truncate">{x.position} {x.name}</span>
              <div className="flex gap-0.5">{x.cards.map((c) => <PlayingCard key={c} card={c} size="xs" />)}</div>
              {h.board.length === 5 && !x.folded && <span className="text-muted">{describeScore(evaluate([...x.cards, ...h.board]))}</span>}
              {x.folded && <span className="text-muted">folded</span>}
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Decisions">
        {data.decisions.length === 0 ? <p className="text-sm text-muted">You made no decision this hand.</p> : (
          <div className="space-y-3">
            {data.decisions.map((d, i) => (
              <div key={i} className={cx('rounded-md border p-2.5', d.flagged ? 'border-bad/50 bg-bad/5' : 'border-line')}>
                <div className="mb-1 flex flex-wrap items-center gap-2 text-sm">
                  <Badge>{d.street}</Badge>
                  <span className="font-medium">{d.chosenLabel}</span>
                  <span className="text-xs text-muted">pot {d.potBB.toFixed(1)} bb{d.toCallBB > 0 && `, to call ${d.toCallBB.toFixed(1)} bb`}</span>
                  {d.flagged ? <Badge tone="bad">−{d.evLossBB.toFixed(2)} bb</Badge> : d.evLossBB > 0.01 ? <Badge tone="warn">−{d.evLossBB.toFixed(2)} bb</Badge> : <Badge tone="good">best option</Badge>}
                  {d.tags.map((t) => <Badge key={t} tone="warn">{leakLabel(t)}</Badge>)}
                </div>
                <p className="text-xs text-muted">{d.explanation}</p>
                <table className="mt-2 w-full text-xs">
                  <thead className="text-muted"><tr><th className="text-left font-normal">Option</th><th className="text-right font-normal">EV vs actual range</th><th className="text-right font-normal">EV vs your read</th></tr></thead>
                  <tbody className="font-mono tabular">
                    {d.actual.map((o) => {
                      const e = d.estimate.find((x) => x.label === o.label)
                      const best = Math.max(...d.actual.map((x) => x.ev))
                      return (
                        <tr key={o.label} className={cx('border-t border-line', o.label === d.chosenLabel && 'bg-surface-2')}>
                          <td className="py-0.5 font-sans">{o.label}{o.label === d.chosenLabel && ' ←'}</td>
                          <td className={cx('py-0.5 text-right', o.ev === best && 'text-good')} title={o.lines.join('\n')}>{bb(o.ev)}</td>
                          <td className="py-0.5 text-right text-muted" title={e?.lines.join('\n')}>{e ? bb(e.ev) : '–'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                <p className="mt-1 text-[0.65rem] text-muted">Equity: {(d.equityActual * 100).toFixed(1)}% vs the actual range, {(d.equityEstimate * 100).toFixed(1)}% vs your read.</p>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Panel title="Villain range: actual model vs your read">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {villains.map((x) => (
            <button key={x.index} onClick={() => setVillain(x.index)} className={cx('rounded-md border px-2 py-1 text-xs', x.index === villain ? 'border-accent bg-accent/15' : 'border-line text-muted')}>{x.position} {x.name}</button>
          ))}
          <span className="ml-auto" />
          {streets.length > 0 && <Segmented size="sm" value={street} onChange={setStreet} options={streets.map((s) => ({ value: s, label: s }))} />}
        </div>
        {actual && estimate && (
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <p className="mb-1 text-xs text-muted">Bot model range at the end of the {street} ({Number(comboCount(actual, deadForGrid).toFixed(1))} combos). Actual hand highlighted.</p>
              <RangeGrid compact layers={[{ id: 'a', weights: actual, color: 'var(--c-warn)' }]} dead={deadForGrid} highlight={vClass} />
            </div>
            <div>
              <p className="mb-1 text-xs text-muted">Your read ({Number(comboCount(estimate, deadForGrid).toFixed(1))} combos)</p>
              <RangeGrid compact layers={[{ id: 'e', weights: estimate, color: 'var(--c-info)' }]} dead={deadForGrid} highlight={vClass} />
            </div>
          </div>
        )}
      </Panel>

      <Panel title="Replay">
        <div className="mb-2 flex items-center gap-2">
          <Button size="sm" onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0}>←</Button>
          <input type="range" min={0} max={data.log.length} value={step} onChange={(e) => setStep(Number(e.target.value))} className="flex-1 accent-[var(--c-accent)]" aria-label="Replay position" />
          <Button size="sm" onClick={() => setStep(Math.min(data.log.length, step + 1))} disabled={step === data.log.length}>→</Button>
        </div>
        <div className="mb-2 flex gap-1 rounded-md bg-felt p-1.5">{[0, 1, 2, 3, 4].map((i) => <PlayingCard key={i} card={boardAt(replayStreet)[i] ?? null} size="sm" />)}</div>
        <ol className="max-h-64 space-y-0.5 overflow-auto text-xs">
          {shownLog.map((e, i) => (
            <li key={i} className={cx(i === shownLog.length - 1 && 'text-fg', i < shownLog.length - 1 && 'text-muted')}>
              <span className="mr-1 font-mono text-[0.6rem] uppercase">{e.street}</span>{e.text}
              {e.freq && <span className="ml-1 text-[0.62rem] text-muted">(model: F {Math.round(e.freq.fold * 100)} / C {Math.round(e.freq.call * 100)} / R {Math.round(e.freq.raise * 100)})</span>}
            </li>
          ))}
        </ol>
      </Panel>
    </div>
  )
}
