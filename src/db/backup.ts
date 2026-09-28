/**
 * Export / import of all user data as one JSON file.
 * Format: { app: 'pokercoach', schemaVersion, exportedAt, tables: { [table]: rows[] } }
 */
import { getDb, TABLE_NAMES, type TableName } from './db'

export const BACKUP_SCHEMA_VERSION = 1

export interface BackupFile {
  app: 'pokercoach'
  schemaVersion: number
  exportedAt: string
  tables: Partial<Record<TableName, unknown[]>>
}

export class BackupError extends Error {}

/** Validate an untrusted parsed JSON value. Returns the backup or throws BackupError. */
export function validateBackup(data: unknown): BackupFile {
  if (typeof data !== 'object' || data === null) throw new BackupError('Not a JSON object')
  const d = data as Record<string, unknown>
  if (d.app !== 'pokercoach') throw new BackupError('This file is not a PokerCoach backup')
  if (typeof d.schemaVersion !== 'number') throw new BackupError('Missing schemaVersion')
  if (d.schemaVersion > BACKUP_SCHEMA_VERSION) {
    throw new BackupError(`Backup is from a newer version (${d.schemaVersion}); update the app first`)
  }
  if (typeof d.tables !== 'object' || d.tables === null) throw new BackupError('Missing tables')
  const tables: BackupFile['tables'] = {}
  for (const [name, rows] of Object.entries(d.tables as Record<string, unknown>)) {
    if (!(TABLE_NAMES as readonly string[]).includes(name)) continue // ignore unknown tables
    if (!Array.isArray(rows)) throw new BackupError(`Table "${name}" is not a list`)
    if (!rows.every((r) => typeof r === 'object' && r !== null)) throw new BackupError(`Table "${name}" has invalid rows`)
    tables[name as TableName] = rows
  }
  return { app: 'pokercoach', schemaVersion: d.schemaVersion, exportedAt: String(d.exportedAt ?? ''), tables }
}

export async function exportAll(): Promise<BackupFile> {
  const db = getDb()
  const tables: BackupFile['tables'] = {}
  for (const name of TABLE_NAMES) tables[name] = await db.table(name).toArray()
  return { app: 'pokercoach', schemaVersion: BACKUP_SCHEMA_VERSION, exportedAt: new Date().toISOString(), tables }
}

/**
 * Import a backup. 'replace' clears every table present in the file first;
 * 'merge' upserts rows by primary key and keeps everything else.
 */
export async function importAll(backup: BackupFile, mode: 'replace' | 'merge' = 'replace'): Promise<Record<string, number>> {
  const db = getDb()
  const counts: Record<string, number> = {}
  const names = Object.keys(backup.tables) as TableName[]
  await db.transaction('rw', names.map((n) => db.table(n)), async () => {
    for (const name of names) {
      const rows = backup.tables[name] ?? []
      const table = db.table(name)
      if (mode === 'replace') await table.clear()
      await table.bulkPut(rows)
      counts[name] = rows.length
    }
  })
  return counts
}

export async function clearAll(): Promise<void> {
  const db = getDb()
  await db.transaction('rw', TABLE_NAMES.map((n) => db.table(n)), async () => {
    for (const name of TABLE_NAMES) await db.table(name).clear()
  })
}

/** Trigger a browser download of a text/JSON file. */
export function downloadFile(filename: string, content: string, type = 'application/json'): void {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
