/** Equity / outs / pot-odds / EV calculator with "show the math" on every number. */
import { useEffect, useMemo, useState } from 'react'
import { CardInput } from '../../components/CardPicker'
import { Badge, Button, ErrorNote, NumberInput, PageHeader, Panel, ProgressBar, Segmented, Spinner } from '../../components/ui'
import { MathNote, MathValue } from '../../components/MathExplain'
import { OddsTabs } from './OddsTabs'
import { RangeSourcePicker, resolveSource, type RangeSource } from '../ranges/RangeSourcePicker'
import { useRanges } from '../../store/ranges'
import { useSettings } from '../../store/settings'
import { useEngine } from '../../lib/useEngine'
import { CancelledError } from '../../engine/worker/client'
import { comboIndex } from '../../engine/combos'
import { liveCombos, type WeightedCombo } from '../../engine/range'
import { type Card } from '../../engine/cards'
import { analyzeOuts, type OutsResult } from '../../engine/outs'
import type { EquityResult } from '../../engine/equity'
import {
  potOddsRatio, requiredEquity, evCall, mdf, alpha, breakEvenFold, breakEvenFoldWithEquity, evBet, spr,
  hitNextCard, hitByRiver, ruleOf2, ruleOf4,
} from '../../engine/formulas'
import { evaluate, describeScore } from '../../engine/evaluator'
import { fmtBB, fmtPct } from '../../lib/format'
import { cx } from '../../lib/cx'
import { PlayingCard } from '../../components/PlayingCard'

interface PlayerInput { mode: 'hand' | 'range'; cards: Card[]; range: RangeSource }

const newPlayer = (mode: 'hand' | 'range' = 'range'): PlayerInput => ({ mode, cards: [], range: { kind: 'text', text: 'any' } })

