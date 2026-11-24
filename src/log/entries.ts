import { isIsoDate } from './dates'
import { LIMITS } from '../engine/validate'

/** One day in the log. Weight is kept in kg so switching units never changes what was saved. */
export interface LogEntry {
  date: string
  weightKg?: number
  calories?: number
  protein?: number
  carbs?: number
  fats?: number
  /** The user said not all of the day's food is in `calories`. The check-in leaves such days out. */
  incomplete?: true
}

/** Calories and macros of one food, as the food search works them out. */
export interface FoodAmounts {
  calories: number
  protein: number | null
  carbs: number | null
  fats: number | null
}

export const LOG_LIMITS = {
  calories: { min: 0, max: 10_000 },
  grams: { min: 0, max: 1_000 },
  earliestDate: '2000-01-01',
}

const LOG_KEY = 'macroCalculator.log.v1'

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)

const inRange = (value: number, range: { min: number; max: number }) => value >= range.min && value <= range.max

/**
 * Checks one entry from storage or a backup file. Bad fields are dropped; the entry is
 * kept only if it still has a valid date and at least a weight or calories.
 */
export function cleanEntry(item: unknown): LogEntry | null {
  if (!item || typeof item !== 'object') return null
  const raw = item as Record<string, unknown>
  if (typeof raw.date !== 'string' || !isIsoDate(raw.date) || raw.date < LOG_LIMITS.earliestDate) return null

  const entry: LogEntry = { date: raw.date }
  if (isFiniteNumber(raw.weightKg) && inRange(raw.weightKg, LIMITS.weightKg)) entry.weightKg = raw.weightKg
  if (isFiniteNumber(raw.calories) && inRange(raw.calories, LOG_LIMITS.calories)) entry.calories = Math.round(raw.calories)
  for (const macro of ['protein', 'carbs', 'fats'] as const) {
    const grams = raw[macro]
    if (isFiniteNumber(grams) && inRange(grams, LOG_LIMITS.grams)) entry[macro] = Math.round(grams)
  }
  if (entry.weightKg === undefined && entry.calories === undefined) return null
  if (raw.incomplete === true && entry.calories !== undefined) entry.incomplete = true
  return entry
}

/** Oldest first, one entry per date (a later one wins). */
export function sortAndDedupe(entries: LogEntry[]): LogEntry[] {
  const byDate = new Map<string, LogEntry>()
  for (const entry of entries) byDate.set(entry.date, entry)
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))
}

export function loadLog(): LogEntry[] {
  try {
    const text = localStorage.getItem(LOG_KEY)
    if (text === null) return []
    const data: unknown = JSON.parse(text)
    if (!Array.isArray(data)) return []
    return sortAndDedupe(data.map(cleanEntry).filter((entry): entry is LogEntry => entry !== null))
  } catch {
    return []
  }
}

/** Returns false when the browser blocks storage or it is full. */
export function saveLog(entries: LogEntry[]): boolean {
  try {
    localStorage.setItem(LOG_KEY, JSON.stringify(entries))
    return true
  } catch {
    return false
  }
}

/** Adds an entry, replacing any entry already on that date. */
export function upsertEntry(entries: LogEntry[], entry: LogEntry): LogEntry[] {
  return sortAndDedupe([...entries, entry])
}

/**
 * Adds a food to a saved day (or starts the day), for the scan button outside the Log tab.
 * Returns null when the day would go over the log's limits, so a typo in the amount is not
 * saved. A saved day keeps whole numbers, so each food is rounded as it is added.
 */
export function addFoodToDay(entries: LogEntry[], date: string, food: FoodAmounts): LogEntry[] | null {
  const day: LogEntry = { ...(entries.find(entry => entry.date === date) ?? { date }) }
  day.calories = Math.round((day.calories ?? 0) + food.calories)
  if (!inRange(day.calories, LOG_LIMITS.calories)) return null
  for (const macro of ['protein', 'carbs', 'fats'] as const) {
    const grams = food[macro]
    if (grams === null) continue
    day[macro] = Math.round((day[macro] ?? 0) + grams)
    if (!inRange(day[macro] as number, LOG_LIMITS.grams)) return null
  }
  return upsertEntry(entries, day)
}

export function removeEntry(entries: LogEntry[], date: string): LogEntry[] {
  return entries.filter(entry => entry.date !== date)
}
