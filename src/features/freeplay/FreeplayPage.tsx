/** Freeplay training mode: play against explainable bots with a live, range-driven HUD. */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSettings } from '../../store/settings'
import { useFreeplay, boardKey, vectorKey } from './store'
import {
  newSession, dealNext, botAct, heroAct, mainVillain, gradeDecision, handHistoryText, sizingOf, sparse,
  type DecisionRecord, type Session,
} from './session'
import { analyze, candidateSizes, modelRange, type Analysis } from './analysis'
import { TableView } from './TableView'
import { ActionBar } from './ActionBar'
import { Hud } from './Hud'
import { RangeEstimator } from './RangeEstimator'
import { HandReview, type ReviewData } from './HandReview'
import { legalActions, potTotal, toBB, type PlayerAction } from '../../engine/game/table'
import { fullRange, liveCombos, type Weights } from '../../engine/range'
import { comboIndex } from '../../engine/combos'
import type { Card } from '../../engine/cards'
import { createRng } from '../../engine/rng'
import { Badge, Button, EmptyState, Kbd, PageHeader, Panel, Spinner } from '../../components/ui'
import { useHotkeys } from '../../hotkeys/useHotkeys'
import { useEngine } from '../../lib/useEngine'
import { CancelledError } from '../../engine/worker/client'
import { getDb } from '../../db/db'
import { uid, fmtPct } from '../../lib/format'
import { cx } from '../../lib/cx'

