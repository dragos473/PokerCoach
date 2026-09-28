/**
 * "Show the math": renders an Explanation produced by FORMULAS[id].explain(...).
 * MathValue shows a number that expands into its derivation on click.
 */
import { useState, type ReactNode } from 'react'
import type { Explanation } from '../engine/formulas'
import { Badge } from './ui'
import { cx } from '../lib/cx'
import { useSection } from '../store/settings'

const KIND_LABEL = { math: 'exact maths', model: 'exact under assumptions', heuristic: 'heuristic' } as const
const KIND_TONE = { math: 'good', model: 'info', heuristic: 'warn' } as const

export function MathExplain({ e, extra }: { e: Explanation; extra?: ReactNode }) {
  return (
    <div className="space-y-2 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{e.name}</span>
        <Badge tone={KIND_TONE[e.kind]}>{KIND_LABEL[e.kind]}</Badge>
      </div>
      <p className="rounded bg-surface-2 px-2 py-1.5 font-mono text-xs">{e.expression}</p>
      <ol className="space-y-0.5 font-mono text-xs text-muted">
        {e.steps.map((s, i) => <li key={i}>{s}</li>)}
      </ol>
      {e.assumptions.length > 0 && (
        <ul className="list-disc space-y-0.5 pl-4 text-xs text-muted">
          {e.assumptions.map((a) => <li key={a}>{a}</li>)}
        </ul>
      )}
      {extra}
    </div>
  )
}

export function MathValue({ e, children, className }: { e: Explanation; children: ReactNode; className?: string }) {
  const def = useSection('display').showMathByDefault
  const [open, setOpen] = useState(def)
  return (
    <span className={cx('inline-flex flex-col', className)}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-fit border-b border-dotted border-muted/60 text-left hover:border-fg transition-ui"
        title="Show the math"
      >
        {children}
      </button>
      {open && (
        <span className="animate-in mt-2 block rounded-md border border-line bg-surface p-3">
          <MathExplain e={e} />
        </span>
      )}
    </span>
  )
}

/** Free-form math block for results that are not a single registry formula (e.g. equity). */
export function MathNote({ title, lines, kind = 'math', assumptions = [] }: {
  title: string; lines: string[]; kind?: 'math' | 'model' | 'heuristic'; assumptions?: string[]
}) {
  return (
    <div className="space-y-1.5 text-sm">
      <div className="flex items-center gap-2">
        <span className="font-medium">{title}</span>
        <Badge tone={KIND_TONE[kind]}>{KIND_LABEL[kind]}</Badge>
      </div>
      <ol className="space-y-0.5 font-mono text-xs text-muted">{lines.map((l, i) => <li key={i}>{l}</li>)}</ol>
      {assumptions.length > 0 && (
        <ul className="list-disc pl-4 text-xs text-muted">{assumptions.map((a) => <li key={a}>{a}</li>)}</ul>
      )}
    </div>
  )
}
