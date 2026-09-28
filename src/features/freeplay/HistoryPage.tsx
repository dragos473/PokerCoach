/** Saved hands, session stats and the leak tracker. */
import { useEffect, useMemo, useState } from 'react'
import { getDb } from '../../db/db'
import type { HandRecord } from '../../db/types'
import { Badge, Button, EmptyState, PageHeader, Panel, Stat } from '../../components/ui'
import { BarList } from '../../components/charts'
import { HandReview, type ReviewData } from './HandReview'
import { leakLabel } from './session'
import { downloadFile } from '../../db/backup'
import { cx } from '../../lib/cx'

export function HistoryPage() {
  const [hands, setHands] = useState<HandRecord[] | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const [onlyFlagged, setOnlyFlagged] = useState(false)
  const load = () => { getDb().hands.orderBy('at').reverse().toArray().then(setHands).catch(() => setHands([])) }
  useEffect(load, [])

  const stats = useMemo(() => {
    const list = hands ?? []
    const n = list.length
    const net = list.reduce((a, x) => a + x.netBB, 0)
    const loss = list.reduce((a, x) => a + x.evLossBB, 0)
    const leaks = new Map<string, { count: number }>()
    for (const hnd of list) for (const t of hnd.mistakeTags) leaks.set(t, { count: (leaks.get(t)?.count ?? 0) + 1 })
    const lossByTag = new Map<string, number>()
    for (const hnd of list) {
      const data = hnd.data as ReviewData
      for (const d of data.decisions ?? []) for (const t of d.tags) lossByTag.set(t, (lossByTag.get(t) ?? 0) + d.evLossBB)
    }
    return { n, net, loss, leaks: [...leaks.entries()].map(([tag, v]) => ({ tag, count: v.count, loss: lossByTag.get(tag) ?? 0 })).sort((a, b) => b.loss - a.loss) }
  }, [hands])

  if (hands === null) return null
  const shown = hands.filter((x) => !onlyFlagged || x.mistakeTags.length > 0)
  const openHand = hands.find((x) => x.id === open)

  return (
    <div>
      <PageHeader title="Freeplay history" subtitle="Every finished hand is saved locally. Decisions are graded against the bot's actual range with the one-street EV model."
        actions={<>
          <Button size="sm" onClick={() => downloadFile('pokercoach-hands.txt', hands.map((x) => x.text).join('\n\n'), 'text/plain')} disabled={!hands.length}>Export all as text</Button>
          <Button size="sm" variant="danger" onClick={async () => { if (confirm('Delete all saved hands and sessions?')) { await getDb().hands.clear(); await getDb().sessions.clear(); load() } }} disabled={!hands.length}>Delete history</Button>
          <a href="#/freeplay" className="text-sm text-info underline">Back to the table</a>
        </>} />
      {hands.length === 0 ? <EmptyState title="No hands yet" action={<a href="#/freeplay" className="text-info underline">Play some hands</a>} /> : (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="Hands" value={stats.n} />
            <Stat label="Net" value={`${stats.net >= 0 ? '+' : ''}${stats.net.toFixed(1)} bb`} tone={stats.net >= 0 ? 'good' : 'bad'} />
            <Stat label="Win rate" value={`${(stats.net / stats.n * 100).toFixed(1)} bb/100`} />
            <Stat label="EV lost to mistakes" value={`${(stats.loss / stats.n * 100).toFixed(1)} bb/100`} tone={stats.loss > 0 ? 'warn' : undefined} />
          </div>
          <Panel title="Leak tracker">
            {stats.leaks.length === 0 ? <p className="text-sm text-muted">No flagged decisions yet.</p> : (
              <>
                <BarList rows={stats.leaks.map((l) => ({ id: l.tag, label: leakLabel(l.tag), value: l.loss, sub: `×${l.count}` }))} max={Math.max(...stats.leaks.map((l) => l.loss))} format={(v) => `${v.toFixed(1)} bb`} color="var(--c-bad)" labelWidth="20rem" />
                <p className="mt-2 text-xs text-muted">Sorted by total EV lost. A tag is added when a decision loses more than the threshold in Settings → Freeplay.</p>
              </>
            )}
          </Panel>
          <Panel title="Hands" actions={<label className="flex items-center gap-2 text-xs text-muted"><input type="checkbox" checked={onlyFlagged} onChange={(e) => setOnlyFlagged(e.target.checked)} /> only hands with mistakes</label>}>
            <ul className="divide-y divide-line text-sm">
              {shown.slice(0, 200).map((x) => (
                <li key={x.id}>
                  <button className={cx('flex w-full items-center justify-between gap-3 py-2 text-left', open === x.id && 'text-info')} onClick={() => setOpen(open === x.id ? null : x.id)}>
                    <span className="min-w-0 truncate">#{(x.data as ReviewData).handNo} · {new Date(x.at).toLocaleString()}</span>
                    <span className="flex shrink-0 items-center gap-2">
                      {x.mistakeTags.length > 0 && <Badge tone="warn">{x.mistakeTags.length} flagged</Badge>}
                      <span className={cx('font-mono', x.netBB > 0 ? 'text-good' : x.netBB < 0 ? 'text-bad' : 'text-muted')}>{x.netBB > 0 ? '+' : ''}{x.netBB.toFixed(2)} bb</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </Panel>
          {openHand && <HandReview key={openHand.id} data={openHand.data as ReviewData} />}
        </div>
      )}
    </div>
  )
}