export function CalculatorPage() {
  const charts = useRanges((s) => s.charts)
  const eqSettings = useSettings((s) => s.settings.equity)
  const decimals = useSettings((s) => s.settings.display.percentDecimals)
  const engine = useEngine()

  const [players, setPlayers] = useState<PlayerInput[]>([newPlayer('hand'), newPlayer('range')])
  const [board, setBoard] = useState<Card[]>([])
  const [dead, setDead] = useState<Card[]>([])
  const [result, setResult] = useState<EquityResult | null>(null)
  const [progress, setProgress] = useState(0)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState('')

  const usedBy = (exclude: 'board' | 'dead' | number): Card[] => [
    ...players.flatMap((p, i) => (p.mode === 'hand' && i !== exclude ? p.cards : [])),
    ...(exclude === 'board' ? [] : board),
    ...(exclude === 'dead' ? [] : dead),
  ]

  /** Player combos, or an error message. */
  const prepared = useMemo(() => {
    const out: { combos: WeightedCombo[] }[] = []
    for (const [i, p] of players.entries()) {
      if (p.mode === 'hand') {
        if (p.cards.length !== 2) return { error: `Player ${i + 1}: pick two cards` }
        out.push({ combos: [{ combo: comboIndex(p.cards[0], p.cards[1]), weight: 1 }] })
      } else {
        const r = resolveSource(p.range, charts)
        if (!r.weights) return { error: `Player ${i + 1}: ${r.error}` }
        const combos = liveCombos(r.weights)
        if (!combos.length) return { error: `Player ${i + 1}: empty range` }
        out.push({ combos })
      }
    }
    if (![0, 3, 4, 5].includes(board.length)) return { error: 'The board needs 0, 3, 4 or 5 cards' }
    return { players: out }
  }, [players, charts, board.length])

  // Auto-run (debounced) whenever the inputs are complete.
  useEffect(() => {
    if (!prepared.players) { setResult(null); return }
    const t = setTimeout(async () => {
      setError(''); setRunning(true); setProgress(0)
      try {
        const r = await engine.equity({ players: prepared.players!, board, dead, method: eqSettings.method, iterations: eqSettings.iterations, maxExactEvaluations: eqSettings.maxExactEvaluations },
          { onProgress: (f, partial) => { setProgress(f); if (partial) setResult(partial) } })
        setResult(r)
        setRunning(false)
      } catch (e) {
        if (!(e instanceof CancelledError)) { setError(e instanceof Error ? e.message : String(e)); setResult(null); setRunning(false) }
      }
    }, 250)
    return () => clearTimeout(t)
  }, [prepared, board, dead, engine, eqSettings])

  const heroEquity = result?.players[0]?.equity

  return (
    <div>
      <PageHeader title="Odds lab" subtitle="Pick hands or ranges and a board. Equity is recomputed automatically in the background." />
      <OddsTabs path="/odds" />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <Panel title="Players" actions={players.length < 9 && <Button size="sm" onClick={() => setPlayers([...players, newPlayer()])}>+ Player</Button>}>
            <div className="space-y-3">
              {players.map((p, i) => (
                <div key={i} className="rounded-md border border-line p-2.5">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">{i === 0 ? 'Player 1 (you)' : `Player ${i + 1}`}</span>
                    <div className="flex items-center gap-2">
                      <Segmented size="sm" value={p.mode} onChange={(mode) => setPlayers(players.map((x, j) => (j === i ? { ...x, mode } : x)))}
                        options={[{ value: 'hand', label: 'Hand' }, { value: 'range', label: 'Range' }]} />
                      {players.length > 2 && <Button size="sm" variant="ghost" onClick={() => setPlayers(players.filter((_, j) => j !== i))} aria-label="Remove">✕</Button>}
                    </div>
                  </div>
                  {p.mode === 'hand'
                    ? <CardInput value={p.cards} max={2} used={usedBy(i)} onChange={(cards) => setPlayers(players.map((x, j) => (j === i ? { ...x, cards } : x)))} label={`Player ${i + 1} hand`} />
                    : <RangeSourcePicker value={p.range} onChange={(range) => setPlayers(players.map((x, j) => (j === i ? { ...x, range } : x)))} />}
                </div>
              ))}
            </div>
          </Panel>
          <Panel title="Board & dead cards">
            <div className="flex flex-wrap items-center gap-6">
              <div><p className="mb-1 text-xs text-muted">Board</p><CardInput value={board} max={5} used={usedBy('board')} onChange={setBoard} label="Board" allowedCounts={[0, 3, 4, 5]} /></div>
              <div><p className="mb-1 text-xs text-muted">Dead / folded cards</p><CardInput value={dead} max={6} used={usedBy('dead')} onChange={setDead} label="Dead cards" size="sm" /></div>
            </div>
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel title="Equity" actions={result && <Badge tone={result.method === 'exact' ? 'good' : 'info'}>{result.method === 'exact' ? 'exact' : 'Monte Carlo'}</Badge>}>
            {prepared.error && <p className="text-sm text-muted">{prepared.error}</p>}
            {error && <ErrorNote>{error}</ErrorNote>}
            {running && <div className="mb-2 flex items-center gap-2"><Spinner /><ProgressBar value={progress} /><Button size="sm" variant="ghost" onClick={() => engine.cancel()}>Stop</Button></div>}
            {result && (
              <div className="space-y-2">
                {result.players.map((p, i) => (
                  <div key={i} className="grid grid-cols-[5.5rem_minmax(0,1fr)_auto] items-center gap-3">
                    <span className="text-sm">{i === 0 ? 'You' : `Player ${i + 1}`}</span>
                    <div className="h-2.5 rounded bg-line"><div className="h-2.5 rounded" style={{ width: `${p.equity * 100}%`, background: i === 0 ? 'var(--series-1)' : 'var(--c-muted)' }} /></div>
                    <span className="text-right font-mono text-sm tabular">
                      <span className="font-semibold">{fmtPct(p.equity, decimals)}</span>
                      <span className="ml-2 text-xs text-muted">W {fmtPct(p.win, 1)} · T {fmtPct(p.tie, 1)}{result.method === 'monte-carlo' && ` · ± ${fmtPct(p.marginOfError95, 2)}`}</span>
                    </span>
                  </div>
                ))}
                <MathNote title="How equity is computed" kind={result.method === 'exact' ? 'math' : 'model'} lines={[
                  'equity = pot share at showdown (win = 1, k-way tie = 1/k), averaged over',
                  result.method === 'exact'
                    ? `every card-disjoint hand assignment and board completion: ${result.samples.toLocaleString()} outcomes enumerated`
                    : `${result.samples.toLocaleString()} random deals (${result.rejected.toLocaleString()} rejected card collisions)`,
                  result.method === 'monte-carlo' ? `margin of error (95 %) = 1.96 · SE, SE = √(s² / n) = ${fmtPct(result.players[0].stdError, 3)}` : 'no sampling error',
                  `${Math.round(result.elapsedMs)} ms`,
                ]} />
              </div>
            )}
          </Panel>
          <OutsPanel players={players} board={board} dead={dead} charts={charts} />
          <PotOddsPanel equity={heroEquity} />
        </div>
      </div>
    </div>
  )
}

