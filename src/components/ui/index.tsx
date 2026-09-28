/** Small, consistent UI primitives. Styling only; no business logic. */
import { useId, useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { cx } from '../../lib/cx'


type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export function Button({
  variant = 'secondary', size = 'md', className, ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: 'sm' | 'md' | 'lg' }) {
  return (
    <button
      type="button"
      {...rest}
      className={cx(
        'inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-ui select-none',
        'disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-info',
        size === 'sm' && 'h-7 px-2.5 text-xs',
        size === 'md' && 'h-9 px-3.5 text-sm',
        size === 'lg' && 'h-12 px-5 text-base',
        variant === 'primary' && 'bg-accent text-accent-fg hover:brightness-110 active:brightness-95',
        variant === 'secondary' && 'border border-line bg-surface-2 text-fg hover:border-muted/60',
        variant === 'ghost' && 'text-muted hover:bg-surface-2 hover:text-fg',
        variant === 'danger' && 'border border-bad/50 text-bad hover:bg-bad/10',
        className,
      )}
    />
  )
}

export function Panel({ title, actions, children, className, dense }: {
  title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; dense?: boolean
}) {
  return (
    <section className={cx('rounded-lg border border-line bg-surface', className)}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-2 border-b border-line px-4 py-2.5">
          <h2 className="text-sm font-semibold tracking-wide">{title}</h2>
          <div className="flex items-center gap-2">{actions}</div>
        </header>
      )}
      <div className={dense ? 'p-2.5' : 'p-4'}>{children}</div>
    </section>
  )
}

export function Field({ label, hint, children, htmlFor }: { label: ReactNode; hint?: ReactNode; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between sm:gap-6 py-2.5">
      <div className="min-w-0">
        <label htmlFor={htmlFor} className="text-sm">{label}</label>
        {hint && <p className="text-xs text-muted mt-0.5">{hint}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cx('relative h-6 w-11 rounded-full transition-ui', checked ? 'bg-accent' : 'bg-line')}
    >
      <span className={cx('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-ui', checked ? 'left-[1.375rem]' : 'left-0.5')} />
    </button>
  )
}

export function Select<T extends string>({ value, onChange, options, className, id }: {
  value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; className?: string; id?: string
}) {
  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
      className={cx('h-9 rounded-md border border-line bg-surface-2 px-2.5 text-sm', className)}
    >
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )
}

