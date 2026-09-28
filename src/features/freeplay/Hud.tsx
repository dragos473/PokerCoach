/** Freeplay HUD: every item can be hidden and re-ordered in Settings → Freeplay HUD. */
import { useMemo, type ReactNode } from 'react'
import { useSettings } from '../../store/settings'
import type { HudItemId } from '../../store/settingsSchema'
import type { HandState } from '../../engine/game/table'
import { legalActions, potTotal, toBB } from '../../engine/game/table'
import type { StrengthTable } from '../../engine/game/handStrength'
import { classifyHand } from '../../engine/game/handStrength'
import { analyzeOuts } from '../../engine/outs'
import { liveCombos, type Weights } from '../../engine/range'
import { comboIndex } from '../../engine/combos'
import type { Card } from '../../engine/cards'
import { potOddsRatio, requiredEquity, mdf, spr, foldEquityValue } from '../../engine/formulas'
import { MathValue } from '../../components/MathExplain'
import { Badge, Select, Stat } from '../../components/ui'
import { fmtPct } from '../../lib/format'
import { cx } from '../../lib/cx'
import type { Analysis } from './analysis'
import { rangeAdvantage } from './analysis'
import type { BotProfileLike } from '../../engine/game/bots'

const bbTxt = (chips: number, d = 1) => `${Number(toBB(chips).toFixed(d))} bb`

export interface HudProps {
  h: HandState
  heroCards: [Card, Card]
  villain: number
  estimate: Weights
  heroRange: Weights | null
  est: Analysis | null
  act: Analysis | null
  multiwayEquity: number | null
  selectedTo: number | null
  strength: StrengthTable | null
  assumedProfileId: string
  profiles: BotProfileLike[]
  onAssumedProfile: (id: string) => void
  revealModel: boolean
  lastVillainAction?: { text: string; freq?: { fold: number; call: number; raise: number } }
}

function Item({ title, children, badge }: { title: string; children: ReactNode; badge?: ReactNode }) {
  const compact = useSettings((s) => s.settings.appearance.compact)
  return (
    <section className={cx('rounded-md border border-line bg-surface', compact ? 'p-2' : 'p-2.5')}>
      <h3 className="mb-1.5 flex items-center justify-between text-[0.68rem] font-medium uppercase tracking-wider text-muted">{title}{badge}</h3>
      {children}
    </section>
  )
}

