import { describe, it, expect } from 'vitest'
import { DEFAULT_SETTINGS, normalizeSettings, mergeWithDefaults, HUD_ITEMS } from '../settingsSchema'
import { DEFAULT_KEYBINDINGS } from '../../hotkeys/actions'

describe('settings normalisation', () => {
  it('returns defaults for missing / garbage input', () => {
    expect(normalizeSettings(undefined)).toEqual(DEFAULT_SETTINGS)
    expect(normalizeSettings('nope')).toEqual(DEFAULT_SETTINGS)
  })

  it('keeps valid stored values, drops unknown keys and fixes wrong types', () => {
    const s = normalizeSettings({
      appearance: { theme: 'light', fontScale: 'huge', bogus: 1 },
      equity: { iterations: 5000, maxExactEvaluations: Infinity },
      somethingOld: true,
    })
    expect(s.appearance.theme).toBe('light')
    expect(s.appearance.fontScale).toBe(DEFAULT_SETTINGS.appearance.fontScale)
    expect((s.appearance as unknown as Record<string, unknown>).bogus).toBeUndefined()
    expect(s.equity.iterations).toBe(5000)
    expect(s.equity.maxExactEvaluations).toBe(DEFAULT_SETTINGS.equity.maxExactEvaluations)
    expect((s as unknown as Record<string, unknown>).somethingOld).toBeUndefined()
  })

  it('merges keybindings: overrides kept, new actions get defaults, unknown dropped', () => {
    const s = normalizeSettings({ keybindings: { 'freeplay.fold': 'X', 'old.action': 'Q' } })
    expect(s.keybindings['freeplay.fold']).toBe('X')
    expect(s.keybindings['freeplay.call']).toBe(DEFAULT_KEYBINDINGS['freeplay.call'])
    expect(s.keybindings['old.action']).toBeUndefined()
  })

  it('keeps HUD order and appends new items', () => {
    const s = normalizeSettings({ hud: { items: [{ id: 'ev', visible: false }, { id: 'pot', visible: true }, { id: 'nope', visible: true }] } })
    expect(s.hud.items[0]).toEqual({ id: 'ev', visible: false })
    expect(s.hud.items[1].id).toBe('pot')
    expect(s.hud.items).toHaveLength(HUD_ITEMS.length)
  })

  it('fills missing bot profile fields', () => {
    const s = normalizeSettings({ freeplay: { profiles: [{ id: 'x', name: 'Mine', vpip: 40 }] } })
    expect(s.freeplay.profiles).toHaveLength(1)
    expect(s.freeplay.profiles[0].vpip).toBe(40)
    expect(typeof s.freeplay.profiles[0].pfr).toBe('number')
  })

  it('mergeWithDefaults takes arrays from storage', () => {
    expect(mergeWithDefaults({ a: [1, 2] }, { a: [3] })).toEqual({ a: [3] })
    expect(mergeWithDefaults({ a: [1, 2] }, { a: 'x' })).toEqual({ a: [1, 2] })
  })
})
