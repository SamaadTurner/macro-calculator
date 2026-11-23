import { isIsoDate } from '../log/dates'
import type { Goal } from '../engine/types'

/** A saved weekly check-in: what the app estimated and the targets the user took. */
export interface CheckIn {
  date: string
  expenditure: number
  calories: number
  protein: number
  carbs: number
  fats: number
  goal: Goal
}

const CHECKINS_KEY = 'macroCalculator.checkins.v1'
const GOALS: Goal[] = ['cutting', 'maintain', 'bulking']
export const CHECK_IN_EVERY_DAYS = 7

const isWholeInRange = (value: unknown, min: number, max: number): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max

function cleanCheckIn(item: unknown): CheckIn | null {
  if (!item || typeof item !== 'object') return null
  const raw = item as Record<string, unknown>
  if (typeof raw.date !== 'string' || !isIsoDate(raw.date)) return null
  if (typeof raw.goal !== 'string' || !GOALS.includes(raw.goal as Goal)) return null
  if (!isWholeInRange(raw.expenditure, 500, 10_000) || !isWholeInRange(raw.calories, 500, 10_000)) return null
  if (!isWholeInRange(raw.protein, 0, 1000) || !isWholeInRange(raw.carbs, 0, 2000) || !isWholeInRange(raw.fats, 0, 1000)) return null
  return {
    date: raw.date,
    expenditure: raw.expenditure,
    calories: raw.calories,
    protein: raw.protein,
    carbs: raw.carbs,
    fats: raw.fats,
    goal: raw.goal as Goal,
  }
}

/** Oldest first, one per date. */
export function loadCheckIns(): CheckIn[] {
  try {
    const text = localStorage.getItem(CHECKINS_KEY)
    if (text === null) return []
    const data: unknown = JSON.parse(text)
    if (!Array.isArray(data)) return []
    const byDate = new Map<string, CheckIn>()
    for (const item of data) {
      const checkIn = cleanCheckIn(item)
      if (checkIn) byDate.set(checkIn.date, checkIn)
    }
    return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))
  } catch {
    return []
  }
}

/** Adds the check-in (replacing one on the same date) and returns the new list, or null if storage is blocked. */
export function saveCheckIn(checkIns: CheckIn[], checkIn: CheckIn): CheckIn[] | null {
  const next = [...checkIns.filter(item => item.date !== checkIn.date), checkIn].sort((a, b) => a.date.localeCompare(b.date))
  try {
    localStorage.setItem(CHECKINS_KEY, JSON.stringify(next))
    return next
  } catch {
    return null
  }
}

/** The newest check-in before today: the one the weekly limit is measured from. */
export function previousCheckIn(checkIns: CheckIn[], today: string): CheckIn | undefined {
  return [...checkIns].reverse().find(item => item.date < today)
}
