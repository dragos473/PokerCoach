/** Interactive widgets embedded in lessons: range grid, mini equity calculator, quiz, replayable hand. */
import { useEffect, useMemo, useState } from 'react'
import { RangeGrid, GridLegend } from '../../components/RangeGrid'
import { PlayingCard } from '../../components/PlayingCard'
import { Button, TextInput, Kbd } from '../../components/ui'
import { MathExplain } from '../../components/MathExplain'
import { comboCount, liveCombos, parseRange, rangePercent, emptyRange } from '../../engine/range'
import { parseCards, type Card } from '../../engine/cards'
import { comboIndex } from '../../engine/combos'
import { evaluate, describeScore } from '../../engine/evaluator'
import type { EquityResult } from '../../engine/equity'
import { useRanges } from '../../store/ranges'
import { useSettings } from '../../store/settings'
import { useEngine } from '../../lib/useEngine'
import { fmtPct } from '../../lib/format'
import { cx } from '../../lib/cx'
import { RichText, computeExpr, runEquityQueued } from './Expr'
import { buildQuestion, formatAnswer, generateParams, grade, parseAnswer, type NumericUnit, type QuizQuestion } from '../odds/quiz/questions'
import type { QuizTopic } from '../../store/settingsSchema'
import { createRng } from '../../engine/rng'
import type { WidgetType } from './format'

type Config = Record<string, string>

function Frame({ title, children, kind }: { title?: string; children: React.ReactNode; kind: string }) {
  return (
    <div className="not-prose my-5 rounded-lg border border-line bg-surface p-4">
      <p className="mb-3 text-xs font-medium uppercase tracking-wider text-muted">{kind}{title && <span className="normal-case tracking-normal text-fg"> · {title}</span>}</p>
      {children}
    </div>
  )
}

// ------------------------------------------------------------------------------------ range grid
function RangeGridWidget({ config }: { config: Config }) {
  const charts = useRanges((s) => s.charts)
  const ensure = useRanges((s) => s.ensureComputed)
  const chartId = config.range?.startsWith('chart:') ? config.range.slice(6) : null
  useEffect(() => { if (chartId) void ensure(chartId) }, [chartId, ensure])
  const { raise, call, error } = useMemo(() => {
    try {
      if (chartId) {
        const c = charts.find((x) => x.id === chartId)
        if (!c) return { raise: emptyRange(), call: emptyRange(), error: `Chart ${chartId} not found` }
        return { raise: c.layers.raise, call: c.layers.call }
      }
      return { raise: parseRange(config.range ?? ''), call: config.call ? parseRange(config.call) : emptyRange() }
    } catch (e) {
      return { raise: emptyRange(), call: emptyRange(), error: String(e) }
    }
  }, [config, charts, chartId])
  const hasCall = comboCount(call) > 0
  return (
    <Frame kind="Range" title={config.title}>
      {error ? <p className="text-sm text-bad">{error}</p> : (
        <div className="max-w-md">
          <RangeGrid compact layers={[{ id: 'r', weights: raise, color: 'var(--c-raise)' }, { id: 'c', weights: call, color: 'var(--c-call)' }]} />
          <div className="mt-2">
            <GridLegend items={[
              { color: 'var(--c-raise)', label: config['raise-label'] ?? (hasCall ? 'Raise' : 'In range'), value: `${Number(comboCount(raise).toFixed(1))} combos · ${fmtPct(rangePercent(raise), 1)}` },
              ...(hasCall ? [{ color: 'var(--c-call)', label: 'Call', value: `${Number(comboCount(call).toFixed(1))} combos · ${fmtPct(rangePercent(call), 1)}` }] : []),
            ]} />
          </div>
          {chartId && <a className="mt-2 inline-block text-xs text-info underline" href={`#/ranges/${chartId}`}>Open in the range editor</a>}
        </div>
      )}
    </Frame>
  )
}

// ------------------------------------------------------------------------------------ equity calc
function toPlayer(s: string) {
  const t = s.trim()
  if (/^([2-9TJQKA][cdhs]){2}$/i.test(t)) { const [a, b] = parseCards(t); return { combos: [{ combo: comboIndex(a, b), weight: 1 }] } }
  return { combos: liveCombos(parseRange(t)) }
}

