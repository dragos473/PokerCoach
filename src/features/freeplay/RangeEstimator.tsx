/** Villain range estimator: paint a weighted range, apply presets, see the board breakdown. */
import { useMemo, useRef, useState } from 'react'
import { RangeGrid } from '../../components/RangeGrid'
import { Button, Modal, Segmented, Slider, Badge } from '../../components/ui'
import { HAND_CLASSES } from '../../engine/combos'
import { comboCount, fullRange, parseRange, rangePercent, type Weights } from '../../engine/range'
import { topPercentRange } from '../../engine/preflop'
import { GROUP_LABELS, classifyHand, type BreakdownGroup } from '../../engine/game/handStrength'
import { COMBO_CARDS } from '../../engine/combos'
import type { Card } from '../../engine/cards'
import type { HandState } from '../../engine/game/table'
import { rangeBreakdown } from './analysis'
import { BASELINE_CHARTS } from '../../data/ranges/library'
import { fmtPct } from '../../lib/format'
import { cx } from '../../lib/cx'

export function RangeEstimator({ open, onClose, h, seat, setSeat, range, onChange, dead, onModelNarrow, modelName }: {
  open: boolean
  onClose: () => void
  h: HandState
  seat: number
  setSeat: (s: number) => void
  range: Weights
  onChange: (w: Weights) => void
  dead: Card[]
  onModelNarrow: () => void
  modelName: string
}) {
  const [mode, setMode] = useState<'paint' | 'erase'>('paint')
  const [weight, setWeight] = useState(100)
  const stroke = useRef<number | null>(null)
  const board = h.board
  const breakdown = useMemo(() => rangeBreakdown(range, board, dead), [range, board, dead])
  const villains = h.seats.filter((x) => !x.isHero)
  const pos = h.seats[seat].position

  const paint = (idx: number, phase: 'start' | 'move') => {
    const combos = HAND_CLASSES[idx].combos
    if (phase === 'start') {
      const w = mode === 'erase' ? 0 : weight / 100
      const already = combos.every((c) => Math.abs(range[c] - w) < 1e-9)
      stroke.current = already && mode === 'paint' ? 0 : w
    }
    const next = new Float64Array(range)
    for (const c of combos) next[c] = stroke.current ?? 0
    onChange(next)
  }

  const keepGroups = (groups: BreakdownGroup[]) => {
    const next = new Float64Array(range)
    for (let c = 0; c < next.length; c++) {
      if (next[c] <= 0) continue
      const a = COMBO_CARDS[2 * c], b = COMBO_CARDS[2 * c + 1]
      if (board.includes(a) || board.includes(b)) { next[c] = 0; continue }
      if (!groups.includes(classifyHand([a, b], board).group)) next[c] = 0
    }
    onChange(next)
  }
  const intersect = (w: Weights) => onChange(range.map((x, i) => Math.min(x, w[i])))
  const chartFor = () => {
    const id = `c6-rfi-${pos.toLowerCase()}`
    const c = BASELINE_CHARTS.find((x) => x.id === id)
    return c ? parseRange(c.raise) : topPercentRange(0.25)
  }

  return (
    <Modal open={open} onClose={onClose} title="Villain range estimator" wide>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {villains.map((x) => (
          <button key={x.index} onClick={() => setSeat(x.index)} className={cx('rounded-md border px-2.5 py-1 text-xs', x.index === seat ? 'border-accent bg-accent/15' : 'border-line text-muted', x.folded && 'opacity-40')}>
            {x.position} · {x.name}{x.folded && ' (folded)'}
          </button>
        ))}
      </div>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,30rem)_minmax(0,1fr)]">
        <div className="space-y-2">
          <RangeGrid layers={[{ id: 'r', weights: range, color: 'var(--c-info)' }]} dead={[...dead, ...board]} onStroke={paint} showCombos />
          <div className="flex flex-wrap items-center gap-3">
            <Segmented size="sm" value={mode} onChange={setMode} options={[{ value: 'paint', label: 'Paint' }, { value: 'erase', label: 'Erase' }]} />
            {mode === 'paint' && <Slider value={weight} min={5} max={100} step={5} onChange={setWeight} format={(v) => `${v}%`} label="Weight" />}
          </div>
          <p className="text-xs text-muted">Greyed cells are impossible because of your cards and the board. Every HUD number updates as you edit.</p>
        </div>
        <div className="min-w-0 space-y-4">
          <div className="flex flex-wrap items-baseline gap-4">
            <span className="text-sm"><span className="font-mono text-lg font-semibold">{Number(comboCount(range, [...dead, ...board]).toFixed(1))}</span> combos</span>
            <span className="text-sm text-muted">{fmtPct(rangePercent(range), 1)} of all starting hands</span>
          </div>
          <div>
            <p className="mb-1.5 text-xs uppercase tracking-wider text-muted">Presets</p>
            <div className="flex flex-wrap gap-1.5">
              <Button size="sm" onClick={() => onChange(fullRange())}>Any two cards</Button>
              <Button size="sm" onClick={() => onChange(chartFor())}>{pos} open (chart)</Button>
              <Button size="sm" onClick={() => intersect(topPercentRange(0.09))}>Narrow to 3-bet range</Button>
              <Button size="sm" onClick={() => onChange(range.map((x, i) => x * (1 - topPercentRange(0.08)[i])))}>Remove hands that would have raised</Button>
              {board.length >= 3 && <>
                <Button size="sm" onClick={() => keepGroups(['nuts', 'sets', 'two-pair', 'top-pair', 'strong-draws'])}>Keep draws + top pair+</Button>
                <Button size="sm" onClick={() => keepGroups(['nuts', 'sets', 'two-pair', 'top-pair', 'pairs', 'strong-draws', 'weak-draws'])}>Remove air</Button>
                <Button size="sm" onClick={() => keepGroups(['nuts', 'sets', 'two-pair'])}>Two pair+ only</Button>
              </>}
              <Button size="sm" variant="primary" onClick={onModelNarrow} title="Replay this player's actions this hand with the chosen response model">Narrow by actions ({modelName})</Button>
            </div>
          </div>
          {board.length >= 3 && (
            <div>
              <p className="mb-1.5 text-xs uppercase tracking-wider text-muted">Breakdown on this board</p>
              <table className="w-full text-xs">
                <tbody>
                  {breakdown.map((r) => (
                    <tr key={r.group} className={r.combos === 0 ? 'text-muted/60' : ''}>
                      <td className="py-0.5">{GROUP_LABELS[r.group]}</td>
                      <td className="py-0.5 text-right font-mono tabular">{Number(r.combos.toFixed(1))}</td>
                      <td className="w-28 py-0.5 pl-2"><div className="h-1.5 rounded bg-line"><div className="h-1.5 rounded bg-info" style={{ width: `${r.share * 100}%` }} /></div></td>
                      <td className="w-12 py-0.5 text-right font-mono tabular">{fmtPct(r.share, 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-1 text-[0.65rem] text-muted"><Badge>note</Badge> Categories are relative to the board: a pair on the board does not count as your pair.</p>
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}
