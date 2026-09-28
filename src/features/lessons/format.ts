/**
 * Lesson file format (content/lessons/*.md):
 *
 *   ---
 *   id: pot-odds
 *   title: Pot odds and equity
 *   level: beginner            (beginner | intermediate)
 *   order: 3
 *   minutes: 12
 *   summary: One sentence shown in the lesson list.
 *   ---
 *   Markdown text with inline {{expressions}} (see expressions.ts) and callouts:
 *     > [!math] …        a mathematical fact
 *     > [!heuristic] …   a strategic heuristic (not a mathematical fact)
 *     > [!note] …
 *   Widgets are fenced blocks:
 *     ```widget quiz
 *     question: …
 *     answer: {{formula requiredEquity pot=15 call=5}}
 *     unit: percent
 *     ```
 *   Config lines are "key: value"; lines indented by two spaces continue the previous value.
 *
 * Rule enforced by tests: prose must not contain hand-typed percentages or "x : 1" odds. Numbers
 * like these must come from an {{expression}} so the engine computes them.
 */
export interface LessonMeta {
  id: string
  title: string
  level: 'beginner' | 'intermediate'
  order: number
  minutes: number
  summary: string
}

export type WidgetType = 'range-grid' | 'equity-calc' | 'quiz' | 'hand'
export const WIDGET_TYPES: WidgetType[] = ['range-grid', 'equity-calc', 'quiz', 'hand']

export type Segment =
  | { kind: 'markdown'; text: string }
  | { kind: 'widget'; type: WidgetType; config: Record<string, string>; index: number }

export interface Lesson {
  meta: LessonMeta
  segments: Segment[]
  source: string
}

export class LessonFormatError extends Error {}

function parseConfig(body: string): Record<string, string> {
  const out: Record<string, string> = {}
  let last: string | null = null
  for (const line of body.split('\n')) {
    if (!line.trim()) continue
    if (/^\s{2,}/.test(line) && last) { out[last] += '\n' + line.trim(); continue }
    const m = line.match(/^([a-zA-Z][\w-]*)\s*:\s?(.*)$/)
    if (!m) throw new LessonFormatError(`Bad widget line: "${line}"`)
    last = m[1]
    out[last] = m[2].trim()
  }
  return out
}

export function parseLesson(raw: string, fallbackId = 'lesson'): Lesson {
  const text = raw.replace(/\r\n/g, '\n')
  const fm = text.match(/^---\n([\s\S]*?)\n---\n?/)
  const metaRaw = fm ? parseConfig(fm[1]) : {}
  const meta: LessonMeta = {
    id: metaRaw.id || fallbackId,
    title: metaRaw.title || fallbackId,
    level: metaRaw.level === 'intermediate' ? 'intermediate' : 'beginner',
    order: Number(metaRaw.order) || 999,
    minutes: Number(metaRaw.minutes) || 10,
    summary: metaRaw.summary || '',
  }
  const body = fm ? text.slice(fm[0].length) : text
  const segments: Segment[] = []
  const re = /^```widget ([\w-]+)\n([\s\S]*?)^```\s*$/gm
  let pos = 0
  let m: RegExpExecArray | null
  let index = 0
  while ((m = re.exec(body))) {
    if (m.index > pos) segments.push({ kind: 'markdown', text: body.slice(pos, m.index) })
    const type = m[1] as WidgetType
    if (!WIDGET_TYPES.includes(type)) throw new LessonFormatError(`Unknown widget "${m[1]}" in ${meta.id}`)
    segments.push({ kind: 'widget', type, config: parseConfig(m[2]), index: index++ })
    pos = m.index + m[0].length
  }
  if (pos < body.length) segments.push({ kind: 'markdown', text: body.slice(pos) })
  return { meta, segments, source: raw }
}

/** Hand-typed numbers that must be computed instead (used by the lesson lint test). */
export function findUncomputedNumbers(text: string): string[] {
  const stripped = text
    .replace(/\{\{[^{}]*\}\}/g, ' ')
    .replace(/`[^`]*`/g, ' ')
  const hits: string[] = []
  for (const re of [/\d+(?:[.,]\d+)?\s?%/g, /\b\d+(?:\.\d+)?\s?(?:to|:)\s?1\b/g]) {
    for (const m of stripped.matchAll(re)) hits.push(m[0])
  }
  return hits
}

/** All inline expressions in a string. */
export function expressionsIn(text: string): string[] {
  return [...text.matchAll(/\{\{([^{}]+)\}\}/g)].map((m) => m[1])
}