export function Segmented<T extends string>({ value, onChange, options, size = 'md' }: {
  value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[]; size?: 'sm' | 'md'
}) {
  return (
    <div className="inline-flex rounded-md border border-line bg-surface-2 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cx(
            'rounded px-3 transition-ui',
            size === 'sm' ? 'h-6 text-xs' : 'h-8 text-sm',
            value === o.value ? 'bg-surface text-fg shadow-sm' : 'text-muted hover:text-fg',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** Number input that commits on blur/Enter and clamps to [min, max]. */
export function NumberInput({ value, onChange, min, max, step = 1, className, suffix, id }: {
  value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; className?: string; suffix?: string; id?: string
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const commit = (text: string) => {
    setDraft(null)
    const n = Number(text)
    if (!Number.isFinite(n)) return
    let v = n
    if (min !== undefined) v = Math.max(min, v)
    if (max !== undefined) v = Math.min(max, v)
    onChange(v)
  }
  return (
    <span className="inline-flex items-center gap-1.5">
      <input
        id={id}
        type="number"
        inputMode="decimal"
        value={draft ?? String(value)}
        min={min}
        max={max}
        step={step}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') commit((e.target as HTMLInputElement).value) }}
        className={cx('h-9 w-24 rounded-md border border-line bg-surface-2 px-2.5 text-sm font-mono tabular', className)}
      />
      {suffix && <span className="text-xs text-muted">{suffix}</span>}
    </span>
  )
}

export function Slider({ value, onChange, min, max, step = 1, format, className, label }: {
  value: number; onChange: (v: number) => void; min: number; max: number; step?: number; format?: (v: number) => string; className?: string; label?: string
}) {
  return (
    <span className={cx('inline-flex items-center gap-2', className)}>
      <input
        type="range"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-36 accent-[var(--c-accent)]"
      />
      <span className="w-14 text-right font-mono text-xs tabular text-muted">{format ? format(value) : value}</span>
    </span>
  )
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-6 min-w-6 items-center justify-center rounded border border-line bg-surface-2 px-1.5 font-mono text-[0.7rem] text-muted">
      {children}
    </kbd>
  )
}

export function Spinner({ className }: { className?: string }) {
  return <span className={cx('inline-block h-4 w-4 animate-spin rounded-full border-2 border-line border-t-accent', className)} />
}

export function ProgressBar({ value, className }: { value: number; className?: string }) {
  return (
    <div className={cx('h-1 w-full overflow-hidden rounded bg-line', className)}>
      <div className="h-full bg-accent transition-ui" style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} />
    </div>
  )
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-line px-6 py-10 text-center">
      <p className="font-medium">{title}</p>
      {children && <div className="max-w-md text-sm text-muted">{children}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return <p role="alert" className="rounded-md border border-bad/40 bg-bad/10 px-3 py-2 text-sm text-bad">{children}</p>
}

/** Compact label/value tile for stat panels. */
export function Stat({ label, value, sub, tone, onClick, title }: {
  label: ReactNode; value: ReactNode; sub?: ReactNode; tone?: 'good' | 'bad' | 'warn' | 'info'; onClick?: () => void; title?: string
}) {
  const Comp = onClick ? 'button' : 'div'
  return (
    <Comp
      onClick={onClick}
      title={title}
      className={cx('flex min-w-0 flex-col items-start rounded-md bg-surface-2 px-2.5 py-1.5 text-left', onClick && 'hover:ring-1 hover:ring-line transition-ui cursor-help')}
    >
      <span className="truncate text-[0.68rem] uppercase tracking-wider text-muted">{label}</span>
      <span className={cx(
        'font-mono text-base font-semibold tabular',
        tone === 'good' && 'text-good', tone === 'bad' && 'text-bad', tone === 'warn' && 'text-warn', tone === 'info' && 'text-info',
      )}>{value}</span>
      {sub && <span className="truncate text-[0.68rem] text-muted">{sub}</span>}
    </Comp>
  )
}

export function TextInput({ value, onChange, placeholder, className, mono, id, onEnter, invalid }: {
  value: string; onChange: (v: string) => void; placeholder?: string; className?: string; mono?: boolean; id?: string; onEnter?: () => void; invalid?: boolean
}) {
  return (
    <input
      id={id}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => { if (e.key === 'Enter') onEnter?.() }}
      spellCheck={false}
      autoCapitalize="off"
      autoCorrect="off"
      className={cx(
        'h-9 rounded-md border bg-surface-2 px-2.5 text-sm',
        invalid ? 'border-bad' : 'border-line',
        mono && 'font-mono',
        className,
      )}
    />
  )
}

/** Modal dialog with backdrop; closes on Escape and backdrop click. */
export function Modal({ open, onClose, title, children, wide }: {
  open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; wide?: boolean
}) {
  const id = useId()
  if (!open) return null
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
      onKeyDown={(e) => { if (e.key === 'Escape') onClose() }}
    >
      <div
        role="dialog"
        aria-labelledby={id}
        className={cx('animate-in max-h-[92vh] w-full overflow-auto rounded-t-xl border border-line bg-surface sm:rounded-xl', wide ? 'sm:max-w-5xl' : 'sm:max-w-lg')}
      >
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-surface px-4 py-3">
          <h2 id={id} className="font-semibold">{title}</h2>
          <button onClick={onClose} className="rounded p-1 text-muted hover:text-fg" aria-label="Close">✕</button>
        </header>
        <div className="p-4">{children}</div>
      </div>
    </div>
  )
}

export function Badge({ children, tone }: { children: ReactNode; tone?: 'good' | 'bad' | 'warn' | 'info' | 'muted' }) {
  return (
    <span className={cx(
      'inline-flex items-center rounded px-1.5 py-0.5 text-[0.68rem] font-medium uppercase tracking-wide',
      tone === 'good' && 'bg-good/15 text-good',
      tone === 'bad' && 'bg-bad/15 text-bad',
      tone === 'warn' && 'bg-warn/15 text-warn',
      tone === 'info' && 'bg-info/15 text-info',
      (!tone || tone === 'muted') && 'bg-surface-2 text-muted',
    )}>{children}</span>
  )
}

export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}