function OutsPanel({ players, board, dead, charts }: { players: PlayerInput[]; board: Card[]; dead: Card[]; charts: ReturnType<typeof useRanges.getState>['charts'] }) {
  const hero = players[0]
  const data = useMemo((): { res?: OutsResult; msg?: string } => {
    if (hero.mode !== 'hand' || hero.cards.length !== 2) return { msg: 'Give player 1 a specific hand to analyse outs.' }
    if (board.length !== 3 && board.length !== 4) return { msg: 'Outs are shown on the flop or turn.' }
    try {
      let villain: WeightedCombo[] | undefined
      if (players.length === 2) {
        const v = players[1]
        if (v.mode === 'hand' && v.cards.length === 2) villain = [{ combo: comboIndex(v.cards[0], v.cards[1]), weight: 1 }]
        else if (v.mode === 'range') { const r = resolveSource(v.range, charts); if (r.weights) villain = liveCombos(r.weights) }
      }
      return { res: analyzeOuts({ hero: hero.cards as [Card, Card], board, villain, dead }) }
    } catch (e) {
      return { msg: e instanceof Error ? e.message : String(e) }
    }
  }, [hero, players, board, dead, charts])

  const res = data.res
  const outs = res ? res.cleanOuts + res.dirtyOuts : 0
  return (
    <Panel title="Outs" actions={res && <Badge tone={res.mode === 'vs-villain' ? 'good' : 'warn'}>{res.mode === 'vs-villain' ? 'vs player 2' : 'improvement only'}</Badge>}>
      {data.msg && <p className="text-sm text-muted">{data.msg}</p>}
      {res && (
        <div className="space-y-3 text-sm">
          <p>You have <span className="font-medium">{describeScore(evaluate([...hero.cards, ...board]))}</span>.
            {res.mode === 'vs-villain' && <> You are behind {fmtPct(res.behindFraction, 1)} of player 2’s {players[1].mode === 'range' ? 'range' : 'hand'}.</>}</p>
          {res.mode === 'vs-villain' && res.behindFraction === 0 ? <p className="text-muted">You are ahead of every hand: no outs needed.</p> : (
            <>
              <div className="flex flex-wrap gap-1">
                {res.cards.filter((c) => c.status !== 'none').sort((a, b) => b.winShare - a.winShare).map((c) => (
                  <div key={c.card} className="relative" title={`${c.label}: ${c.heroCategoryName}${res.mode === 'vs-villain' ? `, beats ${fmtPct(c.winShare, 0)} of the hands ahead` : ''}${c.warnings.length ? ' · ' + c.warnings.join('; ') : ''}`}>
                    <PlayingCard card={c.card} size="sm" />
                    <span className={cx('absolute -bottom-1 left-1/2 h-1.5 w-4 -translate-x-1/2 rounded-full', c.status === 'clean' ? 'bg-good' : 'bg-warn')} />
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-md bg-surface-2 p-2"><p className="text-[0.68rem] uppercase text-muted">Clean</p><p className="font-mono text-lg">{res.cleanOuts}</p></div>
                <div className="rounded-md bg-surface-2 p-2"><p className="text-[0.68rem] uppercase text-muted">Dirty</p><p className="font-mono text-lg">{res.dirtyOuts}</p></div>
                <div className="rounded-md bg-surface-2 p-2"><p className="text-[0.68rem] uppercase text-muted">Effective</p><p className="font-mono text-lg">{res.effectiveOuts.toFixed(1)}</p></div>
              </div>
              <table className="w-full text-xs">
                <tbody>
                  <tr><td className="py-1 text-muted">Next card: outs / unseen</td><td className="py-1 text-right font-mono">
                    <MathValue e={hitNextCard.explain({ outs, unseen: res.unseen })}>{fmtPct(res.formulaNextCard, 1)}</MathValue></td></tr>
                  {res.mode === 'vs-villain' && <tr><td className="py-1 text-muted">Next card: best hand vs the hands ahead (exact)</td><td className="py-1 text-right font-mono">{fmtPct(res.exactNextCard, 1)}</td></tr>}
                  <tr><td className="py-1 text-muted">Rule of 2</td><td className="py-1 text-right font-mono"><MathValue e={ruleOf2.explain({ outs })}>{fmtPct(res.ruleOf2, 1)}</MathValue></td></tr>
                  {board.length === 3 && res.formulaByRiver !== undefined && (
                    <tr><td className="py-1 text-muted">By the river: 1 − C(unseen − outs, 2) / C(unseen, 2)</td><td className="py-1 text-right font-mono">
                      <MathValue e={hitByRiver.explain({ outs, unseen: res.unseen })}>{fmtPct(res.formulaByRiver, 1)}</MathValue></td></tr>
                  )}
                  {board.length === 3 && res.mode === 'vs-villain' && res.exactByRiver !== undefined && (
                    <tr><td className="py-1 text-muted">By the river: equity vs the hands ahead (exact, villain can improve too)</td><td className="py-1 text-right font-mono">{fmtPct(res.exactByRiver, 1)}</td></tr>
                  )}
                  {board.length === 3 && <tr><td className="py-1 text-muted">Rule of 4</td><td className="py-1 text-right font-mono"><MathValue e={ruleOf4.explain({ outs })}>{fmtPct(res.ruleOf4 ?? 0, 1)}</MathValue></td></tr>}
                </tbody>
              </table>
              <p className="text-xs text-muted">
                {res.mode === 'vs-villain'
                  ? 'Clean: wins against every hand that is currently ahead. Dirty: improves you but some hands ahead stay ahead (or it only ties). Effective outs = Σ share of the ahead-hands each card beats. “Next card (exact)” uses the real deck given villain’s possible hands.'
                  : 'Without an opponent, an out is any card that improves your hand category (not just the board). Dirty flags are heuristics: the card also pairs the board or makes flushes/straights possible for others.'}
              </p>
            </>
          )}
        </div>
      )}
    </Panel>
  )
}

function PotOddsPanel({ equity }: { equity?: number }) {
  const decimals = useSettings((s) => s.settings.display.percentDecimals)
  const [pot, setPot] = useState(10)
  const [bet, setBet] = useState(5)
  const [stack, setStack] = useState(90)
  const [myBet, setMyBet] = useState(7)
  const [foldPct, setFoldPct] = useState(40)
  const [eqOverride, setEqOverride] = useState<number | null>(null)
  const eq = eqOverride ?? equity ?? 0.3
  const facing = pot + bet

  return (
    <Panel title="Pot odds & EV">
      <p className="mb-3 text-xs text-muted">Pot is measured before villain’s bet. Your equity comes from the equity panel (player 1) unless you override it. Click any number to see the math.</p>
      <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-muted">Pot (bb)<NumberInput value={pot} min={0} step={0.5} onChange={setPot} className="w-full" /></label>
        <label className="flex flex-col gap-1 text-muted">Villain bet (bb)<NumberInput value={bet} min={0} step={0.5} onChange={setBet} className="w-full" /></label>
        <label className="flex flex-col gap-1 text-muted">Effective stack (bb)<NumberInput value={stack} min={0} step={1} onChange={setStack} className="w-full" /></label>
        <label className="flex flex-col gap-1 text-muted">Your equity (%)
          <span className="flex gap-1"><NumberInput value={Number((eq * 100).toFixed(2))} min={0} max={100} step={0.5} onChange={(v) => setEqOverride(v / 100)} className="w-full" />
            {eqOverride !== null && <Button size="sm" variant="ghost" onClick={() => setEqOverride(null)} title="Use calculated equity">↺</Button>}</span>
        </label>
        <label className="flex flex-col gap-1 text-muted">Your bet if you bet (bb)<NumberInput value={myBet} min={0} step={0.5} onChange={setMyBet} className="w-full" /></label>
        <label className="flex flex-col gap-1 text-muted">Villain folds to it (%)<NumberInput value={foldPct} min={0} max={100} step={1} onChange={setFoldPct} className="w-full" /></label>
      </div>
      <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        {bet > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-medium uppercase tracking-wider text-muted">Facing {bet} bb</p>
            <Row label="Pot odds"><MathValue e={potOddsRatio.explain({ pot: facing, call: bet })}>{potOddsRatio.compute({ pot: facing, call: bet }).toFixed(2)} : 1</MathValue></Row>
            <Row label="Required equity"><MathValue e={requiredEquity.explain({ pot: facing, call: bet })}>{fmtPct(requiredEquity.compute({ pot: facing, call: bet }), decimals)}</MathValue></Row>
            <Row label="EV(call)"><MathValue e={evCall.explain({ pot: facing, call: bet, equity: eq })}><span className={evCall.compute({ pot: facing, call: bet, equity: eq }) >= 0 ? 'text-good' : 'text-bad'}>{fmtBB(evCall.compute({ pot: facing, call: bet, equity: eq }), 2)}</span></MathValue></Row>
            <Row label="EV(fold)"><span>0 bb</span></Row>
            <Row label="MDF"><MathValue e={mdf.explain({ pot, bet })}>{fmtPct(mdf.compute({ pot, bet }), decimals)}</MathValue></Row>
            <Row label="Villain’s alpha"><MathValue e={alpha.explain({ pot, bet })}>{fmtPct(alpha.compute({ pot, bet }), decimals)}</MathValue></Row>
          </div>
        )}
        <div className="space-y-1.5">
          <p className="text-xs font-medium uppercase tracking-wider text-muted">Betting {myBet} bb into {pot} bb</p>
          <Row label="Break-even fold % (bluff)"><MathValue e={breakEvenFold.explain({ pot, risk: myBet })}>{fmtPct(breakEvenFold.compute({ pot, risk: myBet }), decimals)}</MathValue></Row>
          <Row label="Break-even fold % (with equity)"><MathValue e={breakEvenFoldWithEquity.explain({ pot, risk: myBet, villainCall: myBet, equityWhenCalled: eq })}>{fmtPct(breakEvenFoldWithEquity.compute({ pot, risk: myBet, villainCall: myBet, equityWhenCalled: eq }), decimals)}</MathValue></Row>
          <Row label="EV(bet)"><MathValue e={evBet.explain({ pot, risk: myBet, villainCall: myBet, foldProb: foldPct / 100, equityWhenCalled: eq })}>
            <span className={evBet.compute({ pot, risk: myBet, villainCall: myBet, foldProb: foldPct / 100, equityWhenCalled: eq }) >= 0 ? 'text-good' : 'text-bad'}>{fmtBB(evBet.compute({ pot, risk: myBet, villainCall: myBet, foldProb: foldPct / 100, equityWhenCalled: eq }), 2)}</span></MathValue></Row>
          <Row label="SPR"><MathValue e={spr.explain({ effectiveStack: stack, pot })}>{spr.compute({ effectiveStack: stack, pot }).toFixed(2)}</MathValue></Row>
          <p className="text-xs text-muted">EV(bet) assumes your equity when called equals your overall equity; in reality villain calls with the stronger part of the range. Freeplay mode models this from the range.</p>
        </div>
      </div>
    </Panel>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="flex items-start justify-between gap-3"><span className="text-muted">{label}</span><span className="text-right font-mono tabular">{children}</span></div>
}
