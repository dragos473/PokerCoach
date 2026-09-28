/** Hero actions: fold / check-call / bet-raise with sizing presets, custom size and hotkeys. */
import { useEffect, useState } from 'react'
import { legalActions, toBB, toChips, type HandState, type PlayerAction } from '../../engine/game/table'
import { Button, Kbd } from '../../components/ui'
import { useHotkeys } from '../../hotkeys/useHotkeys'
import type { Candidate } from './analysis'
import { cx } from '../../lib/cx'

const bb = (c: number) => Number(toBB(c).toFixed(2))

export function ActionBar({ h, sizes, selectedTo, onSelect, onAct, disabled, busyNote }: {
  h: HandState
  sizes: Candidate[]
  selectedTo: number | null
  onSelect: (to: number) => void
  onAct: (a: PlayerAction) => void
  disabled: boolean
  busyNote?: string
}) {
  const legal = legalActions(h)
  const hero = h.seats[h.toAct!]
  const [custom, setCustom] = useState('')
  const to = selectedTo ?? sizes[0]?.to ?? null
  useEffect(() => { setCustom('') }, [h.street, h.actions.length])

  const raiseLabel = h.currentBet === 0 ? 'Bet' : 'Raise to'
  const act = (a: PlayerAction) => { if (!disabled) onAct(a) }
  const pick = (i: number) => { const s = sizes[i]; if (s) onSelect(s.to) }

  useHotkeys({
    'freeplay.fold': () => legal.canFold && act({ kind: 'fold' }),
    'freeplay.call': () => act(legal.canCheck ? { kind: 'check' } : { kind: 'call' }),
    'freeplay.raise': () => legal.canRaise && to !== null && act({ kind: 'raise', to }),
    'freeplay.size1': () => pick(0),
    'freeplay.size2': () => pick(1),
    'freeplay.size3': () => pick(2),
    'freeplay.size4': () => pick(3),
    'freeplay.allIn': () => legal.canRaise && onSelect(legal.maxRaiseTo),
  })

  return (
    <div className="rounded-lg border border-line bg-surface p-3">
      {legal.canRaise && (
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          {sizes.map((s, i) => (
            <button key={s.to} type="button" onClick={() => onSelect(s.to)}
              className={cx('rounded-md border px-2.5 py-1 text-xs transition-ui', to === s.to ? 'border-accent bg-accent/15 text-fg' : 'border-line text-muted hover:text-fg')}>
              {s.label} <span className="font-mono">{bb(s.to)}</span>{i < 4 && <span className="ml-1 text-[0.6rem] text-muted">{i + 1}</span>}
            </button>
          ))}
          <span className="ml-auto flex items-center gap-1">
            <input type="number" value={custom} placeholder={`${bb(legal.minRaiseTo)}–${bb(legal.maxRaiseTo)}`} min={bb(legal.minRaiseTo)} max={bb(legal.maxRaiseTo)} step={0.5}
              onChange={(e) => { setCustom(e.target.value); const v = Number(e.target.value); if (Number.isFinite(v) && v > 0) onSelect(Math.min(legal.maxRaiseTo, Math.max(legal.minRaiseTo, toChips(v)))) }}
              className="h-7 w-24 rounded border border-line bg-surface-2 px-2 font-mono text-xs" aria-label="Custom size in bb" />
            <span className="text-xs text-muted">bb</span>
          </span>
        </div>
      )}
      <div className="grid grid-cols-3 gap-2">
        <Button size="lg" variant="secondary" disabled={disabled || !legal.canFold} onClick={() => act({ kind: 'fold' })}>Fold <span className="hidden sm:inline-flex"><Kbd>F</Kbd></span></Button>
        <Button size="lg" variant="secondary" disabled={disabled} onClick={() => act(legal.canCheck ? { kind: 'check' } : { kind: 'call' })}>
          {legal.canCheck ? 'Check' : `Call ${bb(legal.callAmount)}`}{!legal.canCheck && legal.callAmount >= hero.stack && ' (all-in)'} <span className="hidden sm:inline-flex"><Kbd>C</Kbd></span>
        </Button>
        <Button size="lg" variant="primary" disabled={disabled || !legal.canRaise || to === null} onClick={() => to !== null && act({ kind: 'raise', to })}>
          {to !== null && to >= legal.maxRaiseTo ? 'All-in' : raiseLabel} {to !== null && bb(to)} <span className="hidden sm:inline-flex"><Kbd>R</Kbd></span>
        </Button>
      </div>
      {busyNote && <p className="mt-2 text-center text-xs text-muted">{busyNote}</p>}
    </div>
  )
}
