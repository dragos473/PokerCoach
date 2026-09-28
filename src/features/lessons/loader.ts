/** Loads every lesson file from content/lessons (bundled at build time; add files and rebuild / reload). */
import { parseLesson, type Lesson } from './format'

const files = import.meta.glob('/content/lessons/*.md', { query: '?raw', import: 'default', eager: true }) as Record<string, string>

export const LESSONS: Lesson[] = Object.entries(files)
  .map(([path, raw]) => parseLesson(raw, path.split('/').pop()!.replace(/\.md$/, '')))
  .sort((a, b) => a.meta.order - b.meta.order || a.meta.title.localeCompare(b.meta.title))
