/** Applies appearance settings to <html> as data attributes and CSS variables. */
import { useEffect, useState } from 'react'
import { useSection } from '../store/settings'

function useSystemDark(): boolean {
  const [dark, setDark] = useState(() => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? true)
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)')
    if (!mq) return
    const on = () => setDark(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return dark
}

export function ThemeApplier() {
  const a = useSection('appearance')
  const systemDark = useSystemDark()
  useEffect(() => {
    const root = document.documentElement
    const theme = a.theme === 'system' ? (systemDark ? 'dark' : 'light') : a.theme
    root.dataset.theme = theme
    root.dataset.deck = a.deckStyle
    root.style.setProperty('--font-scale', String(a.fontScale))
    root.style.setProperty('--anim', String(a.animationSpeed))
    root.style.setProperty('--c-felt', a.tableColor)
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0c0e12' : '#f3f4f7')
  }, [a, systemDark])
  return null
}