function EquityCalcWidget({ config }: { config: Config }) {
  const [players, setPlayers] = useState((config.players ?? 'AhKh | QsQd').split('|').map((s) => s.trim()))
  const [board, setBoard] = useState(config.board ?? '')
  const [res, setRes] = useState<EquityResult | null>(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const engine = useEngine()
  const run = async () => {
    setErr(''); setBusy(true)
    try {
      setRes(await engine.equity({ players: players.map(toPlayer), board: board.trim() ? parseCards(board) : [], dead: [], method: 'auto', iterations: 300_000 }))
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); setRes(null) }
    setBusy(false)
  }
  useEffect(() => { void run() }, []) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Frame kind="Equity calculator" title={config.title}>
      <div className="space-y-2">
        {players.map((p, i) => (
          <div key={i} className="grid grid-cols-[4.5rem_minmax(0,1fr)_5rem] items-center gap-2">
            <span className="text-xs text-muted">{i === 0 ? 'Player 1' : `Player ${i + 1}`}</span>
            <TextInput value={p} onChange={(v) => setPlayers(players.map((x, j) => (j === i ? v : x)))} mono onEnter={run} />
            <span className="text-right font-mono text-sm font-semibold">{res ? fmtPct(res.players[i]?.equity ?? NaN, 1) : ''}</span>
          </div>
        ))}
        <div className="grid grid-cols-[4.5rem_minmax(0,1fr)_5rem] items-center gap-2">
          <span className="text-xs text-muted">Board</span>
          <TextInput value={board} onChange={setBoard} mono placeholder="e.g. 7h8h2c" onEnter={run} />
          <Button size="sm" onClick={run} disabled={busy}>{busy ? '…' : 'Compute'}</Button>
        </div>
        {err && <p className="text-xs text-bad">{err}</p>}
        {res && <p className="text-xs text-muted">{res.method === 'exact' ? `Exact: ${res.samples.toLocaleString()} outcomes.` : `Monte Carlo: ${res.samples.toLocaleString()} trials, ± ${fmtPct(res.players[0].marginOfError95, 2)}.`} Edit hands (AhKh) or ranges (QQ+, AKs) and press Enter.</p>}
      </div>
    </Frame>
  )
}

// ------------------------------------------------------------------------------------ quiz
const quizRng = createRng()

export function QuizWidget({ config, onResult }: { config: Config; onResult?: (correct: boolean) => void }) {
  const qs = useSettings((s) => s.settings.quiz)
  const [generated, setGenerated] = useState<QuizQuestion | null>(null)
  const [expected, setExpected] = useState<number | null>(null)
  const [input, setInput] = useState('')
  const [done, setDone] = useState<{ correct: boolean } | null>(null)

  useEffect(() => {
    if (config.topic) {
      const topic = config.topic as QuizTopic
      setGenerated(buildQuestion(topic, generateParams(topic, (config.difficulty as 'easy') ?? 'easy', quizRng)))
    } else if (config.answer) {
      const m = config.answer.match(/^\{\{(.+)\}\}$/)
      if (m) computeExpr(m[1]).then((v) => setExpected(v.value)).catch(() => setExpected(NaN))
      else setExpected(Number(config.answer))
    }
  }, [config])

  const options = config.options?.split('|').map((s) => s.trim())
  const unit = (config.unit ?? 'number') as NumericUnit

  const submit = (value: string) => {
    if (done) return
    let correct = false
    if (generated) {
      const parsed = generated.answer.kind === 'choice' ? Number(value) : parseAnswer(value, generated.answer.unit)
      correct = grade(generated, parsed, qs)
    } else if (options) {
      correct = Number(value) === Number(config.correct) - 1
    } else if (expected !== null) {
      const fake: QuizQuestion = { key: '', topic: 'pot-odds', params: {}, prompt: '', answer: { kind: 'numeric', value: expected, unit }, explanations: [], notes: [] }
      correct = grade(fake, parseAnswer(value, unit), qs)
    }
    setDone({ correct })
    onResult?.(correct)
  }

  const prompt = generated ? generated.prompt : config.question ?? ''
  const choice = generated ? (generated.answer.kind === 'choice' ? generated.answer.options : null) : options ?? null

  return (
    <Frame kind="Quiz">
      <div className="text-[0.95rem]"><RichText text={prompt} /></div>
      {generated && (generated.hero || generated.board || generated.villain) && (
        <div className="mt-3 flex flex-wrap gap-4">
          {generated.hero && <div className="flex gap-1">{generated.hero.map((c) => <PlayingCard key={c} card={c} size="sm" />)}</div>}
          {generated.villain && <div className="flex items-center gap-1"><span className="text-xs text-muted">vs</span>{generated.villain.map((c) => <PlayingCard key={c} card={c} size="sm" />)}</div>}
          {generated.board && generated.board.length > 0 && <div className="flex gap-1 rounded bg-felt p-1">{generated.board.map((c) => <PlayingCard key={c} card={c} size="sm" />)}</div>}
        </div>
      )}
      <div className="mt-3">
        {choice ? (
          <div className="flex flex-wrap gap-2">
            {choice.map((o, i) => {
              const right = generated ? (generated.answer as { correct: number }).correct === i : Number(config.correct) - 1 === i
              return <Button key={o} disabled={!!done} variant={done && right ? 'primary' : 'secondary'} onClick={() => submit(String(i))}>{o}</Button>
            })}
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <TextInput value={input} onChange={setInput} mono className="w-32" onEnter={() => submit(input)} placeholder={generated?.answer.kind === 'numeric' ? { percent: '%', ratio: 'x : 1', count: 'count', number: 'number' }[generated.answer.unit] : { percent: '%', ratio: 'x : 1', count: 'count', number: 'number' }[unit]} />
            {!done && <Button size="sm" onClick={() => submit(input)}>Check <Kbd>Enter</Kbd></Button>}
          </div>
        )}
      </div>
      {done && (
        <div className="animate-in mt-3 space-y-2 border-t border-line pt-3 text-sm">
          <p className={cx('font-semibold', done.correct ? 'text-good' : 'text-bad')}>
            {done.correct ? 'Correct' : 'Not quite'}
            {!done.correct && <span className="ml-2 font-normal text-fg">Answer: <span className="font-mono">{generated ? formatAnswer(generated.answer) : options ? options[Number(config.correct) - 1] : expected !== null ? formatAnswer({ kind: 'numeric', value: expected, unit }) : ''}</span></span>}
          </p>
          {generated?.notes.map((n) => <p key={n} className="text-muted">{n}</p>)}
          {generated?.explanations.map((e) => <div key={e.id} className="rounded-md border border-line p-2"><MathExplain e={e} /></div>)}
          {config.explain && <p className="text-muted"><RichText text={config.explain} /></p>}
        </div>
      )}
    </Frame>
  )
}

