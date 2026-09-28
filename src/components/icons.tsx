/** Minimal stroke icons (inline SVG, no icon font / network). */
import type { ReactNode } from 'react'

function Icon({ children, className = 'h-5 w-5' }: { children: ReactNode; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      {children}
    </svg>
  )
}

export const HomeIcon = (p: { className?: string }) => <Icon {...p}><path d="M3 11l9-7 9 7" /><path d="M5 10v10h14V10" /></Icon>
export const GridIcon = (p: { className?: string }) => <Icon {...p}><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></Icon>
export const PercentIcon = (p: { className?: string }) => <Icon {...p}><path d="M19 5L5 19" /><circle cx="6.5" cy="6.5" r="2.5" /><circle cx="17.5" cy="17.5" r="2.5" /></Icon>
export const BookIcon = (p: { className?: string }) => <Icon {...p}><path d="M4 5a2 2 0 012-2h13v16H6a2 2 0 00-2 2V5z" /><path d="M4 19a2 2 0 012-2h13" /></Icon>
export const TableIcon = (p: { className?: string }) => <Icon {...p}><ellipse cx="12" cy="12" rx="9" ry="6" /><ellipse cx="12" cy="12" rx="5" ry="2.8" /></Icon>
export const SettingsIcon = (p: { className?: string }) => <Icon {...p}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z" /></Icon>
export const FunctionIcon = (p: { className?: string }) => <Icon {...p}><path d="M9 20c2 0 2.5-2 3-5l1.5-8c.5-2.5 1-4 3-4" /><path d="M7 11h9" /></Icon>
export const ChartIcon = (p: { className?: string }) => <Icon {...p}><path d="M3 20h18" /><path d="M6 16l4-5 3 3 5-7" /></Icon>
export const CheckIcon = (p: { className?: string }) => <Icon {...p}><path d="M5 12l5 5 9-10" /></Icon>
export const PlusIcon = (p: { className?: string }) => <Icon {...p}><path d="M12 5v14M5 12h14" /></Icon>
