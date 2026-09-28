/**
 * Engine diagnostics: reference matchups recomputed live, plus a free-form equity run.
 * All computation runs in the engine worker.
 */
import { useState } from 'react'
import { useEngine } from '../../lib/useEngine'
import { parseCards, parseRange, liveCombos, type EquityResult, type EquityMethod } from '../../engine'

interface Matchup {
  label: string
  players: string[]
  board?: string
  method?: EquityMethod
  note: string
}

const REFERENCE: Matchup[] = [
  { label: 'AA vs KK (all suit combos)', players: ['AA', 'KK'], method: 'exact', note: 'commonly quoted ≈ 81.9 / 18.1' },
  { label: 'AsAh vs KdKc (no shared suit)', players: ['AsAh', 'KdKc'], note: '' },
  { label: 'AsAh vs KsKh (both suits shared)', players: ['AsAh', 'KsKh'], note: '' },
  { label: 'AKs vs QQ', players: ['AKs', 'QQ'], method: 'exact', note: 'commonly quoted ≈ 46 / 54' },
  { label: 'AKo vs QQ', players: ['AKo', 'QQ'], method: 'exact', note: 'commonly quoted ≈ 43 / 57' },
  { label: 'AsKd vs 2c2h', players: ['AsKd', '2c2h'], note: 'classic coin flip ≈ 47 / 53' },
  { label: 'AsAh vs random hand', players: ['AsAh', 'any'], method: 'monte-carlo', note: 'commonly quoted ≈ 85.2' },
  { label: '7c2d vs random hand', players: ['7c2d', 'any'], method: 'monte-carlo', note: 'commonly quoted ≈ 34.6' },
  { label: 'Set vs nut flush draw + 2 overs', players: ['7s7d', 'AhKh'], board: '7h8h2c', note: 'set ≈ 75' },
  { label: 'Flush draw vs set on the turn', players: ['AhKh', '7s7d'], board: '7h8h2c9s', note: 'analytic 7/44 = 15.91' },
  { label: '3-way AA / KK / QQ', players: ['AsAh', 'KsKh', 'QsQh'], note: '' },
]

function toPlayers(texts: string[]) {
  return texts.map((t) => ({ combos: liveCombos(parseRange(t)) }))
}

function fmtPct(x: number) {
  return (x * 100).toFixed(2)
}

function ResultCells({ r }: { r: EquityResult }) {
  return (
    <>
      <td className="px-3 py-2 font-mono tabular-nums">
        {r.players.map((p) => fmtPct(p.equity)).join(' / ')}
      </td>
      <td className="px-3 py-2 font-mono tabular-nums text-[var(--c-muted)]">
        {r.method === 'exact' ? 'exact' : `± ${fmtPct(r.players[0].marginOfError95)} (95%)`}
      </td>
      <td className="px-3 py-2 font-mono tabular-nums text-[var(--c-muted)]">
        {r.samples.toLocaleString()} · {Math.round(r.elapsedMs)} ms
      </td>
    </>
  )
}