// ------------------------------------------------------------------------------------ hand replay
const STREETS = ['preflop', 'flop', 'turn', 'river'] as const
const BOARD_LEN = { preflop: 0, flop: 3, turn: 4, river: 5 }

function HandWidget({ config }: { config: Config }) {
  const players = useMemo(() => (config.players ?? '').split('|').map((p) => {
    const [name, cards] = p.split('=').map((s) => s.trim())
    return { name, cards: parseCards(cards) as [Card, Card] }
  }), [config.players])
  const board = useMemo(() => parseCards(config.board ?? ''), [config.board])
  const streets = STREETS.filter((s) => BOARD_LEN[s] <= board.length)
  const [step, setStep] = useState(0)
  const street = streets[step]
  const shown = board.slice(0, BOARD_LEN[street])
  const [eq, setEq] = useState<number[] | null>(null)

  useEffect(() => {
    let alive = true
    setEq(null)
    runEquityQueued({ players: players.map((p) => ({ combos: [{ combo: comboIndex(p.cards[0], p.cards[1]), weight: 1 }] })), board: shown, method: 'exact' })
      .then((r) => alive && setEq(r.players.map((p) => p.equity))).catch(() => {})
    return () => { alive = false }
  }, [players, shown.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const actions = (config[street] ?? '').split('|').map((s) => s.trim()).filter(Boolean)
  return (
    <Frame kind="Hand replay" title={config.title}>
      <div className="flex flex-wrap items-start gap-5">
        <div className="space-y-2">
          {players.map((p, i) => (
            <div key={p.name} className="flex items-center gap-3">
              <span className="w-16 text-sm">{p.name}</span>
              <div className="flex gap-1">{p.cards.map((c) => <PlayingCard key={c} card={c} size="sm" />)}</div>
              <span className="w-16 font-mono text-sm font-semibold" title="All-in equity at this point (exact)">{eq ? fmtPct(eq[i], 1) : '…'}</span>
              {shown.length >= 3 && <span className="text-xs text-muted">{describeScore(evaluate([...p.cards, ...shown]))}</span>}
            </div>
          ))}
        </div>
        <div className="flex min-h-12 gap-1 rounded-lg bg-felt p-1.5">
          {[0, 1, 2, 3, 4].map((i) => <PlayingCard key={i} card={shown[i] ?? null} size="sm" animate />)}
        </div>
      </div>
      <div className="mt-3 rounded-md bg-surface-2 p-3 text-sm">
        <p className="mb-1 text-xs font-medium uppercase tracking-wider text-muted">{street}</p>
        {actions.length ? <ol className="list-decimal pl-5">{actions.map((a) => <li key={a}><RichText text={a} /></li>)}</ol> : <p className="text-muted">No action.</p>}
        {config[`note-${street}`] && <p className="mt-2 text-muted"><RichText text={config[`note-${street}`]} /></p>}
      </div>
      <div className="mt-3 flex items-center gap-2">
        <Button size="sm" onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0}>← Back</Button>
        <Button size="sm" variant="primary" onClick={() => setStep(Math.min(streets.length - 1, step + 1))} disabled={step === streets.length - 1}>Next street →</Button>
        <span className="text-xs text-muted">Equity column: exact all-in equity with the cards known at this point.</span>
      </div>
    </Frame>
  )
}

export function Widget({ type, config, onQuizResult }: { type: WidgetType; config: Config; onQuizResult?: (correct: boolean) => void }) {
  try {
    switch (type) {
      case 'range-grid': return <RangeGridWidget config={config} />
      case 'equity-calc': return <EquityCalcWidget config={config} />
      case 'quiz': return <QuizWidget config={config} onResult={onQuizResult} />
      case 'hand': return <HandWidget config={config} />
    }
  } catch (e) {
    return <p className="text-sm text-bad">Widget error: {String(e)}</p>
  }
}
