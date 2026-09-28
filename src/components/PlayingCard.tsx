/** High-contrast playing card. Colours come from the deck-style CSS variables (2- or 4-colour). */
import { RANK_CHARS, SUIT_SYMBOLS, rankOf, suitOf, type Card } from '../engine/cards'
import { cx } from '../lib/cx'

const SUIT_VAR = ['--suit-c', '--suit-d', '--suit-h', '--suit-s']

const SIZES = {
  xs: 'h-7 w-5 text-[0.7rem] rounded-[3px]',
  sm: 'h-10 w-7 text-sm rounded',
  md: 'h-14 w-10 text-lg rounded-md',
  lg: 'h-20 w-14 text-2xl rounded-lg',
}

export function PlayingCard({ card, size = 'md', faceDown, dim, highlight, className, animate }: {
  card?: Card | null; size?: keyof typeof SIZES; faceDown?: boolean; dim?: boolean; highlight?: boolean; className?: string; animate?: boolean
}) {
  if (card === undefined || card === null) {
    return <div className={cx(SIZES[size], 'border border-dashed border-line/80 bg-black/10', className)} />
  }
  if (faceDown) {
    return (
      <div
        className={cx(SIZES[size], 'border border-white/10 shadow-sm', animate && 'animate-deal', className)}
        style={{ background: 'repeating-linear-gradient(45deg, #2a3040 0 4px, #232838 4px 8px)' }}
        aria-label="face-down card"
      />
    )
  }
  const rank = RANK_CHARS[rankOf(card)]
  const suit = suitOf(card)
  return (
    <div
      className={cx(
        SIZES[size],
        'relative flex flex-col items-center justify-center bg-white font-bold leading-none shadow-sm select-none',
        dim && 'opacity-40',
        highlight && 'ring-2 ring-warn',
        animate && 'animate-deal',
        className,
      )}
      style={{ color: `var(${SUIT_VAR[suit]})` }}
      aria-label={`${rank}${'cdhs'[suit]}`}
    >
      <span>{rank === 'T' ? '10' : rank}</span>
      <span className="text-[0.8em]">{SUIT_SYMBOLS[suit]}</span>
    </div>
  )
}

export function CardRow({ cards, size = 'md', className, animate }: { cards: (Card | null | undefined)[]; size?: keyof typeof SIZES; className?: string; animate?: boolean }) {
  return (
    <div className={cx('flex gap-1', className)}>
      {cards.map((c, i) => <PlayingCard key={i} card={c} size={size} animate={animate} />)}
    </div>
  )
}

/** Inline suit-coloured text for a card, e.g. in hand histories: A♥ */
export function CardText({ card }: { card: Card }) {
  const suit = suitOf(card)
  return (
    <span className="font-mono font-semibold" style={{ color: `var(--suit-text-${'cdhs'[suit]})` }}>
      {RANK_CHARS[rankOf(card)]}{SUIT_SYMBOLS[suit]}
    </span>
  )
}
