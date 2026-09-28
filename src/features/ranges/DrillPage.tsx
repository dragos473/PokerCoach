/** Range drill: a hand and a spot; answer fold / call / raise and get graded against the chart. */
import { useEffect, useMemo, useState } from 'react'
import { useRanges } from '../../store/ranges'
import { useSettings } from '../../store/settings'
import { borderlineClasses, comboFrequencies, describeSpot, gradeAnswer, layerLabel, FORMAT_LABELS, type BrushTarget, type RangeChart } from './model'
import { RangesTabs } from './RangesTabs'
import { Badge, Button, EmptyState, Kbd, Modal, PageHeader, Panel, Stat } from '../../components/ui'
import { RangeGrid } from '../../components/RangeGrid'
import { PlayingCard } from '../../components/PlayingCard'
import { COMBO_CLASS, HAND_CLASSES, NUM_COMBOS, comboCards, formatCombo } from '../../engine/combos'
import { createRng } from '../../engine/rng'
import { useHotkeys } from '../../hotkeys/useHotkeys'
import { getDb } from '../../db/db'
import { fmtPct } from '../../lib/format'
import { cx } from '../../lib/cx'

interface Question { chartId: string; combo: number }
interface Answer { q: Question; answer: BrushTarget; correct: boolean; freq: { raise: number; call: number; fold: number } }

const rng = createRng()

/** Show the Call button unless the spot has no calling option (open / shove charts without a call layer). */
function hasCall(c: RangeChart): boolean {
  return c.layers.call.some((w) => w > 0) || !['rfi', 'push-fold'].includes(c.scenario)
}

function pickQuestion(charts: RangeChart[], borderlineOnly: boolean): Question | null {
  if (!charts.length) return null
  const chart = charts[rng.int(charts.length)]
  if (borderlineOnly) {
    const classes = [...borderlineClasses(chart.layers)]
    if (classes.length) {
      // Weight classes by their combo counts so each combo is equally likely.
      const combos = classes.flatMap((i) => HAND_CLASSES[i].combos)
      return { chartId: chart.id, combo: combos[rng.int(combos.length)] }
    }
  }
  return { chartId: chart.id, combo: rng.int(NUM_COMBOS) }
}

