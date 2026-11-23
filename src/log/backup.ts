import type { LogEntry } from './entries'
import { cleanEntry, sortAndDedupe } from './entries'

// A backup is a small JSON file the user keeps. It has a format name and version so a
// later version of the app can tell it apart from any other JSON file and upgrade it.

export const BACKUP_FORMAT = 'macro-calculator-log'
export const BACKUP_VERSION = 1
export const MAX_BACKUP_BYTES = 5_000_000

export function backupText(entries: LogEntry[], now = new Date()): string {
  return JSON.stringify({ format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: now.toISOString(), entries }, null, 2)
}

export type BackupResult = { ok: true; entries: LogEntry[]; skipped: number } | { ok: false; message: string }

export function readBackup(text: string): BackupResult {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return { ok: false, message: 'That file is not a log backup (it is not valid JSON).' }
  }
  if (!data || typeof data !== 'object' || (data as Record<string, unknown>).format !== BACKUP_FORMAT) {
    return { ok: false, message: 'That file is not a log backup from this app.' }
  }
  const backup = data as Record<string, unknown>
  if (typeof backup.version !== 'number' || backup.version > BACKUP_VERSION) {
    return { ok: false, message: 'That backup comes from a newer version of the app. Reload the page and try again.' }
  }
  if (!Array.isArray(backup.entries)) return { ok: false, message: 'That backup has no log entries.' }

  const cleaned = backup.entries.map(cleanEntry).filter((entry): entry is LogEntry => entry !== null)
  return { ok: true, entries: sortAndDedupe(cleaned), skipped: backup.entries.length - cleaned.length }
}

export interface MergeResult {
  entries: LogEntry[]
  added: number
  replaced: number
}

/** Days in the backup replace the same days on this device; every other day is kept. */
export function mergeBackup(current: LogEntry[], incoming: LogEntry[]): MergeResult {
  const existingDates = new Set(current.map(entry => entry.date))
  const replaced = incoming.filter(entry => existingDates.has(entry.date)).length
  return { entries: sortAndDedupe([...current, ...incoming]), added: incoming.length - replaced, replaced }
}
