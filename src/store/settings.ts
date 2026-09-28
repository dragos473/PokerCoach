/**
 * Settings store (Zustand) persisted to IndexedDB (debounced).
 */
import { create } from 'zustand'
import { getDb } from '../db/db'
import {
  DEFAULT_SETTINGS, normalizeSettings, type AppSettings, type SettingsSection,
} from './settingsSchema'

interface SettingsState {
  settings: AppSettings
  loaded: boolean
  load: () => Promise<void>
  update: <K extends SettingsSection>(section: K, patch: Partial<AppSettings[K]>) => void
  replace: (next: AppSettings) => void
  resetSection: (section: SettingsSection) => void
  resetAll: () => void
}

let saveTimer: ReturnType<typeof setTimeout> | null = null
function scheduleSave(settings: AppSettings) {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    getDb().settings.put({ key: 'app', value: settings }).catch((e) => console.error('Saving settings failed', e))
  }, 250)
}

export const useSettings = create<SettingsState>((set, get) => ({
  settings: structuredClone(DEFAULT_SETTINGS),
  loaded: false,
  load: async () => {
    try {
      const row = await getDb().settings.get('app')
      set({ settings: normalizeSettings(row?.value), loaded: true })
    } catch (e) {
      console.error('Loading settings failed, using defaults', e)
      set({ loaded: true })
    }
  },
  update: (section, patch) => {
    const current = get().settings
    const next: AppSettings = {
      ...current,
      [section]: Array.isArray(current[section]) ? patch : { ...(current[section] as object), ...patch },
    }
    set({ settings: next })
    scheduleSave(next)
  },
  replace: (next) => {
    const normalized = normalizeSettings(next)
    set({ settings: normalized })
    scheduleSave(normalized)
  },
  resetSection: (section) => {
    const next = { ...get().settings, [section]: structuredClone(DEFAULT_SETTINGS[section]) }
    set({ settings: next })
    scheduleSave(next)
  },
  resetAll: () => {
    const next = structuredClone(DEFAULT_SETTINGS)
    set({ settings: next })
    scheduleSave(next)
  },
}))

/** Convenience selector for one section. */
export function useSection<K extends SettingsSection>(section: K): AppSettings[K] {
  return useSettings((s) => s.settings[section])
}
