import { cx } from '../../lib/cx'

const TABS = [
  { href: '#/odds', label: 'Calculator', path: '/odds' },
  { href: '#/odds/quiz', label: 'Quizzer', path: '/odds/quiz' },
  { href: '#/odds/stats', label: 'Progress', path: '/odds/stats' },
  { href: '#/odds/variance', label: 'Variance', path: '/odds/variance' },
]

export function OddsTabs({ path }: { path: string }) {
  return (
    <div className="mb-5 flex gap-1 overflow-x-auto border-b border-line">
      {TABS.map((t) => (
        <a key={t.href} href={t.href} className={cx('-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm transition-ui', t.path === path ? 'border-accent text-fg' : 'border-transparent text-muted hover:text-fg')}>{t.label}</a>
      ))}
    </div>
  )
}