export function DrillPage() {
  const charts = useRanges((s) => s.charts)
  const drill = useSettings((s) => s.settings.drill)
  const update = useSettings((s) => s.update)
  const [pickerOpen, setPickerOpen] = useState(false)

  const selectedIds = useMemo(() => {
    if (drill.chartIds.length) return drill.chartIds.filter((id) => charts.some((c) => c.id === id))
    return charts.filter((c) => c.format === '6max-cash' && c.scenario === 'rfi').map((c) => c.id)
  }, [drill.chartIds, charts])
  const pool = useMemo(() => charts.filter((c) => selectedIds.includes(c.id) && !(c.origin === 'computed' && c.updatedAt === 0)), [charts, selectedIds])
  const ensureComputed = useRanges((s) => s.ensureComputed)
  useEffect(() => { for (const id of selectedIds) void ensureComputed(id) }, [selectedIds, ensureComputed])

  const [q, setQ] = useState<Question | null>(null)
  const [answered, setAnswered] = useState<Answer | null>(null)
  const [log, setLog] = useState<Answer[]>([])
  const [shownAt, setShownAt] = useState(() => Date.now())

  useEffect(() => { if (!q && pool.length) setQ(pickQuestion(pool, drill.borderlineOnly)) }, [q, pool, drill.borderlineOnly])

  const chart = q ? charts.find((c) => c.id === q.chartId) : undefined
  const next = () => { setAnswered(null); setQ(pickQuestion(pool, drill.borderlineOnly)); setShownAt(Date.now()) }

  const answer = (a: BrushTarget) => {
    if (!q || !chart || answered) return
    const freq = comboFrequencies(chart.layers, q.combo)
    const correct = gradeAnswer(freq, a, drill.mixedThreshold / 100)
    const rec: Answer = { q, answer: a, correct, freq }
    setAnswered(rec)
    setLog((l) => [...l, rec])
    const label = HAND_CLASSES[COMBO_CLASS[q.combo]].label
    void getDb().quizAttempts.add({
      topic: 'range-drill', questionKey: `${chart.id}:${label}`, prompt: `${chart.name}: ${formatCombo(q.combo)}`,
      answer: a, expected: `raise ${fmtPct(freq.raise, 0)} / call ${fmtPct(freq.call, 0)} / fold ${fmtPct(freq.fold, 0)}`,
      correct, ms: Date.now() - shownAt, at: Date.now(),
    }).catch(() => {})
  }

  useHotkeys({
    'drill.fold': () => answer('fold'),
    'drill.call': () => chart && hasCall(chart) && answer('call'),
    'drill.raise': () => answer('raise'),
    'drill.next': () => answered && next(),
  })

  const correct = log.filter((x) => x.correct).length
  let streak = 0
  for (let i = log.length - 1; i >= 0 && log[i].correct; i--) streak++
  const done = log.length >= drill.questionCount

  return (
    <div>
      <PageHeader title="Range drill" subtitle="You are graded against the selected charts. Mixed hands count as correct for any action played at least the threshold set in Settings."
        actions={<Button onClick={() => setPickerOpen(true)}>Charts ({selectedIds.length})</Button>} />
      <RangesTabs path="/ranges/drill" />

      {!pool.length ? <EmptyState title="No charts selected" action={<Button onClick={() => setPickerOpen(true)}>Choose charts</Button>} /> : (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
          <div className="space-y-4">
            <div className="grid grid-cols-4 gap-2">
              <Stat label="Answered" value={`${log.length}/${drill.questionCount}`} />
              <Stat label="Correct" value={log.length ? fmtPct(correct / log.length, 0) : '–'} tone={log.length ? (correct / log.length >= 0.8 ? 'good' : 'warn') : undefined} />
              <Stat label="Streak" value={streak} />
              <Stat label="Mode" value={drill.borderlineOnly ? 'edge' : 'all'} />
            </div>
            {done ? (
              <Panel title="Drill complete">
                <p className="text-sm">You answered {correct} of {log.length} correctly ({fmtPct(correct / log.length, 0)}).</p>
                <MistakeList log={log} charts={charts} />
                <Button variant="primary" className="mt-3" onClick={() => { setLog([]); next() }}>Start again</Button>
              </Panel>
            ) : q && chart && (
              <Panel>
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <Badge tone="info">{FORMAT_LABELS[chart.format]}</Badge>
                  <Badge>{chart.stackBB ?? 100} bb</Badge>
                  <span className="text-xs text-muted">{chart.name}</span>
                </div>
                <p className="mb-4 text-base">{describeSpot(chart)}</p>
                <div className="mb-5 flex justify-center gap-2">
                  {comboCards(q.combo).sort((x, y) => y - x).map((c) => <PlayingCard key={c} card={c} size="lg" animate />)}
                </div>
                <div className={cx('grid gap-2', hasCall(chart) ? 'grid-cols-3' : 'grid-cols-2')}>
                  {(['fold', 'call', 'raise'] as BrushTarget[]).filter((a) => a !== 'call' || hasCall(chart)).map((a) => {
                    const isAns = answered?.answer === a
                    return (
                      <Button key={a} size="lg" variant={isAns ? (answered!.correct ? 'primary' : 'danger') : 'secondary'} onClick={() => answer(a)} disabled={!!answered && !isAns}
                        className={cx(a === 'raise' && !answered && 'border-raise/60', a === 'call' && !answered && 'border-call/60')}>
                        {a === 'fold' ? 'Fold' : a === 'call' ? 'Call' : layerLabel(chart.scenario, 'raise')}
                      </Button>
                    )
                  })}
                </div>
                <p className="mt-2 text-center text-xs text-muted"><Kbd>F</Kbd> <Kbd>C</Kbd> <Kbd>R</Kbd> to answer, <Kbd>Space</Kbd> for next (remappable)</p>
                {answered && (
                  <div className="animate-in mt-4 rounded-md border border-line p-3">
                    <p className={cx('font-semibold', answered.correct ? 'text-good' : 'text-bad')}>{answered.correct ? 'Correct' : 'Not the chart’s play'}</p>
                    <p className="mt-1 font-mono text-sm tabular">
                      {layerLabel(chart.scenario, 'raise')} {fmtPct(answered.freq.raise, 0)} · Call {fmtPct(answered.freq.call, 0)} · Fold {fmtPct(answered.freq.fold, 0)}
                    </p>
                    <p className="mt-1 text-xs text-muted">Frequencies for {formatCombo(q.combo)} in “{chart.name}”. The chart is an approximate baseline; see its assumptions in the editor.</p>
                    <Button variant="primary" className="mt-3 w-full" onClick={next}>Next</Button>
                  </div>
                )}
              </Panel>
            )}
          </div>
          {chart && q && (
            <Panel title={answered ? chart.name : 'Chart (revealed after answering)'}>
              {answered ? (
                <div className="animate-in">
                  <RangeGrid layers={[{ id: 'raise', weights: chart.layers.raise, color: 'var(--c-raise)' }, { id: 'call', weights: chart.layers.call, color: 'var(--c-call)' }]}
                    highlight={COMBO_CLASS[q.combo]} compact />
                </div>
              ) : (
                <div className="grid aspect-square place-items-center rounded-md border border-dashed border-line text-sm text-muted">Answer to reveal the chart</div>
              )}
            </Panel>
          )}
        </div>
      )}

      <Modal open={pickerOpen} onClose={() => setPickerOpen(false)} title="Charts to drill" wide>
        <ChartPicker selected={selectedIds} onChange={(chartIds) => update('drill', { chartIds })} />
      </Modal>
    </div>
  )
}

