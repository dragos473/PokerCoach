/** Accuracy per topic and over time, from the stored quiz attempts. */
import { useEffect, useMemo, useState } from 'react'
import { getDb } from '../../db/db'
import type { QuizAttempt, SrsItem } from '../../db/types'
import { QUIZ_TOPICS } from '../../store/settingsSchema'
import { BarList, LineChart } from '../../components/charts'
import { Button, EmptyState, PageHeader, Panel, Stat } from '../../components/ui'
import { OddsTabs } from './OddsTabs'
import { fmtPct } from '../../lib/format'

const LABELS: Record<string, string> = { ...Object.fromEntries(QUIZ_TOPICS.map((t) => [t.id, t.label])), 'range-drill': 'Range drill' }
const DAY = 86_400_000

export function QuizStatsPage() {
  const [attempts, setAttempts] = useState<QuizAttempt[] | null>(null)
  const [srs, setSrs] = useState<SrsItem[]>([])
  const load = () => {
    getDb().quizAttempts.toArray().then(setAttempts).catch(() => setAttempts([]))
    getDb().srsItems.toArray().then(setSrs).catch(() => setSrs([]))
  }
  useEffect(load, [])

  const perTopic = useMemo(() => {
    const m = new Map<string, { n: number; ok: number; recentN: number; recentOk: number }>()
    const cutoff = Date.now() - 7 * DAY
    for (const a of attempts ?? []) {
      const t = m.get(a.topic) ?? { n: 0, ok: 0, recentN: 0, recentOk: 0 }
      t.n++; if (a.correct) t.ok++
      if (a.at >= cutoff) { t.recentN++; if (a.correct) t.recentOk++ }
      m.set(a.topic, t)
    }
    return [...m.entries()].map(([id, v]) => ({ id, label: LABELS[id] ?? id, ...v })).sort((a, b) => a.ok / a.n - b.ok / b.n)
  }, [attempts])

  const daily = useMemo(() => {
    const m = new Map<number, { n: number; ok: number }>()
    for (const a of attempts ?? []) {
      const d = Math.floor(a.at / DAY)
      const v = m.get(d) ?? { n: 0, ok: 0 }
      v.n++; if (a.correct) v.ok++
      m.set(d, v)
    }
    const days = [...m.keys()].sort((a, b) => a - b)
    return { x: days.map((d) => d * DAY), y: days.map((d) => m.get(d)!.ok / m.get(d)!.n), n: days.map((d) => m.get(d)!.n) }
  }, [attempts])

  if (attempts === null) return null
  const total = attempts.length
  const ok = attempts.filter((a) => a.correct).length

  return (
    <div>
      <PageHeader title="Odds lab" subtitle="Your accuracy by topic and over time (quizzer and range drill)." />
      <OddsTabs path="/odds/stats" />
      {total === 0 ? <EmptyState title="No answers yet" action={<a href="#/odds/quiz" className="text-info underline">Start a quiz</a>}>Your progress appears here after the first quiz or drill.</EmptyState> : (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="Answers" value={total} />
            <Stat label="Accuracy" value={fmtPct(ok / total, 0)} />
            <Stat label="In review queue" value={srs.length} />
            <Stat label="Due now" value={srs.filter((s) => s.due <= Date.now()).length} />
          </div>
          <div className="grid gap-5 lg:grid-cols-2">
            <Panel title="Accuracy by topic (all time)">
              <BarList rows={perTopic.map((t) => ({ id: t.id, label: t.label, value: t.ok / t.n, sub: `(${t.n})` }))} format={(v) => fmtPct(v, 0)} />
              <table className="mt-4 w-full text-xs">
                <thead className="text-left text-muted"><tr><th className="py-1 font-normal">Topic</th><th className="py-1 text-right font-normal">All time</th><th className="py-1 text-right font-normal">Last 7 days</th></tr></thead>
                <tbody className="font-mono tabular">
                  {perTopic.map((t) => (
                    <tr key={t.id} className="border-t border-line"><td className="py-1 font-sans">{t.label}</td><td className="py-1 text-right">{t.ok}/{t.n}</td><td className="py-1 text-right">{t.recentN ? `${t.recentOk}/${t.recentN}` : '–'}</td></tr>
                  ))}
                </tbody>
              </table>
            </Panel>
            <Panel title="Daily accuracy (all topics)">
              {daily.x.length < 2 ? <p className="text-sm text-muted">Needs answers on at least two different days.</p> : (
                <LineChart x={daily.x} series={[{ id: 'acc', label: 'Accuracy', color: 'var(--series-1)', y: daily.y, named: true }]} height={240}
                  formatX={(v) => new Date(v).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} formatY={(v) => fmtPct(v, 0)} yLabel="Daily accuracy" />
              )}
            </Panel>
          </div>
          <Panel title="Recent answers" actions={<Button size="sm" variant="danger" onClick={async () => { if (confirm('Delete all quiz history and the review queue?')) { await getDb().quizAttempts.clear(); await getDb().srsItems.clear(); load() } }}>Reset history</Button>}>
            <ul className="divide-y divide-line text-sm">
              {[...attempts].sort((a, b) => b.at - a.at).slice(0, 25).map((a) => (
                <li key={a.id} className="flex items-start justify-between gap-3 py-1.5">
                  <span className="min-w-0"><span className={a.correct ? 'text-good' : 'text-bad'}>{a.correct ? '✓' : '✗'}</span> <span className="text-muted">{LABELS[a.topic] ?? a.topic}:</span> {a.prompt}</span>
                  <span className="shrink-0 font-mono text-xs text-muted">{a.answer || '–'} / {a.expected}</span>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      )}
    </div>
  )
}
