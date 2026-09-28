/**
 * Small dependency-free SVG charts following the project's data-viz rules:
 * 2px lines, hairline recessive grid, one y-axis, bands as ~10 % washes, legend for >= 2 series,
 * crosshair + tooltip on hover, text in text tokens (never the series colour).
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null)
  const [w, setW] = useState(600)
  useEffect(() => {
    if (!ref.current) return
    const ro = new ResizeObserver((entries) => setW(entries[0].contentRect.width))
    ro.observe(ref.current)
    return () => ro.disconnect()
  }, [])
  return [ref, w]
}

/** "Nice" tick values covering [min, max]. */
export function niceTicks(min: number, max: number, count = 5): number[] {
  if (!(max > min)) return [min]
  const span = max - min
  const raw = span / count
  const mag = Math.pow(10, Math.floor(Math.log10(raw)))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= count) ?? 10 * mag
  const out: number[] = []
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) out.push(Number(v.toFixed(10)))
  return out
}

export interface LineSeries {
  id: string
  label?: string
  color: string
  y: number[]
  width?: number
  opacity?: number
  /** Include in tooltip and legend. */
  named?: boolean
}

export interface Band { id: string; label: string; lower: number[]; upper: number[]; color: string }
export interface RefLine { y: number; label: string; color?: string }

