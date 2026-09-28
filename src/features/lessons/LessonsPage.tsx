/** Lesson list and lesson reader with progress tracking. */
import { useEffect, useState } from 'react'
import { LESSONS } from './loader'
import { Markdown } from './Markdown'
import { Widget } from './widgets'
import { getDb } from '../../db/db'
import type { LessonProgress } from '../../db/types'
import { Badge, Button, EmptyState, PageHeader, ProgressBar } from '../../components/ui'
import { CheckIcon } from '../../components/icons'
import { fmtPct } from '../../lib/format'
import { navigate } from '../../app/router'

function useProgress(): [Record<string, LessonProgress>, () => void] {
  const [map, setMap] = useState<Record<string, LessonProgress>>({})
  const load = () => { getDb().lessonProgress.toArray().then((rows) => setMap(Object.fromEntries(rows.map((r) => [r.lessonId, r])))).catch(() => {}) }
  useEffect(load, [])
  return [map, load]
}

export function LessonsPage() {
  const [progress] = useProgress()
  const done = LESSONS.filter((l) => progress[l.meta.id]?.completedAt).length
  return (
    <div>
      <PageHeader title="Lessons" subtitle={<>Every number in the lessons is computed live by the engine (click it to see how). Add your own lessons as Markdown files in <code className="font-mono">content/lessons/</code>.</>} />
      {LESSONS.length === 0 ? <EmptyState title="No lessons found">Add Markdown files to content/lessons/.</EmptyState> : (
        <>
          <div className="mb-6 max-w-md">
            <div className="mb-1 flex justify-between text-sm"><span>Curriculum progress</span><span className="font-mono">{done} / {LESSONS.length}</span></div>
            <ProgressBar value={done / LESSONS.length} />
          </div>
          {(['beginner', 'intermediate'] as const).map((level) => (
            <section key={level} className="mb-6">
              <h2 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted">{level}</h2>
              <ol className="grid gap-2 sm:grid-cols-2">
                {LESSONS.filter((l) => l.meta.level === level).map((l) => {
                  const p = progress[l.meta.id]
                  return (
                    <li key={l.meta.id}>
                      <a href={`#/lessons/${l.meta.id}`} className="flex h-full items-start gap-3 rounded-lg border border-line bg-surface p-3 transition-ui hover:border-muted/50">
                        <span className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs ${p?.completedAt ? 'bg-good text-white' : 'bg-surface-2 text-muted'}`}>
                          {p?.completedAt ? <CheckIcon className="h-4 w-4" /> : LESSONS.indexOf(l) + 1}
                        </span>
                        <span className="min-w-0">
                          <span className="block text-sm font-medium">{l.meta.title}</span>
                          <span className="block text-xs text-muted">{l.meta.summary}</span>
                          <span className="mt-1 flex gap-2 text-[0.7rem] text-muted">
                            <span>{l.meta.minutes} min</span>
                            {p?.quizScore !== undefined && <span>quiz {fmtPct(p.quizScore, 0)}</span>}
                          </span>
                        </span>
                      </a>
                    </li>
                  )
                })}
              </ol>
            </section>
          ))}
        </>
      )}
    </div>
  )
}

export function LessonPage({ id }: { id: string }) {
  const lesson = LESSONS.find((l) => l.meta.id === id)
  const [progress, reload] = useProgress()
  const [results, setResults] = useState<Record<number, boolean>>({})
  useEffect(() => { window.scrollTo(0, 0); setResults({}) }, [id])
  if (!lesson) return <EmptyState title="Lesson not found" action={<a href="#/lessons" className="text-info underline">All lessons</a>} />

  const quizIdx = lesson.segments.filter((s) => s.kind === 'widget' && s.type === 'quiz').map((s) => (s as { index: number }).index)
  const answered = quizIdx.filter((i) => i in results).length
  const correct = quizIdx.filter((i) => results[i]).length
  const p = progress[lesson.meta.id]
  const pos = LESSONS.indexOf(lesson)
  const prev = LESSONS[pos - 1], next = LESSONS[pos + 1]

  const complete = async () => {
    const score = quizIdx.length ? correct / quizIdx.length : undefined
    await getDb().lessonProgress.put({ lessonId: lesson.meta.id, sectionsSeen: [], completedAt: Date.now(), quizScore: score, updatedAt: Date.now() })
    reload()
  }

  return (
    <article className="mx-auto max-w-3xl">
      <a href="#/lessons" className="text-xs text-muted hover:text-fg">← All lessons</a>
      <div className="mb-2 mt-2 flex flex-wrap items-center gap-2">
        <Badge tone="info">{lesson.meta.level}</Badge>
        <span className="text-xs text-muted">{lesson.meta.minutes} min</span>
        {p?.completedAt && <Badge tone="good">completed</Badge>}
      </div>
      <div className="prose-lesson">
        <h1>{lesson.meta.title}</h1>
        {lesson.segments.map((s, i) => s.kind === 'markdown'
          ? <Markdown key={i} text={s.text} />
          : <Widget key={i} type={s.type} config={s.config} onQuizResult={(ok) => setResults((r) => ({ ...r, [s.index]: ok }))} />)}
      </div>
      <div className="mt-8 rounded-lg border border-line bg-surface p-4">
        {quizIdx.length > 0 && <p className="mb-2 text-sm">Quiz: {answered} of {quizIdx.length} answered{answered > 0 && `, ${correct} correct`}.</p>}
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary" onClick={complete} disabled={answered < quizIdx.length}>{p?.completedAt ? 'Complete again (update score)' : 'Mark lesson complete'}</Button>
          {answered < quizIdx.length && <span className="text-xs text-muted">Answer every quiz block to complete the lesson.</span>}
        </div>
      </div>
      <nav className="mt-6 flex justify-between gap-2 text-sm">
        {prev ? <Button variant="ghost" onClick={() => navigate(`/lessons/${prev.meta.id}`)}>← {prev.meta.title}</Button> : <span />}
        {next && <Button variant="ghost" onClick={() => navigate(`/lessons/${next.meta.id}`)}>{next.meta.title} →</Button>}
      </nav>
    </article>
  )
}
