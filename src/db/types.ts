/** Persisted record types (IndexedDB). See CLAUDE.md "Data schemas". */

/** Exact sparse range weights: [comboIndex, weight 0..1][]. */
export type SparseWeights = [number, number][]

export type RangeFormat = '6max-cash' | '9max-cash' | 'mtt' | 'custom'
export type RangeScenario = 'rfi' | 'vs-open' | 'vs-3bet' | 'bb-defence' | 'push-fold' | 'call-shove' | 'custom'

/**
 * A range chart. `actions` holds one weight layer per action (e.g. raise / call). Anything not in
 * a layer is a fold. For a simple single range, use one layer named "range".
 */
export interface StoredRange {
  id: string
  name: string
  tags: string[]
  format: RangeFormat
  scenario: RangeScenario
  position?: string
  vsPosition?: string
  stackBB?: number
  actions: Record<string, SparseWeights>
  assumptions?: string
  notes?: string
  builtIn: boolean
  /** For built-in charts the user edited: the id of the original baseline. */
  derivedFrom?: string
  createdAt: number
  updatedAt: number
}

export interface QuizAttempt {
  id?: number
  topic: string
  questionKey: string
  prompt: string
  answer: string
  expected: string
  correct: boolean
  ms: number
  at: number
}

export interface SrsItem {
  questionKey: string
  topic: string
  /** Serialized question parameters so the exact question can be regenerated. */
  params: unknown
  ease: number
  intervalDays: number
  due: number
  lapses: number
  lastResult: boolean
}

export interface LessonProgress {
  lessonId: string
  sectionsSeen: string[]
  completedAt?: number
  quizScore?: number
  updatedAt: number
}

export interface SessionRecord {
  id: string
  startedAt: number
  endedAt?: number
  config: unknown
  stats: {
    hands: number
    netBB: number
    decisions: number
    mistakes: number
    evLossBB: number
  }
}

export interface HandRecord {
  id: string
  sessionId: string
  at: number
  /** Full serialized hand (see features/freeplay/types). */
  data: unknown
  /** Plain-text hand history for export. */
  text: string
  netBB: number
  evLossBB: number
  mistakeTags: string[]
}
