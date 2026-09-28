/**
 * Spaced repetition for missed quiz questions (a simplified SM-2).
 *   wrong answer   → ease −0.2 (min 1.3), interval 0, due in 10 minutes, lapses + 1
 *   correct review → interval 1 day, then × ease; ease +0.1 (max 3)
 * Only questions answered wrongly at least once enter the system.
 */
import type { SrsItem } from '../../../db/types'
import type { QuizQuestion } from './questions'

const DAY = 24 * 60 * 60 * 1000

export function updateSrs(item: SrsItem | undefined, q: Pick<QuizQuestion, 'key' | 'topic' | 'params'>, correct: boolean, now: number): SrsItem | undefined {
  if (!item && correct) return undefined
  const base: SrsItem = item ?? { questionKey: q.key, topic: q.topic, params: q.params, ease: 2.5, intervalDays: 0, due: now, lapses: 0, lastResult: false }
  if (!correct) {
    return { ...base, ease: Math.max(1.3, base.ease - 0.2), intervalDays: 0, due: now + 10 * 60 * 1000, lapses: base.lapses + 1, lastResult: false }
  }
  const intervalDays = base.intervalDays === 0 ? 1 : Math.round(base.intervalDays * base.ease)
  return { ...base, ease: Math.min(3, base.ease + 0.1), intervalDays, due: now + intervalDays * DAY, lastResult: true }
}

export function dueItems(items: SrsItem[], now: number, topics: string[]): SrsItem[] {
  return items.filter((i) => i.due <= now && topics.includes(i.topic)).sort((a, b) => a.due - b.due)
}
