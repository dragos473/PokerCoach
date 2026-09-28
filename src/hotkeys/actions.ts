/**
 * Keyboard actions. Every action has a scope; bindings must be unique within a scope and must not
 * collide with a global binding. All bindings are remappable in Settings.
 *
 * Key string format (see `eventToKey`):
 *   - printable key without Ctrl/Alt/Meta: the character, letters upper-cased ("F", "1", "?", "Space")
 *     and "Shift+F" for a shifted letter;
 *   - with Ctrl/Alt/Meta: modifiers + physical key, e.g. "Alt+1", "Ctrl+Z".
 */
export type HotkeyScope = 'global' | 'freeplay' | 'drill' | 'quiz' | 'grid'

export interface HotkeyAction {
  id: string
  scope: HotkeyScope
  label: string
  defaultKey: string
}

export const HOTKEY_ACTIONS: HotkeyAction[] = [
  { id: 'nav.home', scope: 'global', label: 'Go to home', defaultKey: 'Alt+0' },
  { id: 'nav.ranges', scope: 'global', label: 'Go to ranges', defaultKey: 'Alt+1' },
  { id: 'nav.odds', scope: 'global', label: 'Go to odds lab', defaultKey: 'Alt+2' },
  { id: 'nav.lessons', scope: 'global', label: 'Go to lessons', defaultKey: 'Alt+3' },
  { id: 'nav.freeplay', scope: 'global', label: 'Go to freeplay', defaultKey: 'Alt+4' },
  { id: 'nav.settings', scope: 'global', label: 'Go to settings', defaultKey: 'Alt+9' },
  { id: 'global.toggleTheme', scope: 'global', label: 'Toggle dark / light theme', defaultKey: 'Alt+T' },
  { id: 'global.help', scope: 'global', label: 'Show keyboard shortcuts', defaultKey: '?' },

  { id: 'freeplay.fold', scope: 'freeplay', label: 'Fold', defaultKey: 'F' },
  { id: 'freeplay.call', scope: 'freeplay', label: 'Check / call', defaultKey: 'C' },
  { id: 'freeplay.raise', scope: 'freeplay', label: 'Bet / raise (selected size)', defaultKey: 'R' },
  { id: 'freeplay.size1', scope: 'freeplay', label: 'Select sizing preset 1', defaultKey: '1' },
  { id: 'freeplay.size2', scope: 'freeplay', label: 'Select sizing preset 2', defaultKey: '2' },
  { id: 'freeplay.size3', scope: 'freeplay', label: 'Select sizing preset 3', defaultKey: '3' },
  { id: 'freeplay.size4', scope: 'freeplay', label: 'Select sizing preset 4', defaultKey: '4' },
  { id: 'freeplay.allIn', scope: 'freeplay', label: 'Select all-in', defaultKey: 'A' },
  { id: 'freeplay.next', scope: 'freeplay', label: 'Continue / next hand', defaultKey: 'Space' },
  { id: 'freeplay.toggleHud', scope: 'freeplay', label: 'Show / hide HUD', defaultKey: 'H' },
  { id: 'freeplay.rangeEditor', scope: 'freeplay', label: 'Open villain range estimator', defaultKey: 'E' },

  { id: 'drill.fold', scope: 'drill', label: 'Answer fold', defaultKey: 'F' },
  { id: 'drill.call', scope: 'drill', label: 'Answer call', defaultKey: 'C' },
  { id: 'drill.raise', scope: 'drill', label: 'Answer raise', defaultKey: 'R' },
  { id: 'drill.next', scope: 'drill', label: 'Next question', defaultKey: 'Space' },

  { id: 'quiz.submit', scope: 'quiz', label: 'Submit answer', defaultKey: 'Enter' },
  { id: 'quiz.next', scope: 'quiz', label: 'Next question', defaultKey: 'N' },
  { id: 'quiz.option1', scope: 'quiz', label: 'Choose option 1', defaultKey: '1' },
  { id: 'quiz.option2', scope: 'quiz', label: 'Choose option 2', defaultKey: '2' },
  { id: 'quiz.option3', scope: 'quiz', label: 'Choose option 3', defaultKey: '3' },
  { id: 'quiz.option4', scope: 'quiz', label: 'Choose option 4', defaultKey: '4' },

  { id: 'grid.undo', scope: 'grid', label: 'Undo range edit', defaultKey: 'Ctrl+Z' },
  { id: 'grid.redo', scope: 'grid', label: 'Redo range edit', defaultKey: 'Ctrl+Y' },
]

export const DEFAULT_KEYBINDINGS: Record<string, string> = Object.fromEntries(
  HOTKEY_ACTIONS.map((a) => [a.id, a.defaultKey]),
)

export const SCOPE_LABELS: Record<HotkeyScope, string> = {
  global: 'Global',
  freeplay: 'Freeplay table',
  drill: 'Range drill',
  quiz: 'Quizzer',
  grid: 'Range grid editor',
}

interface KeyLike {
  key: string
  code: string
  ctrlKey: boolean
  altKey: boolean
  metaKey: boolean
  shiftKey: boolean
}

const MODIFIER_KEYS = new Set(['Control', 'Alt', 'Shift', 'Meta', 'AltGraph', 'CapsLock'])

/** Normalise a keyboard event to a binding string, or null for bare modifier presses. */
export function eventToKey(e: KeyLike): string | null {
  if (MODIFIER_KEYS.has(e.key)) return null
  const physical = (): string => {
    if (e.code.startsWith('Key')) return e.code.slice(3)
    if (e.code.startsWith('Digit')) return e.code.slice(5)
    if (e.code.startsWith('Numpad')) return e.code.slice(6)
    if (e.code === 'Space') return 'Space'
    return e.key.length === 1 ? e.key.toUpperCase() : e.key
  }
  if (e.ctrlKey || e.altKey || e.metaKey) {
    const mods = [e.ctrlKey && 'Ctrl', e.altKey && 'Alt', e.metaKey && 'Meta', e.shiftKey && 'Shift'].filter(Boolean)
    return [...mods, physical()].join('+')
  }
  if (e.key === ' ') return 'Space'
  if (e.key.length === 1) {
    if (/[a-z]/i.test(e.key)) return e.shiftKey ? `Shift+${e.key.toUpperCase()}` : e.key.toUpperCase()
    return e.key
  }
  return e.key // Enter, Escape, ArrowUp, ...
}

export interface BindingConflict {
  key: string
  actions: string[]
}

/** Two actions conflict when they share a key and are in the same scope, or either is global. */
export function findConflicts(bindings: Record<string, string>): BindingConflict[] {
  const byId = new Map(HOTKEY_ACTIONS.map((a) => [a.id, a]))
  const conflicts: BindingConflict[] = []
  const ids = Object.keys(bindings).filter((id) => byId.has(id) && bindings[id])
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = byId.get(ids[i])!, b = byId.get(ids[j])!
      if (bindings[a.id] !== bindings[b.id]) continue
      if (a.scope === b.scope || a.scope === 'global' || b.scope === 'global') {
        const existing = conflicts.find((c) => c.key === bindings[a.id])
        if (existing) {
          for (const id of [a.id, b.id]) if (!existing.actions.includes(id)) existing.actions.push(id)
        } else conflicts.push({ key: bindings[a.id], actions: [a.id, b.id] })
      }
    }
  }
  return conflicts
}
