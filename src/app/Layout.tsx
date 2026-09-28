/** App frame: sidebar on desktop, bottom tab bar on mobile. */
import { useState, type ReactNode } from 'react'
import { NAV } from './nav'
import { navigate, usePath } from './router'
import { Kbd, Modal } from '../components/ui'
import { cx } from '../lib/cx'
import { SettingsIcon } from '../components/icons'
import { useHotkeys } from '../hotkeys/useHotkeys'
import { useSettings } from '../store/settings'
import { HOTKEY_ACTIONS, SCOPE_LABELS, type HotkeyScope } from '../hotkeys/actions'

function isActive(path: string, item: string) {
  return item === '/' ? path === '/' : path === item || path.startsWith(item + '/')
}

export function Layout({ children }: { children: ReactNode }) {
  const path = usePath()
  const theme = useSettings((s) => s.settings.appearance.theme)
  const update = useSettings((s) => s.update)
  const [help, setHelp] = useState(false)

  useHotkeys({
    'nav.home': () => navigate('/'),
    'nav.ranges': () => navigate('/ranges'),
    'nav.odds': () => navigate('/odds'),
    'nav.lessons': () => navigate('/lessons'),
    'nav.freeplay': () => navigate('/freeplay'),
    'nav.settings': () => navigate('/settings'),
    'global.toggleTheme': () => update('appearance', { theme: theme === 'light' ? 'dark' : 'light' }),
    'global.help': () => setHelp((h) => !h),
  })

  return (
    <div className="flex min-h-dvh">
      <aside className="sticky top-0 hidden h-dvh w-52 shrink-0 flex-col border-r border-line bg-surface md:flex">
        <a href="#/" className="flex items-center gap-2 px-4 py-4">
          <span className="grid h-7 w-7 place-items-center rounded-md bg-accent text-sm font-bold text-accent-fg">♠</span>
          <span className="font-semibold tracking-tight">PokerCoach</span>
        </a>
        <nav className="flex flex-1 flex-col gap-0.5 px-2">
          {NAV.map((item) => (
            <a
              key={item.path}
              href={`#${item.path}`}
              className={cx(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-ui',
                isActive(path, item.path) ? 'bg-surface-2 text-fg' : 'text-muted hover:bg-surface-2/60 hover:text-fg',
              )}
            >
              <item.icon className="h-[1.1rem] w-[1.1rem]" />
              {item.label}
            </a>
          ))}
        </nav>
        <button onClick={() => setHelp(true)} className="m-2 flex items-center gap-2 rounded-md px-3 py-2 text-xs text-muted hover:text-fg">
          <Kbd>?</Kbd> Keyboard shortcuts
        </button>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-surface/95 px-4 py-2.5 backdrop-blur md:hidden">
          <a href="#/" className="flex items-center gap-2">
            <span className="grid h-6 w-6 place-items-center rounded bg-accent text-xs font-bold text-accent-fg">♠</span>
            <span className="text-sm font-semibold">PokerCoach</span>
          </a>
          <a href="#/settings" className="rounded p-1 text-muted" aria-label="Settings"><SettingsIcon /></a>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-24 pt-5 md:px-8 md:pb-10 md:pt-8">{children}</main>
        <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
          {NAV.filter((n) => n.mobile).map((item) => (
            <a
              key={item.path}
              href={`#${item.path}`}
              className={cx('flex flex-col items-center gap-0.5 py-2 text-[0.65rem]', isActive(path, item.path) ? 'text-fg' : 'text-muted')}
            >
              <item.icon className="h-5 w-5" />
              {item.label}
            </a>
          ))}
        </nav>
      </div>

      <Modal open={help} onClose={() => setHelp(false)} title="Keyboard shortcuts">
        <ShortcutList />
        <p className="mt-4 text-xs text-muted">Remap any shortcut in Settings → Keyboard.</p>
      </Modal>
    </div>
  )
}

function ShortcutList() {
  const bindings = useSettings((s) => s.settings.keybindings)
  const scopes = Object.keys(SCOPE_LABELS) as HotkeyScope[]
  return (
    <div className="space-y-4">
      {scopes.map((scope) => (
        <div key={scope}>
          <h3 className="mb-1 text-xs uppercase tracking-wider text-muted">{SCOPE_LABELS[scope]}</h3>
          <ul className="divide-y divide-line">
            {HOTKEY_ACTIONS.filter((a) => a.scope === scope).map((a) => (
              <li key={a.id} className="flex items-center justify-between py-1.5 text-sm">
                <span>{a.label}</span>
                <Kbd>{bindings[a.id] || 'unset'}</Kbd>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}