export function Hud(p: HudProps) {
  const items = useSettings((s) => s.settings.hud.items)
  const d = useSettings((s) => s.settings.display.percentDecimals)
  const { h } = p
  const legal = h.toAct === 0 && !h.finished ? legalActions(h) : null
  const pot = potTotal(h)
  const toCall = legal?.callAmount ?? 0
  const hero = h.seats[0]
  const others = h.seats.filter((x) => !x.isHero && !x.folded)
  const eff = Math.min(hero.stack + hero.bet, Math.max(0, ...others.map((x) => x.stack + x.bet)))
  const selected = p.est?.responses.find((r) => r.to === p.selectedTo) ?? p.est?.responses[0]
  const selectedAct = p.act?.responses.find((r) => r.to === selected?.to)
  const selOptEst = p.est?.options.find((o) => o.to === selected?.to)

  const outs = useMemo(() => {
    if (h.board.length < 3 || h.board.length > 4) return null
    try {
      return analyzeOuts({ hero: p.heroCards, board: h.board, villain: liveCombos(p.estimate, [...p.heroCards, ...h.board]) })
    } catch { return null }
  }, [h.board, p.heroCards, p.estimate])

  const adv = useMemo(() => (p.heroRange && h.board.length >= 3 ? rangeAdvantage(p.heroRange, p.estimate, h.board) : null), [p.heroRange, p.estimate, h.board])

  const render = (id: HudItemId): ReactNode => {
    switch (id) {
      case 'pot': return <Stat key={id} label="Pot" value={bbTxt(pot)} sub={toCall > 0 ? `to call ${bbTxt(toCall, 2)}` : undefined} />
      case 'stacks': return <Stat key={id} label="Effective stack" value={bbTxt(eff)} sub={`you ${bbTxt(hero.stack)}`} />
      case 'spr': return <Stat key={id} label="SPR" value={<MathValue e={spr.explain({ effectiveStack: toBB(eff - Math.min(hero.bet, eff)), pot: toBB(pot) })}>{spr.compute({ effectiveStack: toBB(eff - Math.min(hero.bet, eff)), pot: toBB(pot) }).toFixed(2)}</MathValue>} />
      case 'potOdds': return toCall > 0 ? <Stat key={id} label="Pot odds" value={<MathValue e={potOddsRatio.explain({ pot: toBB(pot), call: toBB(toCall) })}>{potOddsRatio.compute({ pot: toBB(pot), call: toBB(toCall) }).toFixed(2)} : 1</MathValue>} /> : null
      case 'requiredEquity': return toCall > 0 ? <Stat key={id} label="Required equity" value={<MathValue e={requiredEquity.explain({ pot: toBB(pot), call: toBB(toCall) })}>{fmtPct(requiredEquity.compute({ pot: toBB(pot), call: toBB(toCall) }), d)}</MathValue>} /> : null
      case 'mdf': return toCall > 0 ? <Stat key={id} label="MDF" value={<MathValue e={mdf.explain({ pot: toBB(pot - toCall), bet: toBB(toCall) })}>{fmtPct(mdf.compute({ pot: toBB(pot - toCall), bet: toBB(toCall) }), d)}</MathValue>} /> : null
      case 'equity': return (
        <Stat key={id} label="Equity vs your read" value={p.est ? fmtPct(p.est.equity, d) : '…'}
          sub={[p.multiwayEquity !== null && `vs all: ${fmtPct(p.multiwayEquity, d)}`, h.street === 'preflop' ? 'preflop matrix' : 'exact'].filter(Boolean).join(' · ')}
          tone={p.est && legal && toCall > 0 ? (p.est.equity >= requiredEquity.compute({ pot: toBB(pot), call: toBB(toCall) }) ? 'good' : 'bad') : undefined} />
      )
      default: return null
    }
  }

  const tiles: HudItemId[] = ['pot', 'stacks', 'spr', 'potOdds', 'requiredEquity', 'mdf', 'equity']
  const visible = items.filter((i) => i.visible).map((i) => i.id)

  const blocks: ReactNode[] = []
  let tileBuf: ReactNode[] = []
  const flush = () => { if (tileBuf.length) { blocks.push(<div key={`t${blocks.length}`} className="grid grid-cols-2 gap-1.5">{tileBuf}</div>); tileBuf = [] } }

  for (const id of visible) {
    if (tiles.includes(id)) { const n = render(id); if (n) tileBuf.push(n); continue }
    flush()
    if (id === 'ev' && p.est && legal) {
      blocks.push(
        <Item key={id} title="EV of each option (vs your read)" badge={<Badge tone="info">model</Badge>}>
          <table className="w-full text-xs">
            <tbody>
              {p.est.options.map((o) => {
                const best = Math.max(...p.est!.options.map((x) => x.ev))
                return (
                  <tr key={o.label} className={cx('border-t border-line first:border-0', o.to !== undefined && o.to === selected?.to && 'bg-surface-2')}>
                    <td className="py-1">{o.label}</td>
                    <td className={cx('py-1 text-right font-mono tabular', o.ev === best && 'font-semibold text-good')} title={o.lines.join('\n')}>{o.ev >= 0 ? '+' : ''}{Number(toBB(o.ev).toFixed(2))} bb</td>
                    {p.revealModel && p.act && <td className="py-1 pl-2 text-right font-mono text-[0.65rem] text-muted tabular" title="Same option evaluated against the bot's true model range">{Number(toBB(p.act.options.find((x) => x.label === o.label)?.ev ?? NaN).toFixed(2))}</td>}
                  </tr>
                )
              })}
            </tbody>
          </table>
          <p className="mt-1 text-[0.65rem] leading-snug text-muted">One-street model: no further betting after a call; villain re-raises counted as calls. {p.revealModel && 'Grey column: vs the bot’s actual model range.'} Hover a value for the formula.</p>
        </Item>,
      )
    } else if (id === 'foldEquity' && selected && selOptEst) {
      blocks.push(
        <Item key={id} title={`Fold equity (${selected.label})`}>
          <div className="flex items-baseline justify-between text-sm">
            <span>Villain folds <span className="font-mono">{fmtPct(selOptEst.foldProb ?? 0, d)}</span></span>
            <MathValue e={foldEquityValue.explain({ pot: toBB(pot), foldProb: selOptEst.foldProb ?? 0 })}><span className="font-mono">{Number((toBB(pot) * (selOptEst.foldProb ?? 0)).toFixed(2))} bb</span></MathValue>
          </div>
          <p className="text-[0.65rem] text-muted">Equity when called {fmtPct(selOptEst.equityWhenCalled ?? 0, d)} (vs the part of your read that continues).</p>
        </Item>,
      )
    } else if (id === 'villainActions') {
      blocks.push(
        <Item key={id} title="Villain action probabilities">
          {p.lastVillainAction && (
            <p className="mb-1.5 text-xs text-muted">Last: {p.lastVillainAction.text}{p.revealModel && p.lastVillainAction.freq && <> · model: F {fmtPct(p.lastVillainAction.freq.fold, 0)} C {fmtPct(p.lastVillainAction.freq.call, 0)} R {fmtPct(p.lastVillainAction.freq.raise, 0)}</>}</p>
          )}
          {selected ? (
            <>
              <p className="mb-1 text-[0.68rem] text-muted">If you {selected.policy.raiseLabel === 'raise' || h.currentBet > 0 ? 'raise to' : 'bet'} {bbTxt(selected.to, 2)}:</p>
              <table className="w-full text-xs">
                <thead className="text-muted"><tr><th className="text-left font-normal" /><th className="text-right font-normal">Fold</th><th className="text-right font-normal">Call</th><th className="text-right font-normal">Raise</th></tr></thead>
                <tbody className="font-mono tabular">
                  <tr><td className="font-sans">Your read</td><td className="text-right">{fmtPct(selected.policy.freq.fold, 0)}</td><td className="text-right">{fmtPct(selected.policy.freq.call, 0)}</td><td className="text-right">{fmtPct(selected.policy.freq.raise, 0)}</td></tr>
                  {p.revealModel && selectedAct && <tr className="text-muted"><td className="font-sans">Bot model</td><td className="text-right">{fmtPct(selectedAct.policy.freq.fold, 0)}</td><td className="text-right">{fmtPct(selectedAct.policy.freq.call, 0)}</td><td className="text-right">{fmtPct(selectedAct.policy.freq.raise, 0)}</td></tr>}
                </tbody>
              </table>
              <label className="mt-1.5 flex items-center justify-between gap-2 text-[0.65rem] text-muted">Response model for your read
                <Select value={p.assumedProfileId} onChange={p.onAssumedProfile} options={p.profiles.map((x) => ({ value: x.id, label: x.name }))} className="h-6 text-[0.65rem]" />
              </label>
            </>
          ) : <p className="text-xs text-muted">Available when you can bet or raise.</p>}
        </Item>,
      )
    } else if (id === 'outs' && outs) {
      blocks.push(
        <Item key={id} title="Outs vs your read">
          {outs.behindFraction === 0 ? <p className="text-xs text-muted">You are ahead of every hand in your read.</p> : (
            <div className="grid grid-cols-3 gap-1 text-center text-xs">
              <div><div className="text-muted">clean</div><div className="font-mono">{outs.cleanOuts}</div></div>
              <div><div className="text-muted">dirty</div><div className="font-mono">{outs.dirtyOuts}</div></div>
              <div><div className="text-muted">effective</div><div className="font-mono">{outs.effectiveOuts.toFixed(1)}</div></div>
              <div className="col-span-3 mt-1 text-[0.65rem] text-muted">Behind {fmtPct(outs.behindFraction, 0)} of the read · best hand next card {fmtPct(outs.exactNextCard, 1)}</div>
            </div>
          )}
        </Item>,
      )
    } else if (id === 'handStrength' && h.board.length >= 3) {
      const c = classifyHand(p.heroCards, h.board)
      const hs = p.strength ? p.strength.hs[comboIndex(p.heroCards[0], p.heroCards[1])] : NaN
      blocks.push(
        <Item key={id} title="Hand strength">
          <p className="text-sm font-medium">{c.label}</p>
          {Number.isFinite(hs) && <p className="text-[0.65rem] text-muted">Beats {fmtPct(hs, 0)} of all possible hands right now.</p>}
        </Item>,
      )
    } else if (id === 'rangeAdvantage' && adv) {
      blocks.push(
        <Item key={id} title="Range & nut advantage" badge={<Badge>heuristic</Badge>}>
          <div className="space-y-1 text-xs">
            <div className="flex justify-between"><span className="text-muted">Your range ahead right now</span><span className="font-mono">{fmtPct(adv.heroWins, 0)}</span></div>
            <div className="flex justify-between"><span className="text-muted">Two pair+: you / villain</span><span className="font-mono">{fmtPct(adv.heroNuts, 0)} / {fmtPct(adv.villNuts, 0)}</span></div>
          </div>
          <p className="mt-1 text-[0.65rem] text-muted">Your range = your actions replayed with the response model; villain = your read. Made hands only, no draws.</p>
        </Item>,
      )
    }
  }
  flush()
  return <div className="space-y-2">{blocks}</div>
}