function MistakeList({ log, charts }: { log: Answer[]; charts: RangeChart[] }) {
  const misses = log.filter((x) => !x.correct)
  if (!misses.length) return <p className="mt-2 text-sm text-good">No mistakes.</p>
  return (
    <ul className="mt-3 space-y-1 text-xs">
      {misses.map((m, i) => {
        const c = charts.find((x) => x.id === m.q.chartId)
        return (
          <li key={i} className="flex justify-between gap-2 border-t border-line pt-1">
            <span>{c?.name}: <span className="font-mono">{formatCombo(m.q.combo)}</span></span>
            <span className="font-mono text-muted">you: {m.answer} · R {fmtPct(m.freq.raise, 0)} C {fmtPct(m.freq.call, 0)} F {fmtPct(m.freq.fold, 0)}</span>
          </li>
        )
      })}
    </ul>
  )
}

function ChartPicker({ selected, onChange }: { selected: string[]; onChange: (ids: string[]) => void }) {
  const charts = useRanges((s) => s.charts)
  const toggle = (id: string) => onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id])
  const groups = new Map<string, RangeChart[]>()
  for (const c of charts) {
    const k = c.origin === 'custom' ? 'My ranges' : c.origin === 'computed' ? 'Computed push/fold' : FORMAT_LABELS[c.format]
    groups.set(k, [...(groups.get(k) ?? []), c])
  }
  return (
    <div className="space-y-4">
      {[...groups.entries()].map(([g, list]) => (
        <div key={g}>
          <div className="mb-1 flex items-center justify-between">
            <h3 className="text-xs uppercase tracking-wider text-muted">{g}</h3>
            <div className="flex gap-2 text-xs">
              <button className="text-info" onClick={() => onChange([...new Set([...selected, ...list.map((c) => c.id)])])}>all</button>
              <button className="text-muted" onClick={() => onChange(selected.filter((id) => !list.some((c) => c.id === id)))}>none</button>
            </div>
          </div>
          <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((c) => (
              <label key={c.id} className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-surface-2">
                <input type="checkbox" checked={selected.includes(c.id)} onChange={() => toggle(c.id)} /> {c.name}
              </label>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