export function LineChart({ x, series, bands = [], refLines = [], height = 320, formatX = String, formatY = String, formatTooltipX, yLabel, legendExtra }: {
  x: number[]; series: LineSeries[]; bands?: Band[]; refLines?: RefLine[]; height?: number
  formatX?: (v: number) => string; formatY?: (v: number) => string; formatTooltipX?: (v: number) => string; yLabel?: string; legendExtra?: ReactNode
}) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const m = { l: 76, r: 16, t: 12, b: 28 }
  const W = Math.max(200, width), H = height
  const { yMin, yMax } = useMemo(() => {
    let lo = Infinity, hi = -Infinity
    for (const s of series) for (const v of s.y) { if (v < lo) lo = v; if (v > hi) hi = v }
    for (const b of bands) for (let i = 0; i < b.lower.length; i++) { lo = Math.min(lo, b.lower[i]); hi = Math.max(hi, b.upper[i]) }
    for (const r of refLines) { lo = Math.min(lo, r.y); hi = Math.max(hi, r.y) }
    if (lo === hi) { lo -= 1; hi += 1 }
    const pad = (hi - lo) * 0.05
    return { yMin: lo - pad, yMax: hi + pad }
  }, [series, bands, refLines])
  const xMin = x[0], xMax = x[x.length - 1]
  const sx = (v: number) => m.l + ((v - xMin) / (xMax - xMin || 1)) * (W - m.l - m.r)
  const sy = (v: number) => m.t + (1 - (v - yMin) / (yMax - yMin)) * (H - m.t - m.b)
  const path = (ys: number[]) => ys.map((v, i) => `${i ? 'L' : 'M'}${sx(x[i]).toFixed(1)},${sy(v).toFixed(1)}`).join('')
  const yTicks = niceTicks(yMin, yMax, 5)
  const xTicks = niceTicks(xMin, xMax, Math.max(2, Math.floor(W / 110)))
  const named = series.filter((s) => s.named)

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const px = e.clientX - rect.left
    const v = xMin + ((px - m.l) / (W - m.l - m.r)) * (xMax - xMin)
    let best = 0
    for (let i = 1; i < x.length; i++) if (Math.abs(x[i] - v) < Math.abs(x[best] - v)) best = i
    setHover(best)
  }

  return (
    <div ref={ref} className="relative w-full">
      {(named.length + bands.length >= 2 || legendExtra) && (
        <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
          {named.map((s) => <span key={s.id} className="inline-flex items-center gap-1.5"><span className="h-0.5 w-4 rounded" style={{ background: s.color }} />{s.label}</span>)}
          {bands.map((b) => <span key={b.id} className="inline-flex items-center gap-1.5"><span className="h-2.5 w-4 rounded-sm" style={{ background: b.color, opacity: 0.25 }} />{b.label}</span>)}
          {legendExtra}
        </div>
      )}
      <svg width={W} height={H} className="block touch-none select-none" onPointerMove={onMove} onPointerLeave={() => setHover(null)} role="img" aria-label={yLabel}>
        {yTicks.map((t) => (
          <g key={t}>
            <line x1={m.l} x2={W - m.r} y1={sy(t)} y2={sy(t)} stroke="var(--chart-grid)" strokeWidth={1} />
            <text x={m.l - 6} y={sy(t)} dy="0.32em" textAnchor="end" fontSize={11} fill="var(--c-muted)">{formatY(t)}</text>
          </g>
        ))}
        {xTicks.map((t) => (
          <text key={t} x={sx(t)} y={H - 8} textAnchor={sx(t) > W - m.r - 30 ? 'end' : 'middle'} fontSize={11} fill="var(--c-muted)">{formatX(t)}</text>
        ))}
        {yMin < 0 && yMax > 0 && <line x1={m.l} x2={W - m.r} y1={sy(0)} y2={sy(0)} stroke="var(--c-muted)" strokeOpacity={0.5} strokeWidth={1} />}
        {bands.map((b) => (
          <path key={b.id} d={`${path(b.upper)}${b.lower.map((_, i) => `L${sx(x[b.lower.length - 1 - i]).toFixed(1)},${sy(b.lower[b.lower.length - 1 - i]).toFixed(1)}`).join('')}Z`}
            fill={b.color} fillOpacity={0.12} stroke="none" />
        ))}
        {refLines.map((r) => (
          <g key={r.label}>
            <line x1={m.l} x2={W - m.r} y1={sy(r.y)} y2={sy(r.y)} stroke={r.color ?? 'var(--c-bad)'} strokeWidth={1.5} />
            <text x={W - m.r - 4} y={sy(r.y) - 5} textAnchor="end" fontSize={11} fill="var(--c-muted)">{r.label}</text>
          </g>
        ))}
        {series.map((s) => (
          <path key={s.id} d={path(s.y)} fill="none" stroke={s.color} strokeWidth={s.width ?? 2} strokeOpacity={s.opacity ?? 1} strokeLinejoin="round" strokeLinecap="round" />
        ))}
        {hover !== null && (
          <g>
            <line x1={sx(x[hover])} x2={sx(x[hover])} y1={m.t} y2={H - m.b} stroke="var(--c-muted)" strokeWidth={1} />
            {named.map((s) => <circle key={s.id} cx={sx(x[hover])} cy={sy(s.y[hover])} r={4} fill={s.color} stroke="var(--c-surface)" strokeWidth={2} />)}
          </g>
        )}
      </svg>
      {hover !== null && (named.length > 0 || bands.length > 0) && (
        <div className="pointer-events-none absolute top-8 z-10 rounded-md border border-line bg-surface px-2.5 py-1.5 text-xs shadow-lg"
          style={{ left: Math.min(W - 170, Math.max(0, sx(x[hover]) + 10)) }}>
          <div className="mb-1 text-muted">{(formatTooltipX ?? formatX)(x[hover])}</div>
          {named.map((s) => (
            <div key={s.id} className="flex items-center justify-between gap-3"><span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-3" style={{ background: s.color }} />{s.label}</span><span className="font-mono tabular">{formatY(s.y[hover])}</span></div>
          ))}
          {bands.map((b) => (
            <div key={b.id} className="flex items-center justify-between gap-3"><span>{b.label}</span><span className="font-mono tabular">{formatY(b.lower[hover])} … {formatY(b.upper[hover])}</span></div>
          ))}
        </div>
      )}
    </div>
  )
}

/** Horizontal bars (single series), value at the tip, hover tooltip. */
export function BarList({ rows, max = 1, format = String, color = 'var(--series-1)' }: {
  rows: { id: string; label: string; value: number; sub?: string }[]; max?: number; format?: (v: number) => string; color?: string
}) {
  const [hover, setHover] = useState<string | null>(null)
  return (
    <div className="space-y-1.5">
      {rows.map((r) => (
        <div key={r.id} className="grid grid-cols-[8rem_minmax(0,1fr)] items-center gap-3 text-xs" onPointerEnter={() => setHover(r.id)} onPointerLeave={() => setHover(null)}>
          <span className="truncate text-muted" title={r.label}>{r.label}</span>
          <div className="flex items-center gap-2">
            <div className="h-3 flex-1">
              <div className="h-3 rounded-r" style={{ width: `${Math.max(0, Math.min(1, r.value / max)) * 100}%`, background: color, opacity: hover && hover !== r.id ? 0.55 : 1 }} />
            </div>
            <span className="w-24 text-right font-mono tabular">{format(r.value)}{r.sub && <span className="text-muted"> {r.sub}</span>}</span>
          </div>
        </div>
      ))}
    </div>
  )
}
