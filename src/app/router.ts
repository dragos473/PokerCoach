/**
 * Minimal hash router (no dependency): routes are "#/path/segments".
 * Hash routing works offline and from any static host, which suits the PWA.
 */
import { useSyncExternalStore } from 'react'

function currentPath(): string {
  const h = window.location.hash.replace(/^#/, '')
  return h.startsWith('/') ? h : '/' + h
}

function subscribe(cb: () => void) {
  window.addEventListener('hashchange', cb)
  return () => window.removeEventListener('hashchange', cb)
}

export function usePath(): string {
  return useSyncExternalStore(subscribe, currentPath, () => '/')
}

export function navigate(path: string): void {
  if (currentPath() !== path) window.location.hash = path
}

/** Match "/ranges/:id" against a path; returns params or null. */
export function matchRoute(pattern: string, path: string): Record<string, string> | null {
  const p = pattern.split('/').filter(Boolean)
  const s = path.split('?')[0].split('/').filter(Boolean)
  if (p.length !== s.length) return null
  const params: Record<string, string> = {}
  for (let i = 0; i < p.length; i++) {
    if (p[i].startsWith(':')) params[p[i].slice(1)] = decodeURIComponent(s[i])
    else if (p[i] !== s[i]) return null
  }
  return params
}
