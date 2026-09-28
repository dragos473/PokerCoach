/**
 * IndexedDB via Dexie. One database, all tables listed in CLAUDE.md.
 * Bump the version and add an upgrade function when the schema changes.
 */
import Dexie, { type Table } from 'dexie'
import type { HandRecord, LessonProgress, QuizAttempt, SessionRecord, SrsItem, StoredRange } from './types'

export interface SettingsRow {
  key: string
  value: unknown
}

export class PokerDB extends Dexie {
  settings!: Table<SettingsRow, string>
  ranges!: Table<StoredRange, string>
  quizAttempts!: Table<QuizAttempt, number>
  srsItems!: Table<SrsItem, string>
  lessonProgress!: Table<LessonProgress, string>
  sessions!: Table<SessionRecord, string>
  hands!: Table<HandRecord, string>

  constructor(name = 'pokercoach') {
    super(name)
    this.version(1).stores({
      settings: 'key',
      ranges: 'id, name, format, scenario, builtIn, updatedAt',
      quizAttempts: '++id, topic, questionKey, at',
      srsItems: 'questionKey, topic, due',
      lessonProgress: 'lessonId',
      sessions: 'id, startedAt',
      hands: 'id, sessionId, at',
    })
  }
}

export const TABLE_NAMES = ['settings', 'ranges', 'quizAttempts', 'srsItems', 'lessonProgress', 'sessions', 'hands'] as const
export type TableName = (typeof TABLE_NAMES)[number]

let instance: PokerDB | null = null
export function getDb(): PokerDB {
  if (!instance) instance = new PokerDB()
  return instance
}

/** Tests only: use an isolated database. */
export function setDbForTests(db: PokerDB): void {
  instance = db
}