export function DiagnosticsPage() {
  const engine = useEngine()
  const getClient = () => engine

  const [refResults, setRefResults] = useState<(EquityResult | string | null)[]>(REFERENCE.map(() => null))
  const [running, setRunning] = useState(false)

  const [inputs, setInputs] = useState(['AKs', 'QQ'])
  const [board, setBoard] = useState('')
  const [method, setMethod] = useState<EquityMethod>('auto')
  const [iterations, setIterations] = useState(200_000)
  const [custom, setCustom] = useState<EquityResult | null>(null)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState('')

  async function runReference() {
    setRunning(true)
    const out: (EquityResult | string | null)[] = REFERENCE.map(() => null)
    for (let i = 0; i < REFERENCE.length; i++) {
      const m = REFERENCE[i]
      try {
        out[i] = await getClient().equity({
          players: toPlayers(m.players),
          board: m.board ? parseCards(m.board) : [],
          dead: [],
          method: m.method ?? 'auto',
          iterations: 1_000_000,
        })
      } catch (e) {
        out[i] = e instanceof Error ? e.message : String(e)
      }
      setRefResults([...out])
    }
    setRunning(false)
  }

  async function runCustom() {
    setError('')
    setCustom(null)
    setProgress(0)
    try {
      const players = toPlayers(inputs.filter((s) => s.trim()))
      const r = await getClient().equity(
        { players, board: board.trim() ? parseCards(board) : [], dead: [], method, iterations },
        { onProgress: (f, partial) => { setProgress(f); if (partial) setCustom(partial) } },
      )
      setCustom(r)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (msg !== 'cancelled') setError(msg)
    }
  }

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-xl font-semibold">Engine diagnostics</h1>
        <p className="text-sm text-muted">
          Reference matchups recomputed live by the engine in a Web Worker, compared with commonly quoted values.
        </p>
      </header>

      <section className="rounded-lg border border-[var(--c-line)] bg-[var(--c-surface)]">
        <div className="flex items-center justify-between p-4">
          <h2 className="font-medium">Reference matchups</h2>
          <button
            onClick={runReference}
            disabled={running}
            className="rounded-md bg-[var(--c-accent)] px-3 py-1.5 text-sm font-medium disabled:opacity-50"
          >
            {running ? 'Running…' : 'Run all'}
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-[var(--c-muted)]">
              <tr>
                <th className="px-3 py-2 font-normal">Matchup</th>
                <th className="px-3 py-2 font-normal">Equity %</th>
                <th className="px-3 py-2 font-normal">Method</th>
                <th className="px-3 py-2 font-normal">Samples · time</th>
                <th className="px-3 py-2 font-normal">Reference</th>
              </tr>
            </thead>
            <tbody>
              {REFERENCE.map((m, i) => {
                const r = refResults[i]
                return (
                  <tr key={m.label} className="border-t border-[var(--c-line)]">
                    <td className="px-3 py-2">
                      {m.label}
                      {m.board && <span className="ml-1 font-mono text-[var(--c-muted)]">[{m.board}]</span>}
                    </td>
                    {r && typeof r !== 'string' ? (
                      <ResultCells r={r} />
                    ) : (
                      <td colSpan={3} className="px-3 py-2 text-[var(--c-muted)]">{typeof r === 'string' ? r : '·'}</td>
                    )}
                    <td className="px-3 py-2 text-[var(--c-muted)]">{m.note}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-4 rounded-lg border border-[var(--c-line)] bg-[var(--c-surface)] p-4">
        <h2 className="font-medium">Custom calculation</h2>
        <p className="text-xs text-[var(--c-muted)]">
          Players accept a hand (AsKd) or range notation (22+, A2s+, KTo+, AKs:50%, any). Board: e.g. 7h8h2c.
        </p>
        {inputs.map((v, i) => (
          <div key={i} className="flex gap-2">
            <input
              value={v}
              onChange={(e) => setInputs(inputs.map((x, j) => (j === i ? e.target.value : x)))}
              className="flex-1 rounded-md border border-[var(--c-line)] bg-[var(--c-bg)] px-3 py-2 font-mono text-sm"
              placeholder={`Player ${i + 1}`}
            />
            {inputs.length > 2 && (
              <button onClick={() => setInputs(inputs.filter((_, j) => j !== i))} className="px-2 text-[var(--c-muted)]">
                ✕
              </button>
            )}
          </div>
        ))}
        <div className="flex flex-wrap gap-2">
          {inputs.length < 9 && (
            <button onClick={() => setInputs([...inputs, ''])} className="rounded-md border border-[var(--c-line)] px-3 py-1.5 text-sm">
              + player
            </button>
          )}
          <input
            value={board}
            onChange={(e) => setBoard(e.target.value)}
            placeholder="Board"
            className="w-36 rounded-md border border-[var(--c-line)] bg-[var(--c-bg)] px-3 py-1.5 font-mono text-sm"
          />
          <select
            value={method}
            onChange={(e) => setMethod(e.target.value as EquityMethod)}
            className="rounded-md border border-[var(--c-line)] bg-[var(--c-bg)] px-2 py-1.5 text-sm"
          >
            <option value="auto">auto</option>
            <option value="exact">exact</option>
            <option value="monte-carlo">Monte Carlo</option>
          </select>
          <input
            type="number"
            value={iterations}
            min={1000}
            step={10000}
            onChange={(e) => setIterations(Number(e.target.value))}
            className="w-32 rounded-md border border-[var(--c-line)] bg-[var(--c-bg)] px-3 py-1.5 font-mono text-sm"
            title="Monte Carlo iterations"
          />
          <button onClick={runCustom} className="rounded-md bg-[var(--c-accent)] px-3 py-1.5 text-sm font-medium">
            Calculate
          </button>
          <button onClick={() => getClient().cancel()} className="rounded-md border border-[var(--c-line)] px-3 py-1.5 text-sm">
            Stop
          </button>
        </div>
        {error && <p className="text-sm text-[var(--c-accent)]">{error}</p>}
        {progress > 0 && progress < 1 && (
          <div className="h-1 rounded bg-[var(--c-line)]">
            <div className="h-1 rounded bg-[var(--c-accent)]" style={{ width: `${progress * 100}%` }} />
          </div>
        )}
        {custom && (
          <table className="w-full text-sm">
            <tbody>
              {custom.players.map((p, i) => (
                <tr key={i} className="border-t border-[var(--c-line)]">
                  <td className="px-3 py-2 font-mono">{inputs.filter((s) => s.trim())[i]}</td>
                  <td className="px-3 py-2 font-mono tabular-nums">{fmtPct(p.equity)}%</td>
                  <td className="px-3 py-2 font-mono tabular-nums text-[var(--c-muted)]">
                    win {fmtPct(p.win)} · tie {fmtPct(p.tie)}
                    {custom.method === 'monte-carlo' && ` · ± ${fmtPct(p.marginOfError95)}`}
                  </td>
                </tr>
              ))}
              <tr className="border-t border-[var(--c-line)] text-[var(--c-muted)]">
                <td colSpan={3} className="px-3 py-2">
                  {custom.method} · {custom.samples.toLocaleString()} samples · {Math.round(custom.elapsedMs)} ms
                </td>
              </tr>
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}
