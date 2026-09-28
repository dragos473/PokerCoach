/**
 * Bind handlers for actions using the user's (remappable) keybindings.
 * Ignores keys typed into inputs, textareas, selects and contenteditable elements,
 * except Escape and bindings with Ctrl/Alt/Meta.
 */
import { useEffect, useRef } from 'react'
import { useSettings } from '../store/settings'
import { eventToKey } from './actions'

export function isTypingTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false
  const tag = t.tagName
  if (t.isContentEditable) return true
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (tag === 'INPUT') {
    const type = (t as HTMLInputElement).type
    return !['checkbox', 'radio', 'range', 'button', 'submit'].includes(type)
  }
  return false
}

export function useHotkeys(handlers: Record<string, (() => void) | undefined>, enabled = true): void {
  const bindings = useSettings((s) => s.settings.keybindings)
  const ref = useRef(handlers)
  useEffect(() => {
    ref.current = handlers
  })

  useEffect(() => {
    if (!enabled) return
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return
      const key = eventToKey(e)
      if (!key) return
      const hasMod = e.ctrlKey || e.altKey || e.metaKey
      if (isTypingTarget(e.target) && !hasMod && key !== 'Escape') return
      for (const [actionId, handler] of Object.entries(ref.current)) {
        if (handler && bindings[actionId] === key) {
          e.preventDefault()
          handler()
          return
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [bindings, enabled])
}
