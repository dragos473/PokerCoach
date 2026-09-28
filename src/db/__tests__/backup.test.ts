import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach } from 'vitest'
import { PokerDB, setDbForTests, getDb } from '../db'
import { exportAll, importAll, validateBackup, BackupError, clearAll } from '../backup'

beforeEach(async () => {
  setDbForTests(new PokerDB('test-' + Math.random()))
})

describe('backup', () => {
  it('rejects files that are not PokerCoach backups', () => {
    expect(() => validateBackup(null)).toThrow(BackupError)
    expect(() => validateBackup({ app: 'other' })).toThrow(/not a PokerCoach/)
    expect(() => validateBackup({ app: 'pokercoach', schemaVersion: 99, tables: {} })).toThrow(/newer/)
    expect(() => validateBackup({ app: 'pokercoach', schemaVersion: 1, tables: { ranges: 'x' } })).toThrow(/not a list/)
  })

  it('ignores unknown tables', () => {
    const b = validateBackup({ app: 'pokercoach', schemaVersion: 1, tables: { ranges: [], mystery: [{ a: 1 }] } })
    expect(Object.keys(b.tables)).toEqual(['ranges'])
  })

  it('round-trips data through export and import (replace and merge)', async () => {
    const db = getDb()
    await db.settings.put({ key: 'app', value: { appearance: { theme: 'light' } } })
    await db.lessonProgress.put({ lessonId: 'pot-odds', sectionsSeen: ['a'], updatedAt: 1 })
    const backup = validateBackup(JSON.parse(JSON.stringify(await exportAll())))
    await clearAll()
    expect(await db.settings.count()).toBe(0)

    await importAll(backup, 'replace')
    expect((await db.settings.get('app'))?.value).toEqual({ appearance: { theme: 'light' } })
    expect(await db.lessonProgress.count()).toBe(1)

    await db.lessonProgress.put({ lessonId: 'outs', sectionsSeen: [], updatedAt: 2 })
    await importAll(backup, 'merge')
    expect(await db.lessonProgress.count()).toBe(2)
    await importAll(backup, 'replace')
    expect(await db.lessonProgress.count()).toBe(1)
  })
})
