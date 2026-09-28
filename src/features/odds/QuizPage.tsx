/** Quizzer: generated questions, instant grading with explanations, spaced repetition of misses. */
import { useEffect, useRef, useState } from 'react'
import { useSettings } from '../../store/settings'
import { QUIZ_TOPICS, type QuizTopic } from '../../store/settingsSchema'
import { buildQuestion, formatAnswer, generateParams, grade, parseAnswer, type QuizQuestion } from './quiz/questions'
import { dueItems, updateSrs } from './quiz/srs'
import { getDb } from '../../db/db'
import { createRng } from '../../engine/rng'
import { Badge, Button, Kbd, PageHeader, Panel, ProgressBar, Stat, TextInput } from '../../components/ui'
import { MathExplain } from '../../components/MathExplain'
import { PlayingCard } from '../../components/PlayingCard'
import { OddsTabs } from './OddsTabs'
import { useHotkeys } from '../../hotkeys/useHotkeys'
import { fmtPct } from '../../lib/format'
import { cx } from '../../lib/cx'

const rng = createRng()
const topicLabel = (t: string) => QUIZ_TOPICS.find((x) => x.id === t)?.label ?? t

interface Result { q: QuizQuestion; input: string; correct: boolean; ms: number; timedOut: boolean }

export function QuizPage() {
  const quiz = useSettings((s) => s.settings.quiz)
  const [queue, setQueue] = useState<QuizQuestion[] | null>(null)
  const [index, setIndex] = useState(0)
  const [results, setResults] = useState<Result[]>([])
  const [dueCount, setDueCount] = useState(0)

  useEffect(() => {
    getDb().srsItems.toArray().then((items) => setDueCount(dueItems(items, Date.now(), quiz.topics).length)).catch(() => {})
  }, [quiz.topics, queue])

  const start = async () => {
    const qs: QuizQuestion[] = []
    if (quiz.spacedRepetition) {
      const due = dueItems(await getDb().srsItems.toArray(), Date.now(), quiz.topics)
      for (const item of due.slice(0, Math.floor(quiz.questionCount / 2))) {
        try { qs.push(buildQuestion(item.topic as QuizTopic, item.params as never)) } catch { /* stale params: skip */ }
      }
    }
    while (qs.length < quiz.questionCount) {
      const topic = quiz.topics[rng.int(quiz.topics.length)]
      try { qs.push(buildQuestion(topic, generateParams(topic, quiz.difficulty, rng))) } catch { /* retry */ }
    }
    setQueue(qs); setIndex(0); setResults([])
  }

  const onAnswered = async (r: Result) => {
    setResults((x) => [...x, r])
    const db = getDb()
    await db.quizAttempts.add({ topic: r.q.topic, questionKey: r.q.key, prompt: r.q.prompt, answer: r.input, expected: formatAnswer(r.q.answer), correct: r.correct, ms: r.ms, at: Date.now() }).catch(() => {})
    if (quiz.spacedRepetition) {
      const existing = await db.srsItems.get(r.q.key).catch(() => undefined)
      const next = updateSrs(existing, r.q, r.correct, Date.now())
      if (next) await db.srsItems.put(next).catch(() => {})
    }
  }

  return (
    <div>
      <PageHeader title="Odds lab" subtitle="Every answer is computed by the engine. Topics, difficulty, time limit and tolerance are in Settings → Quizzer." />
      <OddsTabs path="/odds/quiz" />
      {!queue || index >= queue.length ? (
        <div className="grid gap-5 lg:grid-cols-2">
          <Panel title={queue ? 'Session complete' : 'New session'}>
            {queue && results.length > 0 && <Summary results={results} />}
            <div className="space-y-2 text-sm">
              <p><span className="text-muted">Topics:</span> {quiz.topics.map(topicLabel).join(', ')}</p>
              <p><span className="text-muted">Difficulty:</span> {quiz.difficulty} · <span className="text-muted">Questions:</span> {quiz.questionCount} · <span className="text-muted">Time limit:</span> {quiz.timeLimitSec ? `${quiz.timeLimitSec}s` : 'none'}</p>
              <p><span className="text-muted">Tolerance:</span> ±{quiz.percentTolerance} pp for %, ±{quiz.relativeTolerance}% for other numbers, exact for counts</p>
              {quiz.spacedRepetition && <p><span className="text-muted">Due for review:</span> {dueCount} missed question{dueCount === 1 ? '' : 's'} (asked first)</p>}
            </div>
            <div className="mt-4 flex gap-2">
              <Button variant="primary" size="lg" onClick={start}>{queue ? 'Start another' : 'Start'}</Button>
              <a href="#/settings" className="self-center text-sm text-info underline">Change quiz settings</a>
            </div>
          </Panel>
        </div>
      ) : (
        <QuestionView key={queue[index].key + index} q={queue[index]} n={index + 1} total={queue.length} results={results}
          onAnswered={onAnswered} onNext={() => setIndex((i) => i + 1)} />
      )}
    </div>
  )
}

