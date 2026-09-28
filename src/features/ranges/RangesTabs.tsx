import { cx } from '../../lib/cx'

const TABS = [
  { href: '#/ranges', label: 'Library', match: (p: string) => p === '/ranges' },
  { href: '#/ranges/compare', label: 'Compare', match: (p: string) => p === '/ranges/compare' },
  { href: '#/ranges/drill', label: 'Drill', match: (p: string) => p === '/ranges/drill' },
]

export function RangesTabs({ path }: { path: string }) {
  return (
    <div className="mb-5 flex gap-1 border-b border-line">
      {TABS.map((t) => (
        <a key={t.href} href={t.href} className={cx('-mb-px border-b-2 px-3 py-2 text-sm transition-ui', t.match(path) ? 'border-accent text-fg' : 'border-transparent text-muted hover:text-fg')}>
          {t.label}
        </a>
      ))}
    </div>
  )
}
