/**
 * 13x13 range grid. Rows/cols: A..2; suited above the diagonal, offsuit below, pairs on it.
 * Each cell shows stacked horizontal bars for its layers (e.g. raise / call), sized by the
 * class's average weight over its live combos (card removal applied). Optional heatmap mode.
 * Editing is delegated through `onStroke` (click + drag painting works with mouse and touch).
 */
import { useMemo, useRef } from 'react'
import { HAND_CLASSES, COMBO_CARDS } from '../engine/combos'
import { deadFlags, type Card } from '../engine/cards'
import type { Weights } from '../engine/range'
import { cx } from '../lib/cx'

export interface GridLayer {
  id: string
  weights: Weights
  /** CSS colour (usually a var). */
  color: string
}

export interface RangeGridProps {
  layers: GridLayer[]
  dead?: readonly Card[]
  /** Per-class value 0..1 (NaN = not applicable) shown as a colour scale instead of layers. */
  heatmap?: Float64Array | null
  onStroke?: (classIndex: number, phase: 'start' | 'move') => void
  onCellClick?: (classIndex: number) => void
  onHover?: (classIndex: number | null) => void
  selected?: number | null
  highlight?: number | null
  showCombos?: boolean
  className?: string
  compact?: boolean
}

/** Red (weak) → neutral → green (strong) scale for equity heatmaps, centred at 50 %. */
export function heatColor(v: number): string {
  if (!Number.isFinite(v)) return 'transparent'
  const t = Math.max(-1, Math.min(1, (v - 0.5) / 0.3))
  if (t >= 0) return `color-mix(in oklab, var(--c-good) ${Math.round(15 + 70 * t)}%, var(--c-surface-2))`
  return `color-mix(in oklab, var(--c-bad) ${Math.round(15 + 70 * -t)}%, var(--c-surface-2))`
}

export function RangeGrid({
  layers, dead, heatmap, onStroke, onCellClick, onHover, selected, highlight, showCombos, className, compact,
}: RangeGridProps) {
  const painting = useRef(false)
  const last = useRef(-1)

  const cells = useMemo(() => {
    const d = deadFlags(dead ?? [])
    return HAND_CLASSES.map((cls) => {
      const live = cls.combos.filter((c) => !d[COMBO_CARDS[2 * c]] && !d[COMBO_CARDS[2 * c + 1]])
      const fractions = layers.map((l) => (live.length ? live.reduce((s, c) => s + l.weights[c], 0) / live.length : 0))
      const combos = layers.reduce((s, l) => s + live.reduce((a, c) => a + l.weights[c], 0), 0)
      return { cls, live: live.length, fractions, combos }
    })
  }, [layers, dead])

  const cellAt = (x: number, y: number): number | null => {
    const el = document.elementFromPoint(x, y)?.closest('[data-cell]') as HTMLElement | null
    return el ? Number(el.dataset.cell) : null
  }

  const editable = !!onStroke
  return (
    <div
      className={cx('grid select-none grid-cols-13 gap-px rounded-md bg-line p-px', editable && 'touch-none', className)}
      style={{ gridTemplateColumns: 'repeat(13, minmax(0, 1fr))' }}
      onPointerDown={(e) => {
        const idx = cellAt(e.clientX, e.clientY)
        if (idx === null) return
        onCellClick?.(idx)
        if (!onStroke) return
        painting.current = true
        last.current = idx
        ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
        onStroke(idx, 'start')
      }}
      onPointerMove={(e) => {
        const idx = cellAt(e.clientX, e.clientY)
        if (onHover) onHover(idx)
        if (!painting.current || idx === null || idx === last.current) return
        last.current = idx
        onStroke?.(idx, 'move')
      }}
      onPointerUp={() => { painting.current = false; last.current = -1 }}
      onPointerCancel={() => { painting.current = false; last.current = -1 }}
      onPointerLeave={() => onHover?.(null)}
    >
      {cells.map(({ cls, live, fractions, combos }) => {
        const blocked = live === 0
        const heat = heatmap ? heatmap[cls.index] : undefined
        return (
          <div
            key={cls.index}
            data-cell={cls.index}
            className={cx(
              'relative aspect-square overflow-hidden',
              editable ? 'cursor-crosshair' : onCellClick && 'cursor-pointer',
              selected === cls.index && 'outline-2 -outline-offset-2 outline-fg z-10',
              highlight === cls.index && 'outline-2 -outline-offset-2 outline-warn z-10',
            )}
            style={{ background: heatmap ? heatColor(heat ?? NaN) : 'var(--c-surface-2)' }}
            title={`${cls.label}${blocked ? ' (blocked)' : ''}`}
          >
            {!heatmap && !blocked && (
              <div className="absolute inset-0 flex">
                {fractions.map((f, i) => f > 0 && (
                  <div key={layers[i].id} style={{ width: `${f * 100}%`, background: layers[i].color }} className="h-full" />
                ))}
              </div>
            )}
            <div className={cx(
              'pointer-events-none absolute inset-0 flex flex-col items-center justify-center leading-none',
              compact ? 'text-[0.5rem] sm:text-[0.6rem]' : 'text-[0.55rem] sm:text-[0.7rem]',
              blocked ? 'text-muted/40 line-through' : 'text-fg',
            )}>
              <span className={cx('font-medium', cls.kind === 'pair' && 'font-bold')} style={{ textShadow: '0 1px 1px rgb(0 0 0 / 0.35)' }}>{cls.label}</span>
              {heatmap && Number.isFinite(heat) && <span className="mt-0.5 font-mono text-[0.85em] opacity-90">{Math.round((heat as number) * 100)}</span>}
              {!heatmap && showCombos && combos > 0 && <span className="mt-0.5 font-mono text-[0.8em] opacity-80">{Number(combos.toFixed(1))}</span>}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function GridLegend({ items }: { items: { color: string; label: string; value?: string }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
      {items.map((it) => (
        <span key={it.label} className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm" style={{ background: it.color }} />
          {it.label}{it.value && <span className="font-mono text-fg">{it.value}</span>}
        </span>
      ))}
    </div>
  )
}
