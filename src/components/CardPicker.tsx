/** Card selection: slots that open a 4x13 picker; cards used elsewhere are disabled. */
import { useState } from 'react'
import { RANK_CHARS, SUIT_SYMBOLS, makeCard, parseCards, formatCards, type Card } from '../engine/cards'
import { PlayingCard } from './PlayingCard'
import { Button, Modal, TextInput } from './ui'
import { cx } from '../lib/cx'

export function CardGridPicker({ selected, disabled, max, onToggle }: {
  selected: Card[]; disabled: Set<Card>; max: number; onToggle: (c: Card) => void
}) {
  return (
    <div className="space-y-1">
      {[3, 2, 1, 0].map((suit) => (
        <div key={suit} className="grid grid-cols-13 gap-1" style={{ gridTemplateColumns: 'repeat(13, minmax(0, 1fr))' }}>
          {Array.from({ length: 13 }, (_, i) => 12 - i).map((rank) => {
            const c = makeCard(rank, suit)
            const isSel = selected.includes(c)
            const isDis = disabled.has(c) && !isSel
            return (
              <button
                key={c}
                type="button"
                disabled={isDis || (!isSel && selected.length >= max)}
                onClick={() => onToggle(c)}
                className={cx(
                  'flex aspect-[3/4] flex-col items-center justify-center rounded border text-xs font-bold leading-none transition-ui sm:text-sm',
                  isSel ? 'border-accent bg-white ring-2 ring-accent' : 'border-line bg-white/95 hover:bg-white',
                  'disabled:opacity-20',
                )}
                style={{ color: `var(--suit-${'cdhs'[suit]})` }}
              >
                <span>{RANK_CHARS[rank]}</span><span className="text-[0.8em]">{SUIT_SYMBOLS[suit]}</span>
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )
}

/**
 * A row of card slots. Click to open the picker. `used` are cards taken by other inputs.
 */
export function CardInput({ value, onChange, max, used = [], label, size = 'md', allowedCounts }: {
  value: Card[]; onChange: (cards: Card[]) => void; max: number; used?: Card[]; label?: string; size?: 'sm' | 'md'; allowedCounts?: number[]
}) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [err, setErr] = useState('')
  const disabled = new Set(used)
  const slots = Array.from({ length: max }, (_, i) => value[i] ?? null)
  const invalidCount = allowedCounts && !allowedCounts.includes(value.length)

  return (
    <>
      <button type="button" onClick={() => { setText(formatCards(value, ' ')); setOpen(true) }} className="group flex items-center gap-1 rounded-md p-0.5 hover:bg-surface-2" aria-label={label ?? 'Pick cards'}>
        {slots.map((c, i) => <PlayingCard key={i} card={c} size={size === 'sm' ? 'sm' : 'md'} className={c === null ? 'group-hover:border-muted' : ''} />)}
      </button>
      {invalidCount && <span className="text-xs text-warn">needs {allowedCounts!.filter((n) => n > 0).join(' / ')} cards</span>}
      <Modal open={open} onClose={() => setOpen(false)} title={label ?? 'Pick cards'}>
        <CardGridPicker selected={value} disabled={disabled} max={max} onToggle={(c) => onChange(value.includes(c) ? value.filter((x) => x !== c) : [...value, c])} />
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <TextInput value={text} onChange={setText} mono placeholder="or type: Ah Kd 7c" className="w-44" onEnter={() => apply()} />
          <Button size="sm" onClick={() => apply()}>Set</Button>
          <Button size="sm" variant="ghost" onClick={() => onChange([])}>Clear</Button>
          <Button size="sm" variant="primary" className="ml-auto" onClick={() => setOpen(false)}>Done</Button>
        </div>
        {err && <p className="mt-2 text-xs text-bad">{err}</p>}
      </Modal>
    </>
  )

  function apply() {
    try {
      const cards = parseCards(text)
      if (cards.length > max) throw new Error(`At most ${max} cards`)
      const clash = cards.find((c) => disabled.has(c))
      if (clash !== undefined) throw new Error(`${formatCards([clash])} is already used`)
      setErr('')
      onChange(cards)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    }
  }
}