export function FreeplayPage() {
  const f = useSettings((s) => s.settings.freeplay)
  const fp = useFreeplay()
  const { session, setSession } = fp
  const [rng] = useState(() => createRng())
  const [stepRequested, setStepRequested] = useState(false)
  const [heroRange, setHeroRange] = useState<Weights | null>(null)
  const savedHand = useRef<string | null>(null)
  const mwEngine = useEngine()
  const [multiwayEquity, setMultiwayEquity] = useState<number | null>(null)

  const h = session?.hand
  const heroTurn = !!h && !h.finished && h.toAct === 0
  const heroCards = h?.seats[0].cards as [Card, Card] | undefined

  const start = () => {
    const s = newSession(f, Date.now() >>> 0, uid())
    setSession(dealNext(s, f, rng))
    savedHand.current = null
  }
  const next = useCallback(() => {
    const s = useFreeplay.getState().session
    if (s) { setSession(dealNext(s, f, rng)); setHeroRange(null); useFreeplay.getState().set({ selectedTo: null }) }
  }, [f, rng, setSession])

  // ---------------------------------------------------------------- bots
  useEffect(() => {
    if (!session || !h || h.finished || h.toAct === 0 || h.toAct === null) return
    if (f.pauseEveryDecision && !stepRequested) return
    let cancelled = false
    const anim = useSettings.getState().settings.appearance.animationSpeed
    const t = setTimeout(async () => {
      const strength = h.street === 'preflop' ? null : await fp.ensureStrength(h.board)
      if (cancelled || useFreeplay.getState().session !== session) return
      setSession(botAct(session, f, rng, strength))
      setStepRequested(false)
    }, f.botDelayMs * Math.max(0.2, anim))
    return () => { cancelled = true; clearTimeout(t) }
  }, [session, h, f, rng, stepRequested, fp, setSession])

  // ---------------------------------------------------------------- hero: prefetch engine results
  useEffect(() => {
    if (!heroTurn || !h || !heroCards) return
    void fp.ensureVector(heroCards, h.board)
    if (h.street !== 'preflop') void fp.ensureStrength(h.board)
  }, [heroTurn, h, heroCards, fp])

  const vec = h && heroCards ? fp.vectors[vectorKey(heroCards, h.board)] : undefined
  const strength = h && h.street !== 'preflop' ? fp.strength[boardKey(h.board)] ?? null : null
  const analysisReady = heroTurn && !!vec && (h!.street === 'preflop' || !!strength)
  const villain = h ? mainVillain(h) : 1
  const assumed = f.profiles.find((p) => p.id === fp.assumedProfileId) ?? f.profiles[0]
  const sizing = sizingOf(f)

  const sizes = useMemo(() => (heroTurn && h ? candidateSizes(h, f.betPresets, f.raisePresets, f.openSizeBB, f.threeBetMultiple) : []), [heroTurn, h, f])
  const { est, act } = useMemo((): { est: Analysis | null; act: Analysis | null } => {
    if (!analysisReady || !session || !h || !vec) return { est: null, act: null }
    return {
      est: analyze(h, vec, villain, session.estimates[villain], assumed, sizing, strength, sizes),
      act: analyze(h, vec, villain, session.actualRanges[villain], session.profiles[villain], sizing, strength, sizes),
    }
  }, [analysisReady, session, h, vec, villain, assumed, sizing, strength, sizes])

  // Hero's perceived range: the hero's own actions replayed with the assumed model.
  useEffect(() => {
    if (!session || !h || h.board.length < 3) { setHeroRange(null); return }
    let alive = true
    const boards = [3, 4, 5].filter((n) => n <= h.board.length).map((n) => h.board.slice(0, n))
    Promise.all(boards.map((b) => fp.ensureStrength(b))).then(() => {
      if (!alive) return
      const st = useFreeplay.getState().strength
      setHeroRange(modelRange(session, 0, assumed, sizing, (b) => st[boardKey(b)] ?? null))
    }).catch(() => {})
    return () => { alive = false }
  }, [session?.snapshots.length, h?.board.length]) // eslint-disable-line react-hooks/exhaustive-deps

  // Multiway equity vs every live villain's read (Monte Carlo).
  useEffect(() => {
    setMultiwayEquity(null)
    if (!heroTurn || !session || !h || !heroCards) return
    const live = h.seats.filter((x) => !x.isHero && !x.folded)
    if (live.length < 2) return
    mwEngine.equity({
      players: [{ combos: [{ combo: comboIndex(heroCards[0], heroCards[1]), weight: 1 }] }, ...live.map((x) => ({ combos: liveCombos(session.estimates[x.index], [...heroCards, ...h.board]) }))],
      board: h.board, dead: [], method: 'monte-carlo', iterations: f.equityIterations,
    }).then((r) => setMultiwayEquity(r.players[0].equity)).catch((e) => { if (!(e instanceof CancelledError)) setMultiwayEquity(null) })
  }, [heroTurn, session?.estimates, h?.board.length, h?.actions.length]) // eslint-disable-line react-hooks/exhaustive-deps

  // ---------------------------------------------------------------- hero action
  const onHeroAct = (a: PlayerAction) => {
    if (!session || !h || !heroTurn) return
    let record: DecisionRecord | null = null
    const legal = legalActions(h)
    if (est && act) {
      const chosen = a.kind === 'raise' ? { kind: a.kind, to: Math.min(Math.max(a.to, legal.minRaiseTo), legal.maxRaiseTo) } : { kind: a.kind }
      // Make sure the chosen size is among the evaluated options.
      let actOpts = act.options, estOpts = est.options
      if (a.kind === 'raise' && !act.options.some((o) => o.to === chosen.to)) {
        const extra = [{ to: chosen.to!, label: 'custom' }]
        actOpts = analyze(h, vec!, villain, session.actualRanges[villain], session.profiles[villain], sizing, strength, [...sizes, ...extra]).options
        estOpts = analyze(h, vec!, villain, session.estimates[villain], assumed, sizing, strength, [...sizes, ...extra]).options
      }
      const allIn = (a.kind === 'raise' && chosen.to === legal.maxRaiseTo) || (a.kind === 'call' && legal.callAmount >= h.seats[0].stack) || h.seats.some((x) => !x.isHero && x.allIn && !x.folded)
      const g = gradeDecision(actOpts, chosen, h.street, allIn, f.mistakeThresholdBB)
      const chosenLabel = a.kind === 'raise' ? actOpts.find((o) => o.to === chosen.to)?.label ?? 'Raise' : a.kind === 'fold' ? 'Fold' : a.kind === 'check' ? 'Check' : 'Call'
      const bestTxt = `${g.best.label} (${toBB(g.best.ev).toFixed(2)} bb)`
      const explanation = h.street === 'preflop' && !allIn
        ? `Preflop decisions are not graded (the one-street all-in model ignores equity realisation). Best by that model: ${bestTxt}.`
        : g.lossBB > 0.005
          ? `Against the bot's actual range your equity was ${fmtPct(act.equity, 1)}. ${chosenLabel} was worth ${toBB(g.chosenEV).toFixed(2)} bb; the best option was ${bestTxt}.${act.options.find((o) => o.kind === 'call') ? ` Calling needed ${fmtPct(legal.callAmount / (potTotal(h) + legal.callAmount), 1)} equity.` : ''}`
          : `Best option by the model (${bestTxt}).`
      record = {
        street: h.street, board: h.board, potBB: toBB(potTotal(h)), toCallBB: toBB(legal.callAmount), villainSeat: villain,
        chosen, chosenLabel, actual: actOpts, estimate: estOpts, equityActual: act.equity, equityEstimate: est.equity,
        evLossBB: g.lossBB, flagged: g.flagged, tags: g.tags, explanation,
        estimateRange: sparse(session.estimates[villain]), actualRange: sparse(session.actualRanges[villain]),
      }
    }
    setSession(heroAct(session, a, record))
    useFreeplay.getState().set({ selectedTo: null })
  }

  // ---------------------------------------------------------------- finished hand: persist, auto-deal
  useEffect(() => {
    if (!session || !h?.finished) return
    const key = `${session.id}:${session.handNo}`
    if (savedHand.current === key) return
    savedHand.current = key
    const text = handHistoryText(session)
    const data: ReviewData = { handNo: session.handNo, hand: h, log: session.log, decisions: session.decisions, streetRanges: session.streetRanges, text }
    const db = getDb()
    void db.hands.put({
      id: uid(), sessionId: session.id, at: Date.now(), data, text, netBB: toBB(h.net[0]),
      evLossBB: session.decisions.reduce((a, d) => a + d.evLossBB, 0), mistakeTags: session.decisions.flatMap((d) => d.tags),
    }).catch(() => {})
    void db.sessions.put({ id: session.id, startedAt: session.seed, endedAt: Date.now(), config: { players: f.players, stackBB: f.stackBB }, stats: session.stats }).catch(() => {})
  }, [session, h, f])

  useEffect(() => {
    if (!h?.finished || !f.autoDeal) return
    const t = setTimeout(next, 2500)
    return () => clearTimeout(t)
  }, [h?.finished, f.autoDeal, next]) // eslint-disable-line react-hooks/exhaustive-deps

  useHotkeys({
    'freeplay.next': () => { if (h?.finished) next(); else if (f.pauseEveryDecision && !heroTurn) setStepRequested(true) },
    'freeplay.toggleHud': () => fp.set({ hudVisible: !fp.hudVisible }),
    'freeplay.rangeEditor': () => fp.set({ estimatorSeat: fp.estimatorSeat === null ? villain : null }),
  })

  // ---------------------------------------------------------------- estimator helpers
  const estSeat = fp.estimatorSeat
  const narrowByModel = async () => {
    if (!session || estSeat === null || !h || !heroCards) return
    const boards = [3, 4, 5].filter((n) => n <= h.board.length).map((n) => h.board.slice(0, n))
    await Promise.all(boards.map((b) => fp.ensureStrength(b)))
    const st = useFreeplay.getState().strength
    const r = modelRange(session, estSeat, assumed, sizing, (b) => st[boardKey(b)] ?? null, heroCards)
    if (r) fp.setEstimate(estSeat, r)
  }

  if (!session || !h) {
    return (
      <div>
        <PageHeader title="Freeplay" subtitle="Play full hands against bots whose behaviour comes from ranges and profile frequencies." />
        <EmptyState title={`${f.players}-handed, ${f.stackBB} bb stacks`} action={<div className="flex gap-2"><Button variant="primary" size="lg" onClick={start}>Deal</Button><a href="#/settings" className="self-center text-sm text-info underline">Table & bot settings</a></div>}>
          Bots: {f.seatProfiles.slice(0, f.players - 1).map((id) => f.profiles.find((p) => p.id === id)?.name ?? id).join(', ')}.
          Open a player’s range estimator by clicking their seat (or press <Kbd>E</Kbd>). Your read drives the HUD; the review compares it with the bot’s real range.
        </EmptyState>
        <HistoryLink />
      </div>
    )
  }

  const lastBySeat: Record<number, string> = {}
  for (const e of session.log) if (e.street === h.street || h.finished) lastBySeat[e.seat] = e.text.slice(h.seats[e.seat].name.length + 1)
  const lastVillain = [...session.log].reverse().find((e) => e.seat === villain)

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-semibold">Freeplay</h1>
          <Badge>hand {session.handNo}</Badge>
          <Badge tone={session.stats.netBB >= 0 ? 'good' : 'bad'}>{session.stats.netBB >= 0 ? '+' : ''}{session.stats.netBB.toFixed(1)} bb</Badge>
          {session.stats.hands > 0 && <Badge>{(session.stats.netBB / session.stats.hands * 100).toFixed(1)} bb/100</Badge>}
        </div>
        <div className="flex flex-wrap items-center gap-1 sm:gap-2">
          <Button size="sm" variant="ghost" onClick={() => fp.set({ hudVisible: !fp.hudVisible })}>{fp.hudVisible ? 'Hide' : 'Show'} HUD <Kbd>H</Kbd></Button>
          <Button size="sm" variant="ghost" onClick={() => fp.set({ revealModel: !fp.revealModel })} title="Show the bot model's true numbers during the hand">{fp.revealModel ? 'Hide' : 'Show'} model</Button>
          <a href="#/freeplay/history" className="text-xs text-info underline">History & leaks</a>
          <Button size="sm" variant="ghost" onClick={() => { setSession(null) }}>End session</Button>
        </div>
      </div>

      <div className={cx('grid gap-4', fp.hudVisible && 'lg:grid-cols-[minmax(0,1fr)_19rem]')}>
        <div className="min-w-0 space-y-3">
          <TableView h={h} lastActionBySeat={lastBySeat} onSeatClick={(i) => i !== 0 && fp.set({ estimatorSeat: i })} />
          {heroTurn ? (
            <ActionBar h={h} sizes={sizes} selectedTo={fp.selectedTo} onSelect={(to) => fp.set({ selectedTo: to })} onAct={onHeroAct}
              disabled={!analysisReady} busyNote={!analysisReady ? 'Computing equity…' : undefined} />
          ) : h.finished ? (
            <div className="flex items-center justify-center gap-3 rounded-lg border border-line bg-surface p-3">
              <span className="text-sm">{h.net[0] > 0 ? `You win ${toBB(h.net[0]).toFixed(2)} bb` : h.net[0] < 0 ? `You lose ${(-toBB(h.net[0])).toFixed(2)} bb` : 'Break even'}</span>
              <Button variant="primary" onClick={next}>Next hand <Kbd>Space</Kbd></Button>
            </div>
          ) : (
            <div className="flex items-center justify-center gap-3 rounded-lg border border-line bg-surface p-3 text-sm text-muted">
              {f.pauseEveryDecision ? <Button onClick={() => setStepRequested(true)}>Next action <Kbd>Space</Kbd></Button> : <><Spinner /> {h.seats[h.toAct ?? 0]?.name} is thinking…</>}
            </div>
          )}
          <ActionLog session={session} />
        </div>
        {fp.hudVisible && heroCards && (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="text-muted">Read on <span className="text-fg">{h.seats[villain].name}</span></span>
              <Button size="sm" onClick={() => fp.set({ estimatorSeat: villain })}>Edit range <Kbd>E</Kbd></Button>
            </div>
            <Hud h={h} heroCards={heroCards} villain={villain} estimate={session.estimates[villain]} heroRange={heroRange}
              est={est} act={act} multiwayEquity={multiwayEquity} selectedTo={fp.selectedTo ?? sizes[0]?.to ?? null} strength={strength}
              assumedProfileId={fp.assumedProfileId} profiles={f.profiles} onAssumedProfile={(id) => fp.set({ assumedProfileId: id })}
              revealModel={fp.revealModel} lastVillainAction={lastVillain ? { text: lastVillain.text, freq: lastVillain.freq } : undefined} />
            {!heroTurn && !h.finished && <p className="text-xs text-muted">EV and fold-equity panels appear when it is your turn.</p>}
          </div>
        )}
      </div>

      {h.finished && (
        <div className="mt-5">
          <HandReview data={{ handNo: session.handNo, hand: h, log: session.log, decisions: session.decisions, streetRanges: session.streetRanges, text: handHistoryText(session) }} />
        </div>
      )}

      {estSeat !== null && heroCards && (
        <RangeEstimator open onClose={() => fp.set({ estimatorSeat: null })} h={h} seat={estSeat} setSeat={(s) => fp.set({ estimatorSeat: s })}
          range={session.estimates[estSeat] ?? fullRange()} onChange={(w) => fp.setEstimate(estSeat, w)} dead={heroCards}
          onModelNarrow={narrowByModel} modelName={assumed.name} />
      )}
    </div>
  )
}

function ActionLog({ session }: { session: Session }) {
  const [open, setOpen] = useState(false)
  const entries = session.log
  return (
    <Panel dense title={<button onClick={() => setOpen(!open)} className="text-left">Action log {open ? '▾' : '▸'}</button>}>
      <ol className={cx('space-y-0.5 overflow-auto text-xs', open ? 'max-h-72' : 'max-h-24')}>
        {entries.map((e, i) => (
          <li key={i}>
            <span className="mr-1 font-mono text-[0.6rem] uppercase text-muted">{e.street}</span>{e.text}
            {open && e.explanation && <ul className="ml-6 list-disc text-[0.65rem] text-muted">{e.explanation.map((x) => <li key={x}>{x}</li>)}</ul>}
          </li>
        ))}
      </ol>
      {!open && <p className="mt-1 text-[0.65rem] text-muted">Expand to see why each bot acted (its model rules).</p>}
    </Panel>
  )
}

function HistoryLink() {
  return <p className="mt-4 text-sm"><a href="#/freeplay/history" className="text-info underline">Hand history, session stats and leak tracker</a></p>
}
