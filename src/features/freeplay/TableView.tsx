/** Poker table: felt, seats around an ellipse (hero at the bottom), board, pot and bets. */
import type { HandState } from '../../engine/game/table'
import { potTotal, toBB } from '../../engine/game/table'
import { PlayingCard } from '../../components/PlayingCard'
import { cx } from '../../lib/cx'
import { describeScore, evaluate } from '../../engine/evaluator'

const bb = (chips: number) => `${Number(toBB(chips).toFixed(2))}`

export function TableView({ h, lastActionBySeat, onSeatClick, showAll }: {
  h: HandState
  lastActionBySeat: Record<number, string>
  onSeatClick?: (seat: number) => void
  /** Reveal every hand (showdown / review). */
  showAll?: boolean
}) {
  const n = h.seats.length
  // Seat 0 (hero) at the bottom; others clockwise.
  const pos = (i: number) => {
    const angle = Math.PI / 2 + (i / n) * 2 * Math.PI
    return { x: 50 + 43 * Math.cos(angle), y: 50 + 38 * Math.sin(angle) }
  }
  const betPos = (i: number) => {
    const angle = Math.PI / 2 + (i / n) * 2 * Math.PI
    return { x: 50 + 26 * Math.cos(angle), y: 50 + 22 * Math.sin(angle) }
  }
  const pot = potTotal(h) - h.seats.reduce((a, x) => a + x.bet, 0)
  const reveal = (i: number) => h.seats[i].isHero || showAll || (h.finished && h.showdown && !h.seats[i].folded)

  return (
    <div className="relative mx-auto aspect-[4/5] w-full max-w-3xl select-none sm:aspect-[16/9]">
      <div className="absolute inset-[9%_8%] rounded-[50%] border-[8px] border-[#2a2f3a] bg-felt shadow-[inset_0_0_60px_rgba(0,0,0,0.45)] sm:inset-[9%_6%] sm:border-[10px]" />
      {/* Board and pot */}
      <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-2">
        <div className="rounded-full bg-black/30 px-3 py-0.5 font-mono text-xs text-white tabular">Pot {bb(pot)} bb</div>
        <div className="flex gap-1">
          {[0, 1, 2, 3, 4].map((i) => <PlayingCard key={`${i}-${h.board[i] ?? 'x'}`} card={h.board[i] ?? null} size="sm" animate={h.board[i] !== undefined} className={h.board[i] === undefined ? 'opacity-30' : ''} />)}
        </div>
      </div>
      {h.seats.map((x, i) => {
        const p = pos(i)
        const b = betPos(i)
        const acting = h.toAct === i && !h.finished
        const won = h.finished && h.net[i] > 0
        return (
          <div key={i}>
            <button
              type="button"
              onClick={() => onSeatClick?.(i)}
              className={cx(
                'absolute flex w-[5.8rem] -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1 rounded-lg transition-ui sm:w-36',
                x.folded && 'opacity-45',
              )}
              style={{ left: `${p.x}%`, top: `${p.y}%` }}
              title={x.isHero ? 'You' : 'Open the range estimator for this player'}
            >
              <div className="flex gap-0.5">
                {x.folded && !x.isHero && !showAll
                  ? <div className={x.isHero ? 'h-14' : 'h-10'} />
                  : x.cards.map((c, k) => <PlayingCard key={k} card={c} size={x.isHero ? 'md' : 'sm'} faceDown={!reveal(i)} />)}
              </div>
              <div className={cx(
                'w-full rounded-md border px-2 py-1 text-center leading-tight',
                acting ? 'border-warn bg-surface shadow-[0_0_0_2px_var(--c-warn)]' : won ? 'border-good bg-surface' : 'border-line bg-surface/95',
              )}>
                <div className="flex items-center justify-center gap-1 text-[0.7rem]">
                  <span className="rounded bg-surface-2 px-1 font-mono text-[0.6rem] text-muted">{x.position}</span>
                  <span className="truncate font-medium">{x.name}</span>
                </div>
                <div className="font-mono text-xs tabular">{x.allIn ? 'ALL-IN' : `${bb(x.stack)} bb`}</div>
                {lastActionBySeat[i] && <div className="truncate text-[0.62rem] text-muted">{lastActionBySeat[i]}</div>}
                {h.finished && h.showdown && !x.folded && h.board.length === 5 && <div className="truncate text-[0.62rem] text-info">{describeScore(evaluate([...x.cards, ...h.board]))}</div>}
                {h.finished && h.net[i] !== 0 && <div className={cx('font-mono text-[0.68rem]', h.net[i] > 0 ? 'text-good' : 'text-bad')}>{h.net[i] > 0 ? '+' : ''}{bb(h.net[i])}</div>}
              </div>
            </button>
            {i === h.button && (
              <span className="absolute grid h-5 w-5 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white text-[0.6rem] font-bold text-black shadow"
                style={{ left: `${p.x + (p.x >= 50 ? -11 : 11)}%`, top: `${p.y + (p.y > 50 ? -4 : 4)}%` }}>D</span>
            )}
            {x.bet > 0 && (
              <span className="animate-in absolute -translate-x-1/2 -translate-y-1/2 rounded-full bg-black/45 px-2 py-0.5 font-mono text-[0.68rem] text-white tabular"
                style={{ left: `${b.x}%`, top: `${b.y}%` }}>{bb(x.bet)}</span>
            )}
          </div>
        )
      })}
    </div>
  )
}