function Summary({ results }: { results: Result[] }) {
  const byTopic = new Map<string, { n: number; ok: number }>()
  for (const r of results) {
    const t = byTopic.get(r.q.topic) ?? { n: 0, ok: 0 }
    t.n++; if (r.correct) t.ok++
    byTopic.set(r.q.topic, t)
  }
  const ok = results.filter((r) => r.correct).length
  return (
    <div className="mb-4">
      <p className="mb-2 text-2xl font-semibold">{ok} / {results.length} <span className="text-base font-normal text-muted">({fmtPct(ok / results.length, 0)})</span></p>
      <ul className="space-y-1 text-sm">
        {[...byTopic.entries()].map(([t, v]) => <li key={t} className="flex justify-between"><span>{topicLabel(t)}</span><span className="font-mono">{v.ok}/{v.n}</span></li>)}
      </ul>
      {results.some((r) => !r.correct) && <p className="mt-2 text-xs text-muted">Missed questions come back later through spaced repetition.</p>}
    </div>
  )
}

function QuestionView({ q, n, total, results, onAnswered, onNext }: {
  q: QuizQuestion; n: number; total: number; results: Result[]; onAnswered: (r: Result) => void; onNext: () => void
}) {
  const quiz = useSettings((s) => s.settings.quiz)
  const [input, setInput] = useState('')
  const [done, setDone] = useState<Result | null>(null)
  const [startedAt] = useState(() => performance.now())
  const [left, setLeft] = useState(quiz.timeLimitSec)
  const inputRef = useRef<HTMLDivElement>(null)

  const submit = (value: string, timedOut = false) => {
    if (done) return
    const parsed = q.answer.kind === 'choice' ? (value === '' ? null : Number(value)) : parseAnswer(value, q.answer.unit)
    const correct = !timedOut && grade(q, parsed, quiz)
    const r: Result = { q, input: q.answer.kind === 'choice' && value !== '' ? q.answer.options[Number(value)] : value, correct, ms: performance.now() - startedAt, timedOut }
    setDone(r)
    onAnswered(r)
  }

  useEffect(() => {
    if (!quiz.timeLimitSec || done) return
    const t = setInterval(() => {
      const remaining = quiz.timeLimitSec - (performance.now() - startedAt) / 1000
      setLeft(Math.max(0, remaining))
      if (remaining <= 0) submit(input, true)
    }, 200)
    return () => clearInterval(t)
  })

  useEffect(() => { inputRef.current?.querySelector('input')?.focus() }, [])

  useHotkeys({
    'quiz.submit': () => (done ? onNext() : submit(input)),
    'quiz.next': () => done && onNext(),
    'quiz.option1': () => q.answer.kind === 'choice' && submit('0'),
    'quiz.option2': () => q.answer.kind === 'choice' && submit('1'),
    'quiz.option3': () => q.answer.kind === 'choice' && q.answer.options.length > 2 && submit('2'),
    'quiz.option4': () => q.answer.kind === 'choice' && q.answer.options.length > 3 && submit('3'),
  })

  const unitHint = q.answer.kind === 'numeric' ? { percent: 'in %', ratio: 'as x (for x : 1)', count: 'whole number', number: 'number' }[q.answer.unit] : ''
  const ok = results.filter((r) => r.correct).length

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_16rem]">
      <Panel>
        <div className="mb-3 flex items-center justify-between gap-2">
          <Badge tone="info">{topicLabel(q.topic)}</Badge>
          <span className="text-xs text-muted">Question {n} of {total}</span>
        </div>
        {quiz.timeLimitSec > 0 && !done && <ProgressBar value={left / quiz.timeLimitSec} className="mb-3" />}
        <p className="mb-4 text-base leading-relaxed">{q.prompt}</p>
        {(q.hero || q.board || q.villain) && (
          <div className="mb-4 flex flex-wrap items-end gap-6">
            {q.hero && <div><p className="mb-1 text-xs text-muted">{q.topic === 'blockers' ? 'Your hand' : 'You'}</p><div className="flex gap-1">{q.hero.map((c) => <PlayingCard key={c} card={c} />)}</div></div>}
            {q.villain && <div><p className="mb-1 text-xs text-muted">Villain</p><div className="flex gap-1">{q.villain.map((c) => <PlayingCard key={c} card={c} />)}</div></div>}
            {q.board && q.board.length > 0 && <div><p className="mb-1 text-xs text-muted">Board</p><div className="flex gap-1 rounded-lg bg-felt p-1.5">{q.board.map((c) => <PlayingCard key={c} card={c} />)}</div></div>}
          </div>
        )}
        {q.answer.kind === 'choice' ? (
          <div className="grid grid-cols-2 gap-2">
            {q.answer.options.map((o, i) => (
              <Button key={o} size="lg" onClick={() => submit(String(i))} disabled={!!done}
                variant={done ? (i === (q.answer as { correct: number }).correct ? 'primary' : 'secondary') : 'secondary'}>{o} <Kbd>{i + 1}</Kbd></Button>
            ))}
          </div>
        ) : (
          <div ref={inputRef} className="flex flex-wrap items-center gap-2">
            <TextInput value={input} onChange={setInput} mono className="h-11 w-40 text-lg" placeholder={unitHint} onEnter={() => (done ? onNext() : submit(input))} />
            {!done && <Button variant="primary" size="lg" onClick={() => submit(input)}>Submit</Button>}
            <span className="text-xs text-muted">{unitHint}</span>
          </div>
        )}
        {done && (
          <div className="animate-in mt-5 space-y-3 border-t border-line pt-4">
            <p className={cx('text-lg font-semibold', done.correct ? 'text-good' : 'text-bad')}>
              {done.correct ? 'Correct' : done.timedOut ? 'Time’s up' : 'Not quite'}
              <span className="ml-3 text-sm font-normal text-fg">Answer: <span className="font-mono">{formatAnswer(q.answer)}</span>{done.input && !done.correct && <span className="text-muted"> (you: {done.input})</span>}</span>
            </p>
            {q.notes.map((nte) => <p key={nte} className="text-sm text-muted">{nte}</p>)}
            {q.explanations.map((e) => <div key={e.id} className="rounded-md border border-line p-3"><MathExplain e={e} /></div>)}
            <Button variant="primary" onClick={onNext}>{n === total ? 'Finish' : 'Next'} <Kbd>Enter</Kbd></Button>
          </div>
        )}
      </Panel>
      <div className="grid h-fit grid-cols-2 gap-2 lg:grid-cols-1">
        <Stat label="Score" value={`${ok} / ${results.length}`} />
        <Stat label="Accuracy" value={results.length ? fmtPct(ok / results.length, 0) : '–'} />
      </div>
    </div>
  )
}
