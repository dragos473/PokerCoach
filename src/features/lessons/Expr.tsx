/** Renders an inline lesson expression, computed by the engine (equity in a worker). */
import { useEffect, useState } from 'react'
import { evaluateExpr, parseExpr, type ExprValue } from './expressions'
import { EngineClient } from '../../engine/worker/client'
import type { EquityRequest, EquityResult } from '../../engine/equity'
import { MathExplain } from '../../components/MathExplain'
import { cx } from '../../lib/cx'

// Shared, sequential equity runner for all lesson expressions (one worker, jobs queued).
let client: EngineClient | null = null
let chain: Promise<unknown> = Promise.resolve()
export function runEquityQueued(req: EquityRequest): Promise<EquityResult> {
  client ??= new EngineClient()
  const p = chain.then(() => client!.equity({ players: req.players, board: req.board ?? [], dead: req.dead ?? [], method: req.method ?? 'auto', iterations: req.iterations, seed: req.seed }))
  chain = p.catch(() => {})
  return p
}

const cache = new Map<string, Promise<ExprValue>>()
export function computeExpr(source: string): Promise<ExprValue> {
  let p = cache.get(source)
  if (!p) {
    p = (async () => evaluateExpr(parseExpr(source), runEquityQueued))()
    cache.set(source, p)
    p.catch(() => cache.delete(source))
  }
  return p
}

export function useExpr(source: string): { value?: ExprValue; error?: string } {
  const [state, setState] = useState<{ value?: ExprValue; error?: string }>({})
  useEffect(() => {
    let alive = true
    computeExpr(source).then((value) => alive && setState({ value }), (e) => alive && setState({ error: e instanceof Error ? e.message : String(e) }))
    return () => { alive = false }
  }, [source])
  return state
}

export function Expr({ source }: { source: string }) {
  const { value, error } = useExpr(source)
  const [open, setOpen] = useState(false)
  if (error) return <span className="rounded bg-bad/15 px-1 font-mono text-xs text-bad" title={source}>⚠ {error}</span>
  if (!value) return <span className="inline-block h-3 w-10 animate-pulse rounded bg-surface-2 align-middle" />
  const explainable = !!(value.explanation || value.note)
  return (
    <span className="relative">
      <button type="button" disabled={!explainable} onClick={() => setOpen(!open)}
        className={cx('font-mono font-semibold text-fg', explainable && 'border-b border-dotted border-muted/70 hover:border-fg')} title={explainable ? 'Show how this is computed' : undefined}>
        {value.display}
      </button>
      {open && (
        <span className="animate-in absolute left-0 top-full z-20 mt-1 block w-80 max-w-[85vw] rounded-md border border-line bg-surface p-3 text-left text-sm font-normal shadow-xl">
          {value.explanation && <MathExplain e={value.explanation} />}
          {value.note && <span className="mt-1 block text-xs text-muted">{value.note}</span>}
          <span className="mt-2 block font-mono text-[0.65rem] text-muted/70">{`{{${source}}}`}</span>
        </span>
      )}
    </span>
  )
}

/** Plain text with inline {{expressions}} rendered. */
export function RichText({ text }: { text: string }) {
  const parts = text.split(/(\{\{[^{}]+\}\})/g)
  return <>{parts.map((p, i) => (p.startsWith('{{') ? <Expr key={i} source={p.slice(2, -2)} /> : <span key={i}>{p}</span>))}</>
}
