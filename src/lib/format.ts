/** Display formatting helpers (no maths here, only presentation). */
export function fmtPct(x: number, decimals = 1): string {
  if (!Number.isFinite(x)) return '–'
  return `${(x * 100).toFixed(decimals)}%`
}

export function fmtNum(x: number, decimals = 2): string {
  if (!Number.isFinite(x)) return x > 0 ? '∞' : '–'
  return String(Number(x.toFixed(decimals)))
}

export function fmtBB(x: number, decimals = 1): string {
  if (!Number.isFinite(x)) return '–'
  const v = Number(x.toFixed(decimals))
  return `${v > 0 ? '' : ''}${v} bb`
}

export function fmtSigned(x: number, decimals = 2, unit = ''): string {
  if (!Number.isFinite(x)) return '–'
  const v = Number(x.toFixed(decimals))
  return `${v > 0 ? '+' : ''}${v}${unit}`
}

export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
}
