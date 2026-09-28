import { describe, it, expect } from 'vitest'
import { DEFAULT_KEYBINDINGS, eventToKey, findConflicts } from '../actions'

const ev = (key: string, code: string, mods: Partial<{ ctrlKey: boolean; altKey: boolean; metaKey: boolean; shiftKey: boolean }> = {}) =>
  ({ key, code, ctrlKey: false, altKey: false, metaKey: false, shiftKey: false, ...mods })

describe('hotkeys', () => {
  it('normalises key events', () => {
    expect(eventToKey(ev('f', 'KeyF'))).toBe('F')
    expect(eventToKey(ev('F', 'KeyF', { shiftKey: true }))).toBe('Shift+F')
    expect(eventToKey(ev('?', 'Slash', { shiftKey: true }))).toBe('?')
    expect(eventToKey(ev(' ', 'Space'))).toBe('Space')
    expect(eventToKey(ev('¡', 'Digit1', { altKey: true }))).toBe('Alt+1') // macOS Option+1 still maps to Alt+1
    expect(eventToKey(ev('z', 'KeyZ', { ctrlKey: true }))).toBe('Ctrl+Z')
    expect(eventToKey(ev('Shift', 'ShiftLeft', { shiftKey: true }))).toBeNull()
    expect(eventToKey(ev('Enter', 'Enter'))).toBe('Enter')
  })

  it('has no conflicts in the defaults', () => {
    expect(findConflicts(DEFAULT_KEYBINDINGS)).toEqual([])
  })

  it('detects conflicts within a scope and against global, but not across scopes', () => {
    expect(findConflicts({ ...DEFAULT_KEYBINDINGS, 'freeplay.call': 'F' })).toEqual([{ key: 'F', actions: ['freeplay.fold', 'freeplay.call'] }])
    expect(findConflicts({ ...DEFAULT_KEYBINDINGS, 'freeplay.fold': 'Alt+1' }).length).toBe(1)
    // F is used by both freeplay.fold and drill.fold: different scopes, fine
    expect(DEFAULT_KEYBINDINGS['drill.fold']).toBe(DEFAULT_KEYBINDINGS['freeplay.fold'])
  })
})
